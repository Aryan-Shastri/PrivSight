#!/usr/bin/env python3
import argparse, hashlib, json, statistics, time, uuid
import httpx
PNG=b"\x89PNG\r\n\x1a\nbenchmark"
def main():
 p=argparse.ArgumentParser(); p.add_argument("--url",default="http://127.0.0.1:8080"); p.add_argument("-n",type=int,default=20); a=p.parse_args()
 meta={"schemaVersion":"1.0","sessionId":"benchmark","stepId":1,"observationVersion":"bench-1","goal":"Click continue","page":{"origin":"https://example.test","title":"Benchmark"},"elements":[{"id":"E001","role":"button","label":"Continue","enabled":True,"visible":True,"source":"DOM"}],"redaction":{"count":0,"bySensitivity":{},"sanitizedImageSha256":hashlib.sha256(PNG).hexdigest()}}
 lat=[]; ok=0
 with httpx.Client(timeout=45) as c:
  for _ in range(a.n):
   meta["sessionId"]="benchmark-"+uuid.uuid4().hex
   start=time.perf_counter(); r=c.post(a.url+"/api/v1/agent/step",data={"metadata":json.dumps(meta)},files={"image":("bench.png",PNG,"image/png")}); lat.append((time.perf_counter()-start)*1000); ok += r.status_code==200
 lat.sort(); print(json.dumps({"requests":a.n,"ok":ok,"p50_ms":round(statistics.median(lat),2),"p95_ms":round(lat[max(0,int(.95*len(lat))-1)],2)},sort_keys=True))
if __name__=="__main__": main()
