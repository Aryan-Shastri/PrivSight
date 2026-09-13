#!/usr/bin/env python3
"""Licensed-corpus validation, leakage checks, metrics, and import tooling."""
from __future__ import annotations
import argparse, hashlib, json, shutil
from collections import Counter, defaultdict
from pathlib import Path

REQUIRED_CONTEXT = ("languages", "direction", "contrast", "zoom_percent", "accessibility", "subgroups")
REGION_CLASSES = {"ui", "text", "face", "sensitive"}
SPLITS = {"train", "validation", "test"}

def _sha(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024), b""): h.update(block)
    return h.hexdigest()

def validate_manifest(m: dict, base: Path) -> list[str]:
    errors=[]
    if m.get("schema_version") != "1.0.0": errors.append("schema_version must be 1.0.0")
    if not isinstance(m.get("items"), list) or not m.get("items"): return errors+["items must be a non-empty array"]
    ids=set()
    for i,x in enumerate(m["items"]):
        p=f"items[{i}]"
        for k in ("id","path","media_type","split","site_id","session_id","provenance","license","context","annotations"):
            if k not in x: errors.append(f"{p}.{k} is required")
        if x.get("id") in ids: errors.append(f"{p}.id is duplicated")
        ids.add(x.get("id"))
        if x.get("split") not in SPLITS: errors.append(f"{p}.split must be train, validation, or test")
        prov=x.get("provenance",{}); lic=x.get("license",{}); ctx=x.get("context",{})
        for k in ("source_url","collected_at","collector","method","content_sha256"):
            if not prov.get(k): errors.append(f"{p}.provenance.{k} is required")
        for k in ("spdx_id","license_url","attribution"):
            if not lic.get(k): errors.append(f"{p}.license.{k} is required")
        for k in REQUIRED_CONTEXT:
            if k not in ctx: errors.append(f"{p}.context.{k} is required")
        for j,r in enumerate(x.get("annotations",[])):
            if r.get("class") not in REGION_CLASSES: errors.append(f"{p}.annotations[{j}].class is invalid")
            if not (isinstance(r.get("bbox"),list) and len(r["bbox"])==4 and all(isinstance(v,(int,float)) and v>=0 for v in r["bbox"])): errors.append(f"{p}.annotations[{j}].bbox is invalid")
            if r.get("class")=="sensitive" and not r.get("sensitive_type"): errors.append(f"{p}.annotations[{j}].sensitive_type is required")
        file=base/x.get("path","")
        if not file.is_file(): errors.append(f"{p}.path does not exist")
        elif prov.get("content_sha256") != _sha(file): errors.append(f"{p}.provenance.content_sha256 mismatch")
    return sorted(errors)

def check_leakage(m: dict, base: Path) -> dict:
    del base
    leaks=[]
    for kind, getter in (("content_sha256",lambda x:x["provenance"]["content_sha256"]),("site_id",lambda x:x["site_id"]),("session_id",lambda x:x["session_id"])):
        groups=defaultdict(lambda:defaultdict(list))
        for x in m["items"]: groups[getter(x)][x["split"]].append(x["id"])
        for value,splits in groups.items():
            if len(splits)>1: leaks.append({"kind":kind,"value":value,"splits":{k:sorted(v) for k,v in sorted(splits.items())}})
    leaks.sort(key=lambda z:(z["kind"],z["value"]))
    return {"schema_version":"1.0.0","status":"FAIL" if leaks else "PASS","leaks":leaks}

def _tags(x):
    c=x["context"]; tags=[]
    tags += [f"language:{v}" for v in c["languages"]]
    tags += [f"subgroup:{v}" for v in c["subgroups"]]
    tags += [f"accessibility:{v}" for v in c["accessibility"]]
    tags += [f"direction:{c['direction']}",f"contrast:{c['contrast']}",f"zoom:{c['zoom_percent']}"]
    return tags

def _iou(a,b):
    x=max(a[0],b[0]); y=max(a[1],b[1]); r=min(a[0]+a[2],b[0]+b[2]); d=min(a[1]+a[3],b[1]+b[3])
    inter=max(0,r-x)*max(0,d-y); union=a[2]*a[3]+b[2]*b[3]-inter
    return inter/union if union else 0

def _counts(items,pmap,selector):
    out=defaultdict(lambda:[0,0,0])
    for item in items:
        truth=item["annotations"]; pred=pmap.get(item["id"],[])
        for key in selector(item):
            classes=sorted({r["class"] for r in truth+pred})
            for cls in classes:
                ts=[r for r in truth if r["class"]==cls]; ps=[r for r in pred if r.get("class")==cls]; used=set(); tp=0
                for t in ts:
                    matches=[( _iou(t["bbox"],p.get("bbox",[])),j) for j,p in enumerate(ps) if j not in used and len(p.get("bbox",[]))==4]
                    if matches and max(matches)[0]>=.5: j=max(matches)[1]; used.add(j); tp+=1
                out[(key,cls)][0]+=tp; out[(key,cls)][1]+=len(ps)-tp; out[(key,cls)][2]+=len(ts)-tp
    return out

def _metric(v):
    tp,fp,fn=v
    return {"tp":tp,"fp":fp,"fn":fn,"precision":tp/(tp+fp) if tp+fp else None,"recall":tp/(tp+fn) if tp+fn else None}

def evaluate(m:dict,p:dict,policy:dict)->dict:
    items=m["items"]; sample_n=len(items); tag_counts=Counter(t for x in items for t in _tags(x))
    required=sorted(set(policy.get("required_subgroups",[]))); minimum=int(policy.get("minimum_samples",1)); subgroup_min=int(policy.get("minimum_samples_per_subgroup",1))
    missing=[t for t in required if tag_counts[t]==0]; undersized={t:tag_counts[t] for t in required if 0<tag_counts[t]<subgroup_min}
    blocked={"code":"INSUFFICIENT_EVIDENCE","minimum_samples":minimum,"observed_samples":sample_n,"minimum_samples_per_subgroup":subgroup_min,"missing_subgroups":missing,"undersized_subgroups":undersized}
    if sample_n<minimum or missing or undersized:
        return {"schema_version":"1.0.0","status":"BLOCKED","blocked":blocked,"claims_permitted":False}
    pmap={x["item_id"]:x.get("regions",[]) for x in p.get("items",[])}
    cc=_counts(items,pmap,lambda x:["all"]); sc=_counts(items,pmap,_tags)
    per_class={k[1]:_metric(v) for k,v in sorted(cc.items())}
    per_subgroup={}
    for (tag,cls),v in sorted(sc.items()): per_subgroup.setdefault(tag,{})[cls]=_metric(v)
    threshold=float(policy.get("privacy_min_recall",1.0)); privacy=policy.get("privacy_classes",["face","sensitive"])
    failures=[c for c in privacy if c not in per_class or per_class[c]["recall"] is None or per_class[c]["recall"]<threshold]
    return {"schema_version":"1.0.0","status":"FAIL" if failures else "PASS","claims_permitted":not failures,"privacy_fail_closed":bool(failures),"privacy":{"minimum_recall":threshold,"classes":privacy,"failures":failures},"per_class":per_class,"per_subgroup":per_subgroup,"sample_count":sample_n}

def import_dataset(src:Path,out:Path,*,license_id:str,license_url:str,source_url:str,attribution:str)->dict:
    if not all((license_id,license_url,source_url,attribution)): raise ValueError("explicit license, license URL, source URL, and attribution are required")
    files=sorted(p for p in src.rglob("*") if p.is_file() and not p.is_symlink()); out.mkdir(parents=True,exist_ok=False)
    items=[]
    for i,p in enumerate(files):
        rel=Path("data")/p.relative_to(src); dest=out/rel; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(p,dest)
        items.append({"id":f"import-{i:06d}","path":rel.as_posix(),"media_type":"text/plain","split":"train","site_id":f"UNASSIGNED-{i}","session_id":f"UNASSIGNED-{i}","provenance":{"source_url":source_url,"collected_at":"UNSPECIFIED","collector":"user-import","method":"licensed-user-provided-import","content_sha256":_sha(dest)},"license":{"spdx_id":license_id,"license_url":license_url,"attribution":attribution},"context":{"languages":[],"direction":"unknown","contrast":"unknown","zoom_percent":100,"accessibility":[],"subgroups":[]},"annotations":[]})
    manifest={"schema_version":"1.0.0","corpus_name":src.name,"items":items}; (out/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    return {"status":"IMPORTED","imported":len(items),"manifest":str(out/"manifest.json"),"requires_annotation":True}

def main():
    ap=argparse.ArgumentParser(); sub=ap.add_subparsers(dest="cmd",required=True)
    for name in ("validate","leakage","evaluate"):
        q=sub.add_parser(name); q.add_argument("manifest"); q.add_argument("--predictions"); q.add_argument("--policy")
    q=sub.add_parser("import"); q.add_argument("source"); q.add_argument("output"); q.add_argument("--license-id",required=True); q.add_argument("--license-url",required=True); q.add_argument("--source-url",required=True); q.add_argument("--attribution",required=True)
    a=ap.parse_args()
    if a.cmd=="import": result=import_dataset(Path(a.source),Path(a.output),license_id=a.license_id,license_url=a.license_url,source_url=a.source_url,attribution=a.attribution)
    else:
        path=Path(a.manifest); m=json.loads(path.read_text())
        if a.cmd=="validate": result={"status":"FAIL" if validate_manifest(m,path.parent) else "PASS","errors":validate_manifest(m,path.parent)}
        elif a.cmd=="leakage": result=check_leakage(m,path.parent)
        else: result=evaluate(m,json.loads(Path(a.predictions).read_text()),json.loads(Path(a.policy).read_text()))
    print(json.dumps(result,indent=2)); raise SystemExit(0 if result["status"] in {"PASS","IMPORTED","BLOCKED"} else 1)
if __name__=="__main__": main()
