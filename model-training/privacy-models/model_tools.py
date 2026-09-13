#!/usr/bin/env python3
"""Download pinned artifacts and validate hashes plus ONNX graph contracts."""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path
from typing import Any

import onnx

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "manifests" / "models.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _shape(value: Any) -> list[int | str]:
    result: list[int | str] = []
    for dim in value.type.tensor_type.shape.dim:
        if dim.HasField("dim_value"):
            result.append(dim.dim_value)
        else:
            result.append(dim.dim_param or "?")
    return result


def contract_from_model(path: Path) -> dict[str, Any]:
    model = onnx.load(path, load_external_data=False)
    initializer_names = {item.name for item in model.graph.initializer}
    inputs = [item for item in model.graph.input if item.name not in initializer_names]
    tensor = lambda item: {"name": item.name, "dtype": "float32", "shape": _shape(item)}
    return {
        "ir_version": model.ir_version,
        "opsets": sorted({entry.version for entry in model.opset_import}),
        "inputs": [tensor(item) for item in inputs],
        "outputs": [tensor(item) for item in model.graph.output],
    }


def validate_artifact(path: Path, entry: dict[str, Any]) -> dict[str, Any]:
    if not path.is_file():
        raise ValueError(f"artifact missing: {path}")
    actual_hash = sha256(path)
    if actual_hash != entry["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path}: {actual_hash}")
    if path.stat().st_size != entry["bytes"]:
        raise ValueError(f"size mismatch for {path}")
    model = onnx.load(path)
    onnx.checker.check_model(model, full_check=True)
    contract = contract_from_model(path)
    if contract != entry["contract"]["graph"]:
        raise ValueError(f"contract mismatch for {path}: {contract}")
    return {"path": str(path.resolve()), "sha256": actual_hash, "contract": contract}


def download(entry: dict[str, Any]) -> Path:
    target = ROOT / entry["artifact_path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    urllib.request.urlretrieve(entry["source_url"], temporary)
    temporary.replace(target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("fetch", "validate"))
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    reports = []
    for entry in manifest["models"]:
        path = ROOT / entry["artifact_path"]
        if args.command == "fetch":
            path = download(entry)
        reports.append(validate_artifact(path, entry))
    print(json.dumps({"validated": reports}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
