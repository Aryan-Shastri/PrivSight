import {describe,expect,it} from "vitest";
import {rebindFreshDomTarget} from "../src/actions/dom-target";

const target=(id:string,label="Continue")=>({id,role:"submit",label,tagName:"input",inputType:"submit",enabled:true,visible:true,source:"DOM"});

describe("fresh DOM target rebinding after approval",()=>{
  it("rebinds the same semantic target to a fresh element id",()=>{
    expect(rebindFreshDomTarget(target("E004"),[target("E006")])).toBe("E006");
  });
  it("fails closed when the target is absent or ambiguous",()=>{
    expect(()=>rebindFreshDomTarget(target("E004"),[])).toThrow("STALE_ELEMENT");
    expect(()=>rebindFreshDomTarget(target("E004"),[target("E006"),target("E007")])).toThrow("STALE_ELEMENT");
  });
  it("does not accept a changed label",()=>expect(()=>rebindFreshDomTarget(target("E004"),[target("E006","Delete")])).toThrow("STALE_ELEMENT"));
});
