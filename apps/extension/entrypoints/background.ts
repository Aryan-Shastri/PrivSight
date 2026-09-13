import { sendApprovedAgentStep } from "../src/agent/e2e-loop";
import { runLivePrivacyPipeline, type LocalVisionResult, type RawCapture } from "../src/agent/live-pipeline";
import { ensureOffscreenHost, chromeOffscreenApi } from "../src/vision/offscreen-lifecycle";
import { approveForEgress, type SanitizedImage } from "../src/privacy/egress-firewall";
import { validateAction } from "../src/actions/validator";
import { clearSession, loadSession, saveSession, type PersistedSession } from "../src/agent/session-store";

type Session=PersistedSession;
let current:Session|undefined;
const recovered = loadSession(browser.storage.session).then(session => { current = session; });
const notify=(payload:unknown)=>browser.runtime.sendMessage({type:"AGENT_STATUS",payload}).catch(()=>{});
const bytesFromDataUrl=(url:string)=>{const encoded=url.split(",",2)[1];if(!encoded)throw Error("CAPTURE_FAILED");const raw=atob(encoded);return Uint8Array.from(raw,c=>c.charCodeAt(0))};
async function stop(){await recovered;if(current)await browser.storage.session.remove(`privsight:vault:${current.sessionId}`);current=undefined;await clearSession(browser.storage.session);notify({state:"IDLE",message:"Cancelled; local session data purged."})}
async function start(goal:string){
 await recovered;
 const [tab]=await browser.tabs.query({active:true,currentWindow:true});if(!tab?.id||!tab.url)throw Error("NO_ACTIVE_TAB");const url=new URL(tab.url);if(!["http:","https:"].includes(url.protocol))throw Error("UNSUPPORTED_PAGE");
 await browser.scripting.executeScript({target:{tabId:tab.id},files:["/content-runtime.js" as any]});
 const sessionId=crypto.randomUUID(),observationVersion=crypto.randomUUID();current={sessionId,tabId:tab.id,origin:url.origin,observationVersion};await saveSession(browser.storage.session,current);notify({state:"SCANNING",message:"Capturing current viewport for mandatory local privacy processing."});
 const scanned=await browser.tabs.sendMessage(tab.id,{type:"SCAN_DOM",observationVersion});if(!scanned?.ok)throw Error("SCAN_FAILED");
 const [geometry]=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>({scrollX,scrollY,viewportWidthCss:innerWidth,viewportHeightCss:innerHeight,devicePixelRatio})});
 const g=geometry?.result as {scrollX:number;scrollY:number;viewportWidthCss:number;viewportHeightCss:number;devicePixelRatio:number}|undefined;if(!g)throw Error("CAPTURE_METADATA_FAILED");
 const png=bytesFromDataUrl(await browser.tabs.captureVisibleTab(tab.windowId,{format:"png"}));
 const capture:RawCapture={kind:"RAW_CAPTURE",bytes:png,trigger:"EXPLICIT_REFRESH",capturedAt:Date.now(),...g,width:Math.round(g.viewportWidthCss*g.devicePixelRatio),height:Math.round(g.viewportHeightCss*g.devicePixelRatio)};
 let processed:{vision:LocalVisionResult;image:SanitizedImage}|undefined;
 const result=await runLivePrivacyPipeline({sessionId,stepId:0,observationVersion,goal,origin:scanned.origin,title:scanned.title,dom:scanned.elements},{
  capture:async()=>capture,
  localVision:async raw=>{await ensureOffscreenHost(chromeOffscreenApi());const response=await browser.runtime.sendMessage({type:"PROCESS_LOCAL_PRIVACY",requestId:crypto.randomUUID(),capture:{...raw,bytes:[...raw.bytes]},dom:scanned.elements});if(!response||response.type!=="LOCAL_PRIVACY_RESULT")throw Error(response?.code||"PRIVACY_ENGINE_UNAVAILABLE");processed={vision:response.vision,image:{...response.image,bytes:Uint8Array.from(response.image.bytes)}};notify({state:"LOCAL_VISION_READY",providers:response.providers,captureTrigger:raw.trigger});return response.vision},
  redact:async()=>{if(!processed)throw Error("PRIVACY_ENGINE_UNAVAILABLE");return processed.image},
  approve:approveForEgress,
  network:async payload=>sendApprovedAgentStep(payload),
 });
 notify({state:"PLANNING",message:"Egress-approved redacted visual observation sent."});const planned=result;
 if(!current||result.observationVersion!==current.observationVersion)throw Error("STALE_OBSERVATION");
 const elements=new Map(result.evidence.map(e=>[e.id,{enabled:e.enabled,visible:e.visible,role:e.role}]));const valid=validateAction(planned.action,{observationVersion,actionObservationVersion:result.observationVersion,elements,tokens:new Set()});if(!valid.ok)throw Error(valid.code);
 const executed=await browser.tabs.sendMessage(tab.id,{type:"EXECUTE_ACTION",action:planned.action});if(!executed?.ok)throw Error(executed?.error||"EXECUTION_FAILED");
 if(executed.result.status==="APPROVAL_REQUIRED"){current.pending=planned.action;await saveSession(browser.storage.session,current);notify({state:"AWAITING_APPROVAL",planner:planned.planner,message:"Final submit requires explicit approval."})}else notify({state:"COMPLETE",planner:planned.planner,message:executed.result.message||"Safe local action executed."});
}
export default defineBackground(()=>{browser.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});browser.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 let response:Promise<unknown>|undefined;
 if(message?.type==="PING")response=Promise.resolve({ok:true,state:current?"ACTIVE":"IDLE"});
 if(message?.type==="START_AGENT")response=start(String(message.goal||"").trim()).then(()=>({ok:true})).catch(e=>{notify({state:"ERROR",message:String(e.message||e)});return{ok:false,error:String(e.message||e)}});
 if(message?.type==="STOP_AGENT")response=stop().then(()=>({ok:true}));
 if(message?.type==="APPROVE_ACTION")response=(async()=>{await recovered;if(!current?.pending)return{ok:false,error:"NO_PENDING_APPROVAL"};const action=current.pending;current.pending=undefined;await saveSession(browser.storage.session,current);await browser.tabs.sendMessage(current.tabId,{type:"EXECUTE_ACTION",action,approved:true});notify({state:"COMPLETE",message:"Approved final submit executed locally."});return{ok:true}})();
 if(!response)return false;void response.then(sendResponse);return true;
})});
