import { sendApprovedAgentStep } from "../src/agent/e2e-loop";
import { prepareLivePrivacyPipeline, type LocalVisionResult, type RawCapture } from "../src/agent/live-pipeline";
import { runAgentOrchestrator, type AgentObservation, type OrchestratorResult } from "../src/agent/orchestrator";
import { ensureOffscreenHost, chromeOffscreenApi } from "../src/vision/offscreen-lifecycle";
import { approveForEgress, type SanitizedImage } from "../src/privacy/egress-firewall";
import { validateAction } from "../src/actions/validator";
import { saveSession, type PersistedSession } from "../src/agent/session-store";
import type { AgentAction } from "../src/actions/schemas";
import { ChromeSessionStore, TokenVault, type VaultToken } from "../src/privacy/token-vault";
import { RuntimeLifecycle, assertAuthorizedOrigin, tokenizeObservation, type RunIdentity } from "../src/agent/runtime-lifecycle";
import {CaptureController,withDeadline} from "../src/protocol/reliability";
import {revalidateVisualClick} from "../src/actions/visual-target";
import {REMOTE_PLANNER_TIMEOUT_MS} from "../src/agent/default-goal";

interface RuntimeObservation extends AgentObservation { scanned: any; capture: RawCapture }
type Session=PersistedSession;
let current:Session|undefined;
let controller:AbortController|undefined;
let approvalResolver:((approved:boolean)=>void)|undefined;
let activeRun:RunIdentity|undefined;
const tokenVault=new TokenVault(new ChromeSessionStore());
const lifecycle=new RuntimeLifecycle(browser.storage.session,tokenVault);
const captureController=new CaptureController();
const recovered=lifecycle.recover();
const notify=(payload:unknown)=>browser.runtime.sendMessage({type:"AGENT_STATUS",payload}).catch(()=>{});
const bytesFromDataUrl=(url:string)=>{const encoded=url.split(",",2)[1];if(!encoded)throw Error("CAPTURE_FAILED");const raw=atob(encoded);return Uint8Array.from(raw,c=>c.charCodeAt(0))};
const pngDimensions=(bytes:Uint8Array)=>{if(bytes.length<24||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error("CAPTURE_FAILED");const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return{width:view.getUint32(16),height:view.getUint32(20)}};
const tabMessage=(tabId:number,message:unknown)=>withDeadline(browser.tabs.sendMessage(tabId,message),3_000,"RPC_TIMEOUT");
const captureViewport=(windowId:number)=>captureController.run(()=>browser.tabs.captureVisibleTab(windowId,{format:"png"}));
async function stop(){await recovered;controller?.abort();approvalResolver?.(false);approvalResolver=undefined;const run=activeRun;if(run)await lifecycle.terminate(run);if(activeRun===run){activeRun=undefined;current=undefined}if(!activeRun)notify({state:"IDLE",message:"Cancelled; local session data purged."})}

async function observe(tab: any,run:RunIdentity):Promise<RuntimeObservation>{
 if(!lifecycle.isCurrent(run))throw Error("STALE_RUN");
 const live=await browser.tabs.get(tab.id);if(!live.url)throw Error("UNSUPPORTED_PAGE");assertAuthorizedOrigin(current!.origin,new URL(live.url).origin);
 await browser.scripting.executeScript({target:{tabId:tab.id},files:["/content-runtime.js" as any]});
 const version=crypto.randomUUID();
 const raw=await tabMessage(tab.id,{type:"SCAN_DOM",observationVersion:version});if(!raw?.ok)throw Error("SCAN_FAILED");
 assertAuthorizedOrigin(current!.origin,raw.origin);
 const scanned=await tokenizeObservation({elements:raw.elements,origin:raw.origin,title:raw.title},raw.sensitiveFields??[],{sessionId:current!.sessionId,tabId:tab.id,origin:current!.origin,expiresAt:Date.now()+15*60_000},tokenVault);
 const [geometry]=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>({scrollX,scrollY,viewportWidthCss:innerWidth,viewportHeightCss:innerHeight,devicePixelRatio})});
 const g=geometry?.result as {scrollX:number;scrollY:number;viewportWidthCss:number;viewportHeightCss:number;devicePixelRatio:number}|undefined;if(!g)throw Error("CAPTURE_METADATA_FAILED");
 const png=bytesFromDataUrl(await captureViewport(tab.windowId));const dimensions=pngDimensions(png);
 const capture:RawCapture={kind:"RAW_CAPTURE",bytes:png,trigger:"EXPLICIT_REFRESH",capturedAt:Date.now(),...g,...dimensions};
 const fingerprint=JSON.stringify({origin:scanned.origin,title:scanned.title,scrollX:g.scrollX,scrollY:g.scrollY,elements:scanned.elements.map((e:any)=>({id:e.id,role:e.role,label:e.label,value:e.value,enabled:e.enabled,visible:e.visible,bbox:e.bbox}))});
 return{version,fingerprint,scanned,capture};
}

function expectedChange(action:AgentAction,after:RuntimeObservation){
 if(!("elementId" in action))return true;
 const element=after.scanned.elements.find((item:any)=>item.id===action.elementId);
 if(action.type==="TYPE_TEXT")return element?.value===action.text;
 if(action.type==="SELECT")return element?.value===action.option;
 if(action.type==="CHECK")return element?.value==="checked";
 if(action.type==="UNCHECK")return element?.value==="unchecked";
 return true;
}

async function start(goal:string){
 await recovered;
 let [tab]=await browser.tabs.query({active:true,currentWindow:true});if(!tab?.id)[tab]=await browser.tabs.query({active:true,lastFocusedWindow:true});if(!tab?.id)throw Error("NO_ACTIVE_TAB");
 const [locationResult]=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>location.href});const pageUrl=locationResult?.result;if(!pageUrl)throw Error("UNSUPPORTED_PAGE");const url=new URL(pageUrl);if(!["http:","https:"].includes(url.protocol))throw Error("UNSUPPORTED_PAGE");
 const sessionId=crypto.randomUUID();const session={sessionId,tabId:tab.id,origin:url.origin,observationVersion:"pending"};const run=await lifecycle.begin(session);activeRun=run;current=session;controller=new AbortController();let stepId=0;let prepared:any;let currentObservation:RuntimeObservation|undefined;let requiresConfirmation=false;
 const runLocalVision=async(o:RuntimeObservation)=>{await withDeadline(ensureOffscreenHost(chromeOffscreenApi()),3_000,"OFFSCREEN_TIMEOUT");const response=await withDeadline(browser.runtime.sendMessage({type:"PROCESS_LOCAL_PRIVACY",requestId:crypto.randomUUID(),capture:{...o.capture,bytes:[...o.capture.bytes]},dom:o.scanned.elements}),30_000,"VISION_TIMEOUT");if(!response||response.type!=="LOCAL_PRIVACY_RESULT")throw Error(response?.code||"PRIVACY_ENGINE_UNAVAILABLE");return response};
 try{const result=await runAgentOrchestrator({
  observe:async()=>{notify({state:"SCANNING",message:"Capturing current viewport for mandatory local privacy processing."});const value=await observe(tab,run);currentObservation=value;if(lifecycle.isCurrent(run)&&current){current.observationVersion=value.version;await saveSession(browser.storage.session,current)}return value},
  sanitize:async raw=>{const o=raw as RuntimeObservation;let processed:{vision:LocalVisionResult;image:SanitizedImage}|undefined;prepared=await prepareLivePrivacyPipeline({sessionId,stepId:stepId++,observationVersion:o.version,goal,origin:o.scanned.origin,title:o.scanned.title,dom:o.scanned.elements},{capture:async()=>o.capture,localVision:async capture=>{const response=await runLocalVision(o);processed={vision:response.vision,image:{...response.image,bytes:Uint8Array.from(response.image.bytes)}};notify({state:"LOCAL_VISION_READY",providers:response.providers,captureTrigger:capture.trigger});return response.vision},redact:async()=>{if(!processed)throw Error("PRIVACY_ENGINE_UNAVAILABLE");return processed.image}});return prepared},
  egressCheck:async value=>{const p=value as typeof prepared;const approved=await approveForEgress(p.metadata,p.image);if(!approved.ok)throw Error(approved.code);return approved.value},
  plan:async payload=>{notify({state:"PLANNING",message:"Sanitized JSON and redacted pixels sent. Modal cold start may take up to three minutes."});const planned=await withDeadline(sendApprovedAgentStep(payload as any),REMOTE_PLANNER_TIMEOUT_MS,"PLANNER_TIMEOUT");(prepared as any).planner=planned.planner;return planned.action},
  validate:async(action,raw)=>{if(!lifecycle.isCurrent(run))throw Error("STALE_RUN");const o=raw as RuntimeObservation;const evidence=prepared?.evidence??o.scanned.elements;const result=validateAction(action,{observationVersion:o.version,actionObservationVersion:o.version,elements:new Map(evidence.map((e:any)=>[e.id,{enabled:e.enabled,visible:e.visible,role:e.role,label:e.label,options:e.options,source:e.source}])),tokens:await tokenVault.issuedTokens(sessionId)});requiresConfirmation=result.ok&&result.requiresConfirmation;return result},
  confirm:async action=>{if(!lifecycle.isCurrent(run)||!current)return false;current.pending=action;await saveSession(browser.storage.session,current);notify({state:"AWAITING_APPROVAL",planner:prepared?.planner,message:"Final submit requires explicit approval."});return new Promise<boolean>(resolve=>{approvalResolver=resolve})},
  execute:async action=>{if(!lifecycle.isCurrent(run))throw Error("STALE_RUN");if(typeof tab.id!=="number")throw Error("NO_ACTIVE_TAB");const tabId=tab.id;let executed;if("elementId" in action&&action.elementId.startsWith("V")){
   const evidence=prepared?.evidence?.find((e:any)=>e.id===action.elementId);if(!evidence)throw Error("INVALID_VISUAL_TARGET");if(!currentObservation)throw Error("STALE_OBSERVATION");
   const freshObservation=await observe(tab,run);const freshResponse=await runLocalVision(freshObservation);let freshImage:SanitizedImage|undefined;const freshPrepared=await prepareLivePrivacyPipeline({sessionId,stepId:stepId++,observationVersion:freshObservation.version,goal,origin:freshObservation.scanned.origin,title:freshObservation.scanned.title,dom:freshObservation.scanned.elements},{capture:async()=>freshObservation.capture,localVision:async()=>freshResponse.vision,redact:async()=>freshImage??={...freshResponse.image,bytes:Uint8Array.from(freshResponse.image.bytes)}});const freshTarget=freshPrepared.evidence.find((e:any)=>e.id===action.elementId);if(!freshTarget)throw Error("STALE_VISUAL_COORDINATES");
   const bind=(o:RuntimeObservation,target:any)=>({version:o.version,capturedAt:o.capture.capturedAt,scrollX:o.capture.scrollX,scrollY:o.capture.scrollY,viewportWidthCss:o.capture.viewportWidthCss,viewportHeightCss:o.capture.viewportHeightCss,devicePixelRatio:o.capture.devicePixelRatio,target});
   const point=revalidateVisualClick(bind(currentObservation,evidence),bind(freshObservation,freshTarget),{hit:true,tagName:"PREFLIGHT"},action.type);
   const [result]=await browser.scripting.executeScript({target:{tabId},func:({x,y,expectedRole})=>{const el=document.elementFromPoint(x,y) as HTMLElement|null;if(!el)return{ok:false};const role=(el.getAttribute("role")||({BUTTON:"button",A:"link",INPUT:(el as HTMLInputElement).type==="checkbox"?"checkbox":"textbox"} as Record<string,string>)[el.tagName]||"").toLowerCase();if(role&&role!==expectedRole.toLowerCase())return{ok:false};el.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:x,clientY:y}));el.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:x,clientY:y}));return{ok:true,tagName:el.tagName,role}},args:[{...point,expectedRole:freshTarget.role}]});executed=result?.result?.ok?{ok:true,result:{status:"EXECUTED"}}:{ok:false,error:"VISUAL_TARGET_NOT_HIT"};
  }else if(action.type==="TYPE_TOKEN"){
   if(!current)throw Error("TOKEN_SCOPE_MISMATCH");
   const observationVersion=(prepared?.metadata?.observationVersion as string|undefined);if(!observationVersion)throw Error("STALE_OBSERVATION");
   const target=await tabMessage(tab.id!,{type:"GET_TOKEN_FIELD_ROLE",elementId:action.elementId,observationVersion});
   if(!target?.ok||!target.fieldRole||target.origin!==current.origin)throw Error(target?.error||"TOKEN_SCOPE_MISMATCH");
   const value=await tokenVault.resolveForAction(action.token as VaultToken,{sessionId:current.sessionId,tabId:tab.id!,origin:target.origin,fieldRole:target.fieldRole,sourceElementId:action.elementId});
   // MV3 requires one transient exact-action message to the isolated content world.
   // Plaintext is not persisted, logged, included in status, or sent to the planner.
   executed=await tabMessage(tab.id!,{type:"EXECUTE_TOKEN_VALUE",elementId:action.elementId,origin:target.origin,fieldRole:target.fieldRole,value,approved:true,requiresConfirmation,observationVersion});
  }else executed=await tabMessage(tabId,{type:"EXECUTE_ACTION",action,approved:true,requiresConfirmation,observationVersion:prepared?.metadata?.observationVersion});return executed?.ok?{ok:true}:{ok:false,code:executed?.error||"EXECUTION_FAILED"}},
  verify:async({action,after})=>({ok:expectedChange(action,after as RuntimeObservation),code:"EXPECTED_STATE_CHANGE_NOT_PROVEN"}),
 },{signal:controller.signal});finish(result,prepared?.planner);
 }finally{approvalResolver=undefined;controller=undefined;if(lifecycle.isCurrent(run)){await lifecycle.terminate(run);if(activeRun===run){activeRun=undefined;current=undefined}}}
}
function finish(result:OrchestratorResult,planner?:string){if(result.status==="DONE")notify({state:"COMPLETE",planner,message:result.action?.type==="DONE"?result.action.summary:"Done."});else if(result.status==="ASK_USER")notify({state:"ASK_USER",planner,message:result.action?.type==="ASK_USER"?result.action.message:"User input required."});else if(result.status!=="CANCELLED")notify({state:"ERROR",planner,message:result.code||result.status})}

export default defineBackground(()=>{browser.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});void recovered.then(value=>{if(value.restartRequired)notify({state:"ASK_USER",message:"Extension restarted during a pending action. Start the agent again; no action was resumed."})});browser.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 let response:Promise<unknown>|undefined;
 if(message?.type==="PING")response=recovered.then(()=>({ok:true,...lifecycle.ping()}));
 if(message?.type==="START_AGENT")response=start(String(message.goal||"").trim()).then(()=>({ok:true})).catch(e=>{notify({state:"ERROR",message:String(e.message||e)});return{ok:false,error:String(e.message||e)}});
 if(message?.type==="STOP_AGENT")response=stop().then(()=>({ok:true}));
 if(message?.type==="APPROVE_ACTION")response=Promise.resolve(approvalResolver?((approvalResolver(true),approvalResolver=undefined),{ok:true}):{ok:false,error:"NO_PENDING_APPROVAL"});
 if(!response)return false;void response.then(sendResponse);return true;
})});
