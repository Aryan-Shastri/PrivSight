import type {AgentAction} from "./schemas";

export interface ActionTarget {role:string; label?:string; options?:string[]; source?:string}
const CLICK_ROLES=new Set(["button","link","menuitem","menuitemcheckbox","menuitemradio","tab","radio","switch","submit","purchase","delete","account","security"]);
const HIGH_RISK=/\b(submit|purchase|buy|checkout|pay|delete|remove|close account|account|password|security|permission|authorize|transfer|send)\b/i;

export function actionTargetError(action:AgentAction,target:ActionTarget):"ROLE_MISMATCH"|"INVALID_OPTION"|undefined{
  if(action.type==="CLICK"&&!CLICK_ROLES.has(target.role.toLowerCase()))return "ROLE_MISMATCH";
  if((action.type==="TYPE_TEXT"||action.type==="TYPE_TOKEN")&&target.role.toLowerCase()!=="textbox")return "ROLE_MISMATCH";
  if(action.type==="SELECT"){
    if(target.role.toLowerCase()!=="combobox")return "ROLE_MISMATCH";
    if(!target.options?.includes(action.option))return "INVALID_OPTION";
  }
  if((action.type==="CHECK"||action.type==="UNCHECK")&&target.role.toLowerCase()!=="checkbox")return "ROLE_MISMATCH";
}

export function requiresConfirmation(action:AgentAction,target?:ActionTarget):boolean{
  if(action.type==="TYPE_TOKEN"&&/^\[(CVV|CARD)_\d+\]$/.test(action.token))return true;
  if(action.type==="CLICK"&&target?.source==="VISUAL"&&!target.label)return true;
  return action.type==="CLICK"&&!!target&&HIGH_RISK.test(`${target.role} ${target.label??""}`);
}
