import {describe, expect, it} from "vitest";
import {AgentActionSchema} from "../src/actions/schemas";
import {validateAction, type ActionContext} from "../src/actions/validator";

const context=(role:string, options?:string[]):ActionContext=>({observationVersion:"v1",actionObservationVersion:"v1",elements:new Map([["E001",{enabled:true,visible:true,role,options}]]),tokens:new Set(["[CVV_1]","[CARD_1]"])});

describe("closed action DSL",()=>{
  it("rejects unknown action and properties",()=>{expect(AgentActionSchema.safeParse({type:"EVAL",code:"x"}).success).toBe(false);expect(AgentActionSchema.safeParse({type:"CLICK",elementId:"E001",selector:"#x"}).success).toBe(false)});
  it("rejects stale observations",()=>expect(validateAction({type:"CLICK",elementId:"E001"},{...context("button"),actionObservationVersion:"v0"})).toEqual({ok:false,code:"STALE_OBSERVATION"}));
  it("rejects sensitive server text",()=>expect(validateAction({type:"TYPE_TEXT",elementId:"E001",text:"a@b.co"},context("textbox"))).toEqual({ok:false,code:"SENSITIVE_SERVER_TEXT"}));
  it("enforces scroll/wait schema limits",()=>{expect(AgentActionSchema.safeParse({type:"SCROLL",direction:"DOWN",amountPx:801}).success).toBe(false);expect(AgentActionSchema.safeParse({type:"WAIT",milliseconds:5001}).success).toBe(false)});
  it.each(["button","link","menuitem","tab"])("allows CLICK on actionable role %s",role=>expect(validateAction({type:"CLICK",elementId:"E001"},context(role)).ok).toBe(true));
  it.each(["textbox","checkbox","combobox","interactive"])("rejects CLICK on non-click role %s",role=>expect(validateAction({type:"CLICK",elementId:"E001"},context(role))).toEqual({ok:false,code:"ROLE_MISMATCH"}));
  it.each(["TYPE_TEXT","TYPE_TOKEN"] as const)("allows %s only on text inputs",type=>{const action=type==="TYPE_TEXT"?{type,elementId:"E001",text:"hello"}:{type,elementId:"E001",token:"[CVV_1]"};expect(validateAction(action,context("button"))).toEqual({ok:false,code:"ROLE_MISMATCH"})});
  it("allows SELECT only on a combobox and only for an observed option",()=>{expect(validateAction({type:"SELECT",elementId:"E001",option:"A"},context("textbox",["A"]))).toEqual({ok:false,code:"ROLE_MISMATCH"});expect(validateAction({type:"SELECT",elementId:"E001",option:"B"},context("combobox",["A"]))).toEqual({ok:false,code:"INVALID_OPTION"});expect(validateAction({type:"SELECT",elementId:"E001",option:"A"},context("combobox",["A"]))).toEqual({ok:true,requiresConfirmation:false})});
  it.each(["CHECK","UNCHECK"] as const)("allows %s only on checkbox",type=>expect(validateAction({type,elementId:"E001"},context("textbox"))).toEqual({ok:false,code:"ROLE_MISMATCH"}));
  it.each(["submit","purchase","delete","account","security"])("classifies %s actions as high risk",role=>expect(validateAction({type:"CLICK",elementId:"E001"},context(role))).toEqual({ok:true,requiresConfirmation:true}));
  it.each(["[CVV_1]","[CARD_1]"])("classifies payment token %s as high risk",token=>expect(validateAction({type:"TYPE_TOKEN",elementId:"E001",token},context("textbox"))).toEqual({ok:true,requiresConfirmation:true}));
  it("requires confirmation when a visual-only click has no safely determined consequence",()=>{const c=context("button");c.elements=new Map([["V001",{enabled:true,visible:true,role:"button",source:"VISUAL"}]]);expect(validateAction({type:"CLICK",elementId:"V001"},c)).toEqual({ok:true,requiresConfirmation:true})});
});
