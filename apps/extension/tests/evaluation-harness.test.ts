import {afterAll, describe, expect, it} from "vitest";
import {existsSync, readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {performance} from "node:perf_hooks";
import {detectStructuredPii} from "../src/privacy/detectors";
import {approveForEgress, type SanitizedObservation} from "../src/privacy/egress-firewall";
import {redactPixels, scaleAndClampRegions} from "../src/privacy/redactor";
import {AgentActionSchema} from "../src/actions/schemas";
import {validateAction} from "../src/actions/validator";
import corpus from "../evaluation/corpus.json";

type Status="PASS"|"FAIL"|"SKIPPED"|"BLOCKED";
type Metric={status:Status;requiredEvidence:boolean;value?:number;unit?:string;threshold?:string;details?:unknown};
const metrics:Record<string,Metric>={};
const samples:Record<string,number[]>={};
const fixturePath=resolve(import.meta.dirname,"../evaluation/corpus.json");
const sha=(data:string|Uint8Array)=>createHash("sha256").update(data).digest("hex");
const pct=(xs:number[],p:number)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(p*s.length)-1)]??0};
const timed=<T>(name:string,fn:()=>T):T=>{const a=performance.now();const v=fn();(samples[name]??=[]).push(performance.now()-a);return v};
const baseObservation=():SanitizedObservation=>({schemaVersion:"1.0",sessionId:"fixture",stepId:1,observationVersion:"v1",goal:"Use aliases only",page:{origin:"https://fixture.test",title:"Fixture"},elements:[],redaction:{count:0,sanitizedImageSha256:"fixture-sha"}});

describe("fixed synthetic evaluation corpus",()=>{
 it("detects structured PII with measured recall and precision",()=>{
  let tp=0,fp=0,fn=0;
  for(const c of corpus.pii){const got=timed("structuredPii",()=>detectStructuredPii(c.text)).map(x=>x.kind);const expected=c.expected;
   for(const kind of got) expected.includes(kind as never)?tp++:fp++; for(const kind of expected) if(!got.includes(kind as never))fn++;
  }
  const recall=tp/(tp+fn),precision=tp/(tp+fp);
  metrics.structured_pii_recall={status:recall>=.98?"PASS":"FAIL",requiredEvidence:true,value:recall,unit:"ratio",threshold:">=0.98",details:{tp,fp,fn,corpusSize:corpus.pii.length}};
  metrics.structured_pii_precision={status:precision>=.9?"PASS":"FAIL",requiredEvidence:true,value:precision,unit:"ratio",threshold:">=0.90",details:{tp,fp,fn,corpusSize:corpus.pii.length}};
  expect(recall).toBeGreaterThanOrEqual(.98);expect(precision).toBeGreaterThanOrEqual(.9);
 });
 it("blocks synthetic plaintext leakage",()=>{
  let leaked=0;
  for(const value of corpus.leakage){const o=baseObservation();o.goal=value;const result=timed("egressFirewall",()=>approveForEgress(o,{kind:"SANITIZED_CAPTURE",bytes:new Uint8Array(),sha256:"fixture-sha"}));if(result.ok)leaked++;}
  metrics.critical_plaintext_egress={status:leaked===0?"PASS":"FAIL",requiredEvidence:true,value:leaked,unit:"accepted_payloads",threshold:"=0",details:{corpusSize:corpus.leakage.length}};
  expect(leaked).toBe(0);
 });
 it("replaces every sensitive pixel after scaled geometry",()=>{
  let recoverable=0,covered=0;const fill:[number,number,number,number]=[49,35,48,255];
  for(const c of corpus.redaction){const input=new Uint8ClampedArray(c.bitmap.width*c.bitmap.height*4);for(let i=0;i<input.length;i++)input[i]=(i*17+13)%251;
   const rects=timed("redaction",()=>scaleAndClampRegions(c.regions as never,c.css,c.bitmap,c.margin));const out=redactPixels(input,c.bitmap.width,rects,fill);
   for(const r of rects)for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){covered++;const i=(y*c.bitmap.width+x)*4;if(out[i]!==fill[0]||out[i+1]!==fill[1]||out[i+2]!==fill[2]||out[i+3]!==fill[3])recoverable++;}
  }
  metrics.redaction_recoverable_pixels={status:recoverable===0?"PASS":"FAIL",requiredEvidence:true,value:recoverable,unit:"pixels",threshold:"=0",details:{coveredPixels:covered,corpusSize:corpus.redaction.length}};expect(recoverable).toBe(0);
 });
 it("validates action schema and executes no invalid fixture action",()=>{
  let expected=0,correct=0,invalidExecuted=0;
  const context={observationVersion:"v1",actionObservationVersion:"v1",elements:new Map([["E001",{enabled:true,visible:true,role:"textbox"}]]),tokens:new Set(["[EMAIL_1]"])};
  for(const c of corpus.actions){const schema=timed("actionSchema",()=>AgentActionSchema.safeParse(c.action).success);if(c.valid)expected++;if(schema===c.valid)correct++;const valid=validateAction(c.action,context);if(!c.valid&&valid.ok)invalidExecuted++;}
  const ratio=correct/corpus.actions.length;
  metrics.action_schema_classification={status:ratio===1?"PASS":"FAIL",requiredEvidence:true,value:ratio,unit:"ratio",threshold:"=1",details:{expectedValid:expected,corpusSize:corpus.actions.length}};
  metrics.invalid_action_execution_count={status:invalidExecuted===0?"PASS":"FAIL",requiredEvidence:true,value:invalidExecuted,unit:"actions",threshold:"=0"};expect(ratio).toBe(1);expect(invalidExecuted).toBe(0);
 });
 it("rejects adversarial prompt-injection actions",()=>{
  let silentConsequential=0;
  for(const c of corpus.promptInjection){const result=validateAction(c.action,{observationVersion:"v2",actionObservationVersion:c.actionObservationVersion,elements:new Map([["E999",{enabled:true,visible:true,role:"submit"}]]),tokens:new Set()});if(result.ok&&!result.requiresConfirmation)silentConsequential++;}
  metrics.prompt_injection_silent_consequential_actions={status:silentConsequential===0?"PASS":"FAIL",requiredEvidence:true,value:silentConsequential,unit:"actions",threshold:"=0",details:{corpusSize:corpus.promptInjection.length}};expect(silentConsequential).toBe(0);
 });
});

afterAll(()=>{
 const root=resolve(import.meta.dirname,"../../..");
 const modelFile=(name:string,expected:string)=>{const path=resolve(root,"apps/extension/public/models",name);if(!existsSync(path))return {status:"ABSENT",sha256:null};const actual=sha(readFileSync(path));return {status:actual===expected?"PACKAGED_HASH_VERIFIED":"HASH_MISMATCH",sha256:actual};};
 const model={uiDetector:modelFile("privsight-ui6.onnx","0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9"),ocr:modelFile("text_detection_en_ppocrv3_2023may.onnx","03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587"),faceDetector:modelFile("version-RFB-320.onnx","34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017"),planner:{mode:"MOCK_DEFAULT_WITH_SEPARATE_QWEN_BATCH_EVIDENCE",model:"qwen-lm/qwen-3-vl/transformers/2b-instruct/1",deployment:"NOT_PERSISTENT",evidence:"model-training/qwen-planner/evidence/kaggle-v5/summary.json"}};
 const allModels=Object.values(model).slice(0,3).every(value=>"status" in value&&value.status==="PACKAGED_HASH_VERIFIED");
 metrics.integrated_model_pipeline={status:allModels?"PASS":"BLOCKED",requiredEvidence:false,details:{reason:allModels?"All three packaged ONNX artifacts hash-verified; browser execution is reported separately.":"One or more packaged model artifacts are unavailable or modified."}};
 const latency=Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{sampleCount:v.length,p50Ms:pct(v,.5),p95Ms:pct(v,.95),worstMs:Math.max(...v)}]));
 let commit:string|null=null;try{commit=execFileSync("git",["rev-parse","HEAD"],{cwd:resolve(import.meta.dirname,"../../.."),encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{}
 const report={schemaVersion:"1.1",scope:"SYNTHETIC_FIXTURES_WITH_PACKAGED_MODEL_DISCOVERY",generatedAt:new Date().toISOString(),metadata:{environment:{os:process.platform,arch:process.arch,node:process.version,ci:process.env.CI==="true"},build:{package:"extension",version:"0.1.0",gitCommit:commit,dirty:true},models:model,corpus:{path:"apps/extension/evaluation/corpus.json",sha256:sha(readFileSync(fixturePath)),version:corpus.version}},metrics,latency};
 const out=resolve(import.meta.dirname,"../../../artifacts/evaluation-report.json");mkdirSync(resolve(out,".."),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+"\n");
});
