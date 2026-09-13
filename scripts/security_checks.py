#!/usr/bin/env python3
"""Fail-closed repository security and release audit (stdlib only)."""
from __future__ import annotations
import argparse, hashlib, json, os, re, subprocess, sys, zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MODEL_MANIFEST = ROOT / "model-training/privacy-models/manifests/models.json"
SECRET_PATTERNS = [
    re.compile(rb"AKIA[0-9A-Z]{16}"),
    re.compile(rb"gh[pousr]_[A-Za-z0-9_]{30,}"),
    re.compile(rb"sk-(?:live|test|proj)-[A-Za-z0-9_-]{16,}"),
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"(?i)(?:api[_-]?key|secret|password|passwd|access[_-]?token)\s*[:=]\s*['\"]?([A-Za-z0-9_./+=-]{16,})"),
]
TEXT_SUFFIXES = {".py", ".js", ".mjs", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml", ".md", ".html", ".css", ".txt", ".lock"}
ALLOWED_LARGE = {".onnx"}


def tracked_files(root: Path = ROOT) -> list[Path]:
    result = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root, check=True, capture_output=True)
    return [root / item.decode() for item in result.stdout.split(b"\0") if item]


def scan_secrets(root: Path, paths: list[Path]) -> list[str]:
    findings = []
    for path in paths:
        relative = path.relative_to(root).as_posix()
        if relative == "scripts/test_security_checks.py" or path.name.endswith(".env.example"):
            continue
        if not path.is_file() or (path.suffix.lower() not in TEXT_SUFFIXES and ".env" not in path.name and path.name not in {".npmrc", ".pypirc"}):
            continue
        data = path.read_bytes()
        for line_number, line in enumerate(data.splitlines(), 1):
            if b"${" in line or b"example" in line.lower() or b"sha256" in line.lower() or b"checksum" in line.lower():
                continue
            if any(pattern.search(line) for pattern in SECRET_PATTERNS):
                findings.append(f"{path.relative_to(root)}:{line_number}: possible secret")
    return findings


def archive_member_error(name: str) -> str | None:
    normalized = name.replace("\\", "/")
    if not normalized or normalized.startswith("/") or re.match(r"^[A-Za-z]:/", normalized):
        return "absolute or empty path"
    parts = PurePosixPath(normalized).parts
    if any(part in {"", ".", ".."} for part in parts):
        return "non-canonical/traversal path"
    return None


def audit_archive(path: Path) -> list[str]:
    if not path.exists(): return []
    errors = []
    with zipfile.ZipFile(path) as archive:
        seen: set[str] = set()
        for info in archive.infolist():
            reason = archive_member_error(info.filename)
            if reason: errors.append(f"{path.name}: {reason}: {info.filename}")
            canonical = info.filename.replace("\\", "/")
            if canonical in seen: errors.append(f"{path.name}: duplicate member: {canonical}")
            seen.add(canonical)
            if info.is_dir() or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                errors.append(f"{path.name}: directory/symlink member forbidden: {info.filename}")
    return errors


def audit_network_csp() -> list[str]:
    errors = []
    config = (ROOT / "apps/extension/wxt.config.ts").read_text()
    expected = 'host_permissions: ["http://127.0.0.1:8080/*"]'
    if expected not in config: errors.append("extension host allowlist must contain only local planner")
    csp = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    csp_match = re.search(r"content_security_policy.{0,300}", config, re.S)
    if csp not in config or "unsafe-inline" in config or (csp_match is not None and "https:" in csp_match.group(0)):
        errors.append("extension CSP is missing or permits remote/inline execution")
    url = re.compile(r"https?://[^\s'\"`)]+")
    runtime = [p for p in tracked_files() if p.suffix in {".ts", ".tsx", ".js", ".mjs", ".html"} and ("apps" in p.parts and ("extension" in p.parts or "server" in p.parts) and "tests" not in p.parts)]
    for path in runtime:
        for match in url.findall(path.read_text(errors="ignore")):
            if not (match.startswith("http://127.0.0.1:8080") or match.startswith("https://example.test")):
                errors.append(f"unapproved runtime URL in {path.relative_to(ROOT)}: {match}")
    return errors


def audit_provenance() -> list[str]:
    errors = []
    pnpm = (ROOT / "pnpm-lock.yaml").read_text()
    if "lockfileVersion:" not in pnpm or "integrity: sha512-" not in pnpm:
        errors.append("pnpm lock lacks integrity provenance")
    uv = (ROOT / "apps/server/uv.lock").read_text()
    if "source = { registry = \"https://pypi.org/simple\" }" not in uv or "hash = \"sha256:" not in uv:
        errors.append("uv lock lacks registry/hash provenance")
    manifest = json.loads(MODEL_MANIFEST.read_text())
    records = manifest.get("models", manifest if isinstance(manifest, list) else [])
    for record in records:
        for key in ("artifact_path", "sha256", "license", "source_url", "source_commit"):
            if not record.get(key): errors.append(f"model provenance missing {key}: {record.get('id', '<unknown>')}")
        model = ROOT / "apps/extension/public/models" / Path(record.get("artifact_path", "")).name
        if model.is_file() and hashlib.sha256(model.read_bytes()).hexdigest() != record.get("sha256"):
            errors.append(f"model hash mismatch: {model.name}")
    metadata = json.loads((ROOT / "apps/extension/public/models/privsight-ui6.metadata.json").read_text())
    for key in ("sha256", "training_kernel", "checkpoint_sha256", "upstream_license"):
        if not metadata.get(key): errors.append(f"trained model metadata missing {key}")
    return errors


def audit_large_files(paths: list[Path]) -> list[str]:
    errors=[]
    for path in paths:
        if path.is_file() and path.stat().st_size > 5_000_000 and path.suffix.lower() not in ALLOWED_LARGE:
            errors.append(f"unintended large file ({path.stat().st_size} bytes): {path.relative_to(ROOT)}")
        if path.is_file() and path.suffix.lower() in ALLOWED_LARGE and path.stat().st_size > 15_000_000:
            errors.append(f"model exceeds release size policy: {path.relative_to(ROOT)}")
    return errors


def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument("check", nargs="?", default="all"); args=parser.parse_args()
    paths=tracked_files(); errors=[]
    if args.check in {"all","secrets"}: errors += scan_secrets(ROOT, paths)
    if args.check in {"all","archive"}:
        errors += audit_archive(ROOT / "release/privsight-0.1.0-rc1.zip")
    if args.check in {"all","network"}: errors += audit_network_csp()
    if args.check in {"all","provenance"}: errors += audit_provenance()
    if args.check in {"all","large-files"}: errors += audit_large_files(paths)
    if errors:
        print("SECURITY CHECK FAILED", *errors, sep="\n", file=sys.stderr); return 1
    print(json.dumps({"status":"PASS","check":args.check,"filesScanned":len(paths)})); return 0

if __name__ == "__main__": raise SystemExit(main())
