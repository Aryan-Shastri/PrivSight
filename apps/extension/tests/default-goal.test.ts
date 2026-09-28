import {describe,expect,it} from "vitest";
import {DEFAULT_AUTONOMOUS_GOAL,REMOTE_PLANNER_TIMEOUT_MS} from "../src/agent/default-goal";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

describe("promptless planning defaults",()=>{
  it("uses a fixed non-sensitive goal rather than user input",()=>{
    expect(DEFAULT_AUTONOMOUS_GOAL).toContain("safest valid next action");
    expect(DEFAULT_AUTONOMOUS_GOAL).not.toMatch(/password|otp|cvv|pin/i);
  });
  it("allows bounded Modal cold starts",()=>expect(REMOTE_PLANNER_TIMEOUT_MS).toBe(180_000));
  it("removes the free-form goal prompt from the side panel",()=>{
    const source=readFileSync(resolve(import.meta.dirname,"../entrypoints/sidepanel/App.tsx"),"utf8");
    expect(source).not.toContain("<textarea");
    expect(source).toContain("goal:DEFAULT_AUTONOMOUS_GOAL");
  });
  it("declares dynamically requested page origins and surfaces click failures",()=>{
    const config=readFileSync(resolve(import.meta.dirname,"../wxt.config.ts"),"utf8");
    const source=readFileSync(resolve(import.meta.dirname,"../entrypoints/sidepanel/App.tsx"),"utf8");
    expect(config).toContain('optional_host_permissions: ["<all_urls>"]');
    expect(source).toContain('origins:["<all_urls>"]');
    expect(source).toContain("catch(error)");
    expect(source).toContain("'ERROR','ASK_USER'");
  });
});
