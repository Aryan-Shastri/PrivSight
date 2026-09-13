// @vitest-environment jsdom
import {describe, expect, it, vi} from "vitest";
import {buildSanitizedStep, sendApprovedAgentStep} from "../src/agent/e2e-loop";
import {executeAction} from "../src/actions/executor";

const scanned = [
  {id:"E001", observationVersion:"v1", role:"textbox", label:"Email", value:"alice@example.com", bbox:[0,0,100,20] as [number,number,number,number], visible:true, enabled:true, source:"DOM" as const},
  {id:"E002", observationVersion:"v1", role:"button", label:"Submit application", bbox:[0,30,100,20] as [number,number,number,number], visible:true, enabled:true, source:"DOM" as const},
];

describe("extension → planner loop",()=>{
  it("builds server-schema metadata without raw PII and with a matching image hash",async()=>{
    const image=new Uint8Array([137,80,78,71]);
    const step=await buildSanitizedStep({sessionId:"s1",stepId:0,observationVersion:"v1",goal:"complete registration",origin:"http://127.0.0.1:4173",title:"Demo",elements:scanned,image});
    expect(JSON.stringify(step.metadata)).not.toContain("alice@example.com");
    expect(step.metadata.elements[0]?.value).toBe("[EMAIL_1]");
    expect(step.metadata.redaction.bySensitivity).toEqual({HIGH:1});
    expect(step.metadata.redaction.sanitizedImageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("posts the exact multipart fields and binds the returned action to the observation",async()=>{
    const fetcher=vi.fn(async (_url:RequestInfo|URL, init?:RequestInit)=>{
      const form=init?.body as FormData;
      expect([...form.keys()]).toEqual(["metadata","image"]);
      expect((form.get("image") as File).type).toBe("image/png");
      return new Response(JSON.stringify({planner:"MOCK PLANNER",action:{type:"CLICK",elementId:"E001"}}),{status:200,headers:{"content-type":"application/json"}});
    });
    const metadata={schemaVersion:"1.0" as const,sessionId:"s",stepId:0,observationVersion:"v9",goal:"g",page:{origin:"http://localhost:1",title:"t"},elements:[],redaction:{count:0,sanitizedImageSha256:"0".repeat(64)}};
    const result=await sendApprovedAgentStep({metadata,image:{kind:"SANITIZED_CAPTURE",bytes:new Uint8Array([137,80,78,71]),sha256:"0".repeat(64)}},fetcher);
    expect(result).toEqual({planner:"MOCK PLANNER",action:{type:"CLICK",elementId:"E001"}});
  });
});

describe("local safe executor",()=>{
  it("types locally and emits input/change",async()=>{
    document.body.innerHTML='<input data-privsight-id="E001">';
    const input=document.querySelector("input")!;let changed=0;input.addEventListener("input",()=>changed++);
    expect(await executeAction({type:"TYPE_TEXT",elementId:"E001",text:"hello"},{document,resolveToken:async()=>{throw Error("unused")}})).toEqual({status:"EXECUTED"});
    expect(input.value).toBe("hello");expect(changed).toBe(1);
  });
  it("requires explicit approval for submit and never clicks before approval",async()=>{
    document.body.innerHTML='<button type="submit" data-privsight-id="E002">Submit application</button>';
    const button=document.querySelector("button")!;let clicks=0;button.addEventListener("click",e=>{e.preventDefault();clicks++});
    expect(await executeAction({type:"CLICK",elementId:"E002"},{document,resolveToken:async()=>""})).toEqual({status:"APPROVAL_REQUIRED",action:{type:"CLICK",elementId:"E002"}});
    expect(clicks).toBe(0);
    expect(await executeAction({type:"CLICK",elementId:"E002"},{document,approvedAction:{type:"CLICK",elementId:"E002"},resolveToken:async()=>""})).toEqual({status:"EXECUTED"});expect(clicks).toBe(1);
  });
});
