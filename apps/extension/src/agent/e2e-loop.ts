import type { ElementSnapshot } from "../observation/dom-scanner";
import { detectSensitiveField, detectStructuredPii } from "../privacy/detectors";
import { AgentActionSchema, type AgentAction } from "../actions/schemas";
import type { ApprovedPayload } from "./live-pipeline";

export interface ServerObservation {schemaVersion:"1.0";sessionId:string;stepId:number;observationVersion:string;goal:string;page:{origin:string;title:string};elements:Array<{id:string;role:string;label?:string;value?:string;bbox?:{x:number;y:number;width:number;height:number};enabled:boolean;visible:boolean;source:"DOM"|"VISUAL"|"MERGED"}>;redaction:{count:number;bySensitivity?:Record<string,number>;sanitizedImageSha256:string}}
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
export async function buildSanitizedStep(x:{sessionId:string;stepId:number;observationVersion:string;goal:string;origin:string;title:string;elements:ElementSnapshot[];image:Uint8Array}){
 const counts:Record<string,number>={}, sequence:Record<string,number>={};let count=0;
 const elements=x.elements.map(e=>{let value=e.value;if(value){const d=detectSensitiveField({label:e.label,value});if(d.length){const hit=d[0]!;sequence[hit.kind]=(sequence[hit.kind]??0)+1;value=`[${hit.kind}_${sequence[hit.kind]}]`;counts[hit.sensitivity]=(counts[hit.sensitivity]??0)+1;count++}else for(const hit of detectStructuredPii(value)){if(!hit.value)continue;sequence[hit.kind]=(sequence[hit.kind]??0)+1;value=value.replace(hit.value,`[${hit.kind}_${sequence[hit.kind]}]`);counts[hit.sensitivity]=(counts[hit.sensitivity]??0)+1;count++}}
  return{id:e.id,role:e.role,...(e.label?{label:e.label}:{}),...(value?{value}:{}),bbox:{x:e.bbox[0],y:e.bbox[1],width:e.bbox[2],height:e.bbox[3]},enabled:e.enabled,visible:e.visible,source:e.source};});
 const hash=hex(await crypto.subtle.digest("SHA-256",new Uint8Array(x.image).buffer));
 return{metadata:{schemaVersion:"1.0",sessionId:x.sessionId,stepId:x.stepId,observationVersion:x.observationVersion,goal:x.goal,page:{origin:x.origin,title:x.title},elements,redaction:{count,bySensitivity:counts,sanitizedImageSha256:hash}} satisfies ServerObservation,image:x.image};
}
export async function sendApprovedAgentStep(payload:ApprovedPayload,fetcher:typeof fetch=fetch){const form=new FormData();form.append("metadata",JSON.stringify(payload.metadata));form.append("image",new Blob([payload.image.bytes as BlobPart],{type:"image/png"}),"sanitized.png");const response=await fetcher("http://127.0.0.1:8080/api/v1/agent/step",{method:"POST",body:form});const body=await response.json();if(!response.ok)throw new Error(body?.error?.code??`HTTP_${response.status}`);const action=AgentActionSchema.parse(body.action) as AgentAction;return{planner:String(body.planner),action}}
