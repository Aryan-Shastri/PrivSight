import type {AgentAction} from "./schemas";
import {AgentActionSchema} from "./schemas";
import {actionTargetError, requiresConfirmation} from "./policy";
import {detectStructuredPii} from "../privacy/detectors";

export interface ActionContext {observationVersion:string;actionObservationVersion:string;elements:Map<string,{enabled:boolean;visible:boolean;role:string;label?:string;options?:string[];source?:string}>;tokens:Set<string>}
export type Validation={ok:true;requiresConfirmation:boolean}|{ok:false;code:string};

export function validateAction(raw:unknown,c:ActionContext):Validation{
  const parsed=AgentActionSchema.safeParse(raw);
  if(!parsed.success)return{ok:false,code:"INVALID_ACTION"};
  if(c.observationVersion!==c.actionObservationVersion)return{ok:false,code:"STALE_OBSERVATION"};
  const action:AgentAction=parsed.data;
  let target;
  if("elementId" in action){
    target=c.elements.get(action.elementId);
    if(!target||!target.visible||!target.enabled)return{ok:false,code:"INVALID_ELEMENT"};
    const error=actionTargetError(action,target);
    if(error)return{ok:false,code:error};
  }
  if(action.type==="TYPE_TEXT"&&detectStructuredPii(action.text).length)return{ok:false,code:"SENSITIVE_SERVER_TEXT"};
  if(action.type==="TYPE_TOKEN"&&!c.tokens.has(action.token))return{ok:false,code:"TOKEN_NOT_FOUND"};
  return{ok:true,requiresConfirmation:requiresConfirmation(action,target)};
}
