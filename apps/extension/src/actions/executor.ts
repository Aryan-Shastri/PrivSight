import type {AgentAction} from "./schemas";
import {actionTargetError, requiresConfirmation} from "./policy";
export type ExecutionResult={status:"EXECUTED"}|{status:"APPROVAL_REQUIRED";action:AgentAction}|{status:"DISPLAY";message:string};
export interface ExecutionContext{document:Document;approvedAction?:AgentAction;requiresConfirmation?:boolean;resolveToken:(token:string,role:string)=>Promise<string>}
const target=(d:Document,id:string)=>d.querySelector<HTMLElement>(`[data-privsight-id="${id}"]`);
const sameAction=(left:AgentAction|undefined,right:AgentAction)=>left!==undefined&&JSON.stringify(left)===JSON.stringify(right);
const describe=(el:HTMLElement)=>({
 role:el.getAttribute("role")||({BUTTON:"button",A:"link",SELECT:"combobox",TEXTAREA:"textbox",INPUT:(el as HTMLInputElement).type==="checkbox"?"checkbox":"textbox"}[el.tagName]??"interactive"),
 label:el.getAttribute("aria-label")||el.textContent||undefined,
 options:el instanceof HTMLSelectElement?[...el.options].map(option=>option.value):undefined,
});
export async function executeAction(action:AgentAction,c:ExecutionContext):Promise<ExecutionResult>{
 if(action.type==="ASK_USER"||action.type==="DONE")return{status:"DISPLAY",message:"message" in action?action.message:action.summary};
 if(action.type==="WAIT"){await new Promise(r=>setTimeout(r,action.milliseconds));return{status:"EXECUTED"}}
 if(action.type==="SCROLL"){c.document.defaultView?.scrollBy({top:(action.direction==="DOWN"?1:-1)*action.amountPx,behavior:"auto"});return{status:"EXECUTED"}}
 if(!("elementId" in action))throw new Error("INVALID_ACTION");const el=target(c.document,action.elementId);if(!el)throw new Error("INVALID_ELEMENT");
 const details=describe(el),error=actionTargetError(action,details);if(error)throw new Error(error);
 const highRisk=c.requiresConfirmation??requiresConfirmation(action,details);
 if(highRisk&&!sameAction(c.approvedAction,action))return{status:"APPROVAL_REQUIRED",action};
 if(action.type==="CLICK")el.click();
 else if(action.type==="CHECK"||action.type==="UNCHECK"){const input=el as HTMLInputElement;input.checked=action.type==="CHECK";input.dispatchEvent(new Event("change",{bubbles:true}))}
 else if(action.type==="SELECT"){const select=el as HTMLSelectElement;select.value=action.option;select.dispatchEvent(new Event("change",{bubbles:true}))}
 else {const input=el as HTMLInputElement|HTMLTextAreaElement;input.value=action.type==="TYPE_TOKEN"?await c.resolveToken(action.token,el.getAttribute("autocomplete")||el.getAttribute("type")||"textbox"):action.text;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}))}
 return{status:"EXECUTED"};
}
