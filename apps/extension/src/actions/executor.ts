import type {AgentAction} from "./schemas";
export type ExecutionResult={status:"EXECUTED"}|{status:"APPROVAL_REQUIRED";action:AgentAction}|{status:"DISPLAY";message:string};
export interface ExecutionContext{document:Document;approvedAction?:AgentAction;resolveToken:(token:string,role:string)=>Promise<string>}
const target=(d:Document,id:string)=>d.querySelector<HTMLElement>(`[data-privsight-id="${id}"]`);
const sameAction=(left:AgentAction|undefined,right:AgentAction)=>left!==undefined&&JSON.stringify(left)===JSON.stringify(right);
export async function executeAction(action:AgentAction,c:ExecutionContext):Promise<ExecutionResult>{
 if(action.type==="ASK_USER"||action.type==="DONE")return{status:"DISPLAY",message:"message" in action?action.message:action.summary};
 if(action.type==="WAIT"){await new Promise(r=>setTimeout(r,action.milliseconds));return{status:"EXECUTED"}}
 if(action.type==="SCROLL"){c.document.defaultView?.scrollBy({top:(action.direction==="DOWN"?1:-1)*action.amountPx,behavior:"auto"});return{status:"EXECUTED"}}
 if(!("elementId" in action))throw new Error("INVALID_ACTION");const el=target(c.document,action.elementId);if(!el)throw new Error("INVALID_ELEMENT");
 const submit=action.type==="CLICK"&&(el instanceof HTMLButtonElement&&(el.type==="submit"||/submit|purchase|delete/i.test(el.textContent??"")));
 if(submit&&!sameAction(c.approvedAction,action))return{status:"APPROVAL_REQUIRED",action};
 if(action.type==="CLICK")el.click();
 else if(action.type==="CHECK"||action.type==="UNCHECK"){if(!(el instanceof HTMLInputElement))throw new Error("ROLE_MISMATCH");el.checked=action.type==="CHECK";el.dispatchEvent(new Event("change",{bubbles:true}))}
 else if(action.type==="SELECT"){if(!(el instanceof HTMLSelectElement))throw new Error("ROLE_MISMATCH");el.value=action.option;el.dispatchEvent(new Event("change",{bubbles:true}))}
 else {if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))throw new Error("ROLE_MISMATCH");el.value=action.type==="TYPE_TOKEN"?await c.resolveToken(action.token,el.getAttribute("autocomplete")||el.getAttribute("type")||"textbox"):action.text;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
 return{status:"EXECUTED"};
}
