import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const runs=[];
for(let run=1;run<=5;run++){
 const started=process.hrtime.bigint();
 const result=spawnSync(process.execPath,["--test","test/*.test.mjs"],{cwd:resolve(root,"demo-sites/registration"),encoding:"utf8",shell:true});
 runs.push({run,status:result.status===0?"PASS":"FAIL",durationMs:Number(process.hrtime.bigint()-started)/1e6,exitCode:result.status,stdout:result.stdout.trim(),stderr:result.stderr.trim()});
}
const requiredPassed=runs.every(r=>r.status==="PASS");
const fixture=readFileSync(resolve(root,"demo-sites/registration/index.html"));
let gitCommit=null;const git=spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"});if(git.status===0)gitCommit=git.stdout.trim();
const model=(name,sha256)=>{const bytes=readFileSync(resolve(root,"apps/extension/public/models",name));const actual=createHash("sha256").update(bytes).digest("hex");return {status:actual===sha256?"PACKAGED_HASH_VERIFIED":"HASH_MISMATCH",sha256:actual};};
const report={schemaVersion:"1.1",scope:"CONTROLLED_SYNTHETIC_DEMO",generatedAt:new Date().toISOString(),metadata:{environment:{os:process.platform,arch:process.arch,node:process.version,ci:process.env.CI==="true"},build:{gitCommit,dirty:true},models:{uiDetector:model("privsight-ui6.onnx","0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9"),ocr:model("text_detection_en_ppocrv3_2023may.onnx","03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587"),faceDetector:model("version-RFB-320.onnx","34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017"),planner:{mode:"MOCK_DEFAULT",qwenBatchEvidence:"KAGGLE_V5_COMPLETE_20_OF_20",persistentDeployment:false}},fixture:{path:"demo-sites/registration/index.html",sha256:createHash("sha256").update(fixture).digest("hex")}},requiredEvidence:{controlledFixtureTests:{status:requiredPassed?"PASS":"FAIL",threshold:"5/5",passed:runs.filter(r=>r.status==="PASS").length,total:5}},modelDependentStages:{uiDetection:{status:"INTEGRATED_BROWSER_EVIDENCE_SEPARATE",evidence:"artifacts/browser-smoke-report.json"},ocr:{status:"INTEGRATED_BROWSER_EVIDENCE_SEPARATE",evidence:"artifacts/browser-smoke-report.json"},faceMasking:{status:"INTEGRATED_BROWSER_EVIDENCE_SEPARATE",evidence:"artifacts/browser-smoke-report.json"},integratedPlanner:{status:"NOT_DEPLOYED",reason:"Qwen evidence is finite Kaggle batch/CPU fallback, not persistent vLLM"}},runs};
mkdirSync(resolve(root,"artifacts"),{recursive:true});writeFileSync(resolve(root,"artifacts/demo-gate-report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({report:"artifacts/demo-gate-report.json",controlledRuns:`${report.requiredEvidence.controlledFixtureTests.passed}/5`,modelDependent:"see artifacts/browser-smoke-report.json"}));
process.exit(requiredPassed?0:1);
