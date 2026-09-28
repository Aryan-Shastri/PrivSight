// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";

let listener:(message:unknown,sender:unknown,reply:(value:unknown)=>void)=>boolean|void;
beforeEach(()=>{
  document.body.innerHTML="";
  delete (window as typeof window&{__privsightInstalled?:boolean}).__privsightInstalled;
  (globalThis as unknown as {chrome:unknown}).chrome={runtime:{onMessage:{addListener:vi.fn(fn=>{listener=fn})}}};
  vi.spyOn(Element.prototype,"getBoundingClientRect").mockReturnValue({x:1,y:1,width:100,height:20,left:1,top:1,right:101,bottom:21,toJSON(){}} as DOMRect);
  globalThis.eval(readFileSync(`${process.cwd()}/public/content-runtime.js`,"utf8"));
});
const execute=(message:unknown)=>new Promise<unknown>(resolve=>listener(message,{},resolve));
const scan=()=>execute({type:"SCAN_DOM",observationVersion:"v1"});

describe("injected action runtime",()=>{
  it("rejects actions whose live DOM role is incompatible",async()=>{
    document.body.innerHTML='<div tabindex="0"></div>';await scan();
    expect(await execute({type:"EXECUTE_ACTION",action:{type:"CLICK",elementId:"E001"},requiresConfirmation:false,observationVersion:"v1"})).toEqual({ok:false,error:"ROLE_MISMATCH"});
  });
  it("uses the validator-provided confirmation classification",async()=>{
    document.body.innerHTML='<button type="button">Continue</button>';await scan();
    const action={type:"CLICK",elementId:"E001"};
    expect(await execute({type:"EXECUTE_ACTION",action,requiresConfirmation:true,observationVersion:"v1"})).toEqual({ok:true,result:{status:"APPROVAL_REQUIRED",action}});
  });
  it("rejects direct payment-token execution",async()=>{
    document.body.innerHTML='<input type="text" autocomplete="cc-number">';await scan();
    expect(await execute({type:"EXECUTE_TOKEN_VALUE",elementId:"E001",origin:location.origin,fieldRole:"card-number",value:"4111",observationVersion:"v1"})).toEqual({ok:false,error:"UNSUPPORTED_PAYMENT_EXECUTION"});
  });
  it("rejects payment-token execution even when approved",async()=>{
    document.body.innerHTML='<input type="text" autocomplete="cc-number">';await scan();
    expect(await execute({type:"EXECUTE_TOKEN_VALUE",elementId:"E001",origin:location.origin,fieldRole:"card-number",value:"4111",approved:true,requiresConfirmation:true,observationVersion:"v1"})).toEqual({ok:false,error:"UNSUPPORTED_PAYMENT_EXECUTION"});
  });
  it("recursively scans open shadow DOM and resolves aria-labelledby",async()=>{
    document.body.innerHTML='<span id="caption">Shadow action</span><div id="host"></div>';
    const root=document.querySelector("#host")!.attachShadow({mode:"open"});root.innerHTML='<button aria-labelledby="caption">x</button>';
    const result=await scan() as any;
    expect(result.elements.some((e:any)=>e.role==="button"&&e.label==="Shadow action")).toBe(true);
  });
  it("invalidates the complete element index after a DOM mutation",async()=>{
    document.body.innerHTML='<button>Continue</button>';await scan();
    document.querySelector("button")!.setAttribute("aria-label","Changed");
    await Promise.resolve();
    expect(await execute({type:"EXECUTE_ACTION",action:{type:"CLICK",elementId:"E001"},requiresConfirmation:false,observationVersion:"v1"})).toEqual({ok:false,error:"STALE_ELEMENT"});
  });
});
