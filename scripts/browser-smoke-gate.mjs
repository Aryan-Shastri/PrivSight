import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";

const root=resolve(import.meta.dirname,"..");
const pct=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]};
const hashFile=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const runs=[];
for(let run=1;run<=5;run++){
  const started=performance.now();
  const result=spawnSync(process.execPath,["scripts/extension-smoke.mjs"],{cwd:root,encoding:"utf8",maxBuffer:10*1024*1024});
  let evidence=null;try{evidence=JSON.parse(result.stdout)}catch{}
  runs.push({run,status:result.status===0&&evidence?.status==="PASS"?"PASS":"FAIL",durationMs:performance.now()-started,exitCode:result.status,evidence,stderr:result.stderr.trim()});
}
const timings=runs.filter(r=>r.status==="PASS").map(r=>r.evidence.modelDependentEvidence.localPrivacyMs);
const report={schemaVersion:"1.0",scope:"FIVE_CONSECUTIVE_REAL_CHROMIUM_MV3_RUNS",generatedAt:new Date().toISOString(),models:{ui:{sha256:await hashFile(resolve(root,"apps/extension/public/models/privsight-ui6.onnx"))},ocr:{sha256:await hashFile(resolve(root,"apps/extension/public/models/text_detection_en_ppocrv3_2023may.onnx"))},face:{sha256:await hashFile(resolve(root,"apps/extension/public/models/version-RFB-320.onnx"))}},summary:{passed:runs.filter(r=>r.status==="PASS").length,total:5,status:runs.every(r=>r.status==="PASS")?"PASS":"FAIL"},latency:timings.length?{metric:"local privacy request round trip",sampleCount:timings.length,p50Ms:pct(timings,.5),p95Ms:pct(timings,.95),worstMs:Math.max(...timings)}:null,runs};
mkdirSync(resolve(root,"artifacts"),{recursive:true});writeFileSync(resolve(root,"artifacts/browser-smoke-report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({report:"artifacts/browser-smoke-report.json",passed:`${report.summary.passed}/5`,latency:report.latency}));
process.exit(report.summary.status==="PASS"?0:1);