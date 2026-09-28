import {useEffect,useState} from "react";
import {DEFAULT_AUTONOMOUS_GOAL} from "../../src/agent/default-goal";
type Status={state:string;message:string;planner?:string};
export default function App(){const[status,setStatus]=useState<Status>({state:"IDLE",message:"Ready. Sensitive fields are sanitized locally before planning."});
 useEffect(()=>{const listener=(m:any)=>{if(m?.type==="AGENT_STATUS")setStatus(m.payload)};browser.runtime.onMessage.addListener(listener);return()=>browser.runtime.onMessage.removeListener(listener)},[]);
 const send=async(type:string)=>{
  try{
  if(type==="START_AGENT"){
   const [tab]=await browser.tabs.query({active:true,currentWindow:true});
   if(!tab?.url){setStatus({state:"ERROR",message:"NO_ACTIVE_TAB"});return}
   const url=new URL(tab.url);if(!["http:","https:"].includes(url.protocol)){setStatus({state:"ERROR",message:"UNSUPPORTED_PAGE"});return}
   const origin=`${url.origin}/*`;const granted=await browser.permissions.contains({origins:[origin]})||await browser.permissions.request({origins:[origin]});
   if(!granted){setStatus({state:"ERROR",message:`Permission denied for ${url.origin}`});return}
  }
  const result=await browser.runtime.sendMessage({type,...(type==="START_AGENT"?{goal:DEFAULT_AUTONOMOUS_GOAL}: {})});if(!result?.ok)setStatus({state:"ERROR",message:result?.error||"Request failed"})
  }catch(error){setStatus({state:"ERROR",message:error instanceof Error?error.message:String(error)})}
 };
 const active=!['IDLE','COMPLETE','ERROR'].includes(status.state);
 return <main><header><div className="mark" aria-hidden="true">P</div><div><h1>PrivSight</h1><p className="eyebrow">LOCAL PRIVACY LAYER</p></div><span className="status"><i/>Protected</span></header>
 <section className="hero"><p className="kicker">DOM-first, private by construction</p><h2>Navigate the web.<br/><em>Keep your data yours.</em></h2><p>Controls are scanned and sensitive values tokenized locally. Only schema-checked metadata crosses the boundary.</p></section>
 <section className="card"><label>Sanitize the current page locally, then ask the private model for the safest next action.</label><div className="compose"><span>No prompt or field value is sent raw.</span><button disabled={active} onClick={()=>send("START_AGENT")}>Sanitize and continue <b>→</b></button></div></section>
 <section className="boundary"><div className="boundaryHead"><span>CAPABILITIES</span><strong>LOCAL VISION</strong></div><p>DOM scanning plus packaged UI, OCR, and face detection run locally. Only the irreversibly redacted image and schema-checked metadata may reach the planner.</p></section>
 <section className="activity"><div><p className="eyebrow">SESSION ACTIVITY</p><span className={`pill ${status.state.toLowerCase()}`}>{status.state.replaceAll('_',' ')}</span></div><ul><li><i/>{status.message}</li>{status.planner&&<li><i/>Planner: {status.planner}</li>}</ul>{status.state==="AWAITING_APPROVAL"&&<button onClick={()=>send("APPROVE_ACTION")}>Approve final submit</button>}{active&&<button onClick={()=>send("STOP_AGENT")}>Cancel and purge</button>}</section>
 <footer><span>Local-first architecture</span><span>Remote HTTPS planner</span></footer></main>}
