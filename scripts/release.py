#!/usr/bin/env python3
"""Build and validate the deterministic PrivSight release evidence/archive."""
import hashlib,json,os,re,sys,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]; ART=ROOT/"artifacts"; REL=ROOT/"release"
ARCHIVE=REL/"privsight-0.1.0-rc1.zip"; MANIFEST=ART/"sha256-manifest.json"
FORBIDDEN_PARTS={".git",".hermes","node_modules",".venv","venv","__pycache__",".pytest_cache",".cache","generated",".kaggle-input","coverage"}
FORBIDDEN_NAMES={"kaggle.json",".env",".env.local",".env.production",".npmrc",".pypirc","credentials","credentials.json","id_rsa","id_ed25519"}
HASH_ROOTS=[ROOT/"apps/extension/public/models",ROOT/"apps/extension/.output/chrome-mv3",ART]

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def excluded(p):
 rel=p.relative_to(ROOT)
 return bool(set(rel.parts)&FORBIDDEN_PARTS or p.name in FORBIDDEN_NAMES or rel.parts[:1]==("release",) or rel.parts[:3] in {("model-training","privacy-models","output"),("model-training","ui-detector","kaggle-output")} or p==MANIFEST or p.suffix in {".pyc"})
def files(): return sorted((p for p in ROOT.rglob("*") if p.is_file() and not excluded(p)),key=lambda p:p.relative_to(ROOT).as_posix())
def package_records():
 lock=(ROOT/"pnpm-lock.yaml").read_text()
 names={m.group(1) or m.group(2) for m in re.finditer(r"^  (?:'([^']+)'|([^:\s]+))@[^:]+:$",lock,re.M)}
 uv=ROOT/"apps/server/uv.lock"
 py=set(re.findall(r'^name = "([^"]+)"',uv.read_text(),re.M)) if uv.exists() else set()
 return sorted(names),sorted(py)
def write_sbom():
 js,py=package_records(); models=[("privsight-ui6","0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9","Apache-2.0"),("ppocrv3-en-text-detection","03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587","Apache-2.0"),("ultraface-rfb-320","34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017","MIT")]
 def doc(name,packages): return {"spdxVersion":"SPDX-2.3","dataLicense":"CC0-1.0","SPDXID":"SPDXRef-DOCUMENT","name":name,"documentNamespace":f"https://privsight.invalid/spdx/{name}-0.1.0-rc1","creationInfo":{"created":"2026-09-13T00:00:00Z","creators":["Tool: scripts/release.py"]},"packages":packages}
 software=[]
 for ecosystem,names in (("npm",js),("pypi",py)):
  for i,n in enumerate(names): software.append({"name":n,"SPDXID":f"SPDXRef-{ecosystem}-{i}","downloadLocation":"NOASSERTION","filesAnalyzed":False,"licenseConcluded":"NOASSERTION","licenseDeclared":"NOASSERTION","externalRefs":[{"referenceCategory":"PACKAGE-MANAGER","referenceType":"purl","referenceLocator":f"pkg:{ecosystem}/{n}"}]})
 modelpk=[{"name":n,"SPDXID":f"SPDXRef-Model-{i}","downloadLocation":"NOASSERTION","filesAnalyzed":False,"licenseConcluded":lic,"licenseDeclared":lic,"checksums":[{"algorithm":"SHA256","checksumValue":h}]} for i,(n,h,lic) in enumerate(models)]
 (ART/"sbom-software.spdx.json").write_text(json.dumps(doc("privsight-software",software),indent=2)+"\n")
 (ART/"sbom-models.spdx.json").write_text(json.dumps(doc("privsight-models",modelpk),indent=2)+"\n")
def write_manifest():
 selected=[]
 for base in HASH_ROOTS:
  if base.exists(): selected.extend(p for p in base.rglob("*") if p.is_file() and p!=MANIFEST)
 selected.extend([ROOT/"docs/THIRD_PARTY_LICENSES.md",ROOT/"docs/architecture-final.md",ROOT/"docs/security-final.md"])
 unique=sorted(set(selected),key=lambda p:p.relative_to(ROOT).as_posix())
 MANIFEST.write_text(json.dumps({"schemaVersion":"1.0","algorithm":"SHA-256","files":[{"path":p.relative_to(ROOT).as_posix(),"sha256":sha(p),"bytes":p.stat().st_size} for p in unique]},indent=2)+"\n")
def make_archive():
 if ARCHIVE.exists(): ARCHIVE.unlink()
 with zipfile.ZipFile(ARCHIVE,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for p in files()+[MANIFEST]:
   info=zipfile.ZipInfo(p.relative_to(ROOT).as_posix(),(1980,1,1,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes(),compresslevel=9)
 (REL/"SHA256SUMS").write_text(f"{sha(ARCHIVE)}  {ARCHIVE.name}\n")
def check():
 errors=[]
 required=[ART/"evaluation-report.json",ART/"demo-gate-report.json",ART/"browser-smoke-report.json",ART/"sbom-software.spdx.json",ART/"sbom-models.spdx.json",ROOT/"docs/THIRD_PARTY_LICENSES.md",ROOT/"docs/security-final.md",ROOT/"docs/architecture-final.md",MANIFEST,ARCHIVE]
 errors += [f"missing {p.relative_to(ROOT)}" for p in required if not p.exists()]
 if errors: raise SystemExit("\n".join(errors))
 manifest=json.loads(MANIFEST.read_text())
 for item in manifest["files"]:
  p=ROOT/item["path"]
  if not p.exists() or sha(p)!=item["sha256"]: errors.append(f"hash mismatch: {item['path']}")
 smoke=json.loads((ART/"browser-smoke-report.json").read_text())
 if smoke.get("summary")!={"passed":5,"total":5,"status":"PASS"}: errors.append("real MV3 smoke evidence is not 5/5 PASS")
 demo=json.loads((ART/"demo-gate-report.json").read_text())
 if demo.get("requiredEvidence",{}).get("controlledFixtureTests",{}).get("passed")!=5: errors.append("controlled fixture evidence is not 5/5")
 evaluation=json.loads((ART/"evaluation-report.json").read_text())
 if any(m.get("requiredEvidence") and m.get("status")!="PASS" for m in evaluation.get("metrics",{}).values()): errors.append("required evaluation metric is not PASS")
 expected_models={"apps/extension/public/models/privsight-ui6.onnx":"0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9","apps/extension/public/models/text_detection_en_ppocrv3_2023may.onnx":"03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587","apps/extension/public/models/version-RFB-320.onnx":"34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017"}
 for name,digest in expected_models.items():
  if sha(ROOT/name)!=digest: errors.append(f"packaged model mismatch: {name}")
 q=json.loads((ROOT/"model-training/qwen-planner/evidence/kaggle-v5/summary.json").read_text())
 if (q.get("valid_actions"),q.get("cases"),q.get("adversarial_rejections"))!=(20,20,2): errors.append("Qwen batch evidence incomplete")
 remote=re.compile(rb"<(?:script|link)[^>]+(?:src|href)=[\"']https?://",re.I)
 for p in files():
  if p.suffix in {".html",".js",".mjs",".ts",".tsx"} and remote.search(p.read_bytes()): errors.append(f"remote executable reference: {p.relative_to(ROOT)}")
 with zipfile.ZipFile(ARCHIVE) as z:
  names=z.namelist()
  for n in names:
   normalized=n.replace("\\","/"); path=Path(normalized)
   if not normalized or normalized.startswith("/") or re.match(r"^[A-Za-z]:/",normalized) or any(part in {"",".",".."} for part in path.parts): errors.append(f"unsafe archive path: {n}")
   parts=set(path.parts)
   if parts&FORBIDDEN_PARTS or Path(n).name in FORBIDDEN_NAMES or Path(n).suffix.lower() in {".pem",".key",".p12",".pfx"}: errors.append(f"forbidden archive member: {n}")
  if "artifacts/sha256-manifest.json" not in names: errors.append("archive lacks hash manifest")
 expected=(REL/"SHA256SUMS").read_text().split()[0]
 if sha(ARCHIVE)!=expected: errors.append("archive checksum mismatch")
 for p in [ART/"sbom-software.spdx.json",ART/"sbom-models.spdx.json"]:
  if json.loads(p.read_text()).get("spdxVersion")!="SPDX-2.3": errors.append(f"invalid SPDX header: {p.name}")
 if errors: raise SystemExit("RELEASE CHECK FAILED\n"+"\n".join(errors))
 print(json.dumps({"status":"PASS","manifestEntries":len(manifest["files"]),"archive":str(ARCHIVE.relative_to(ROOT)),"archiveSha256":sha(ARCHIVE),"mv3Runs":"5/5"}))
def prepare():
 ART.mkdir(exist_ok=True);REL.mkdir(exist_ok=True);write_sbom();write_manifest();make_archive();check()
if __name__=="__main__":
 {"prepare":prepare,"check":check}.get(sys.argv[1] if len(sys.argv)>1 else "check",check)()