import { describe, expect, it } from "vitest";
import { buildCombinedMaskRects } from "../src/privacy/masking";
import { prepareLivePrivacyPipeline, sanitizeUserGoal, type LivePipelineDeps } from "../src/agent/live-pipeline";

const sensitiveDom = [
  { id: "E001", observationVersion: "v1", role: "textbox", label: "Password", bbox: [10, 5, 20, 10] as [number,number,number,number], visible: true, enabled: true, source: "DOM" as const },
  { id: "E002", observationVersion: "v1", role: "textbox", label: "Email", value: "[EMAIL_1]", bbox: [1, 1, 4, 3] as [number,number,number,number], visible: true, enabled: true, source: "DOM" as const },
  { id: "E003", observationVersion: "v1", role: "textbox", label: "OTP", bbox: [2, 8, 3, 2] as [number,number,number,number], visible: true, enabled: true, source: "DOM" as const },
  { id: "E004", observationVersion: "v1", role: "textbox", label: "PIN", bbox: [5, 8, 3, 2] as [number,number,number,number], visible: true, enabled: true, source: "DOM" as const },
  { id: "E005", observationVersion: "v1", role: "textbox", label: "Card number", bbox: [8, 8, 3, 2] as [number,number,number,number], visible: true, enabled: true, source: "DOM" as const },
  { id: "E006", observationVersion: "v1", role: "textbox", label: "CVV", bbox: [11, 8, 3, 2] as [number,number,number,number], visible: true, enabled: true, source: "DOM" as const },
];

describe("P0 privacy gaps", () => {
  it("solid-masks semantic DOM fields when OCR returns no regions and scales CSS to bitmap coordinates", () => {
    const rects = buildCombinedMaskRects(sensitiveDom, [], [], { viewportWidthCss: 100, viewportHeightCss: 50, width: 300, height: 100 });
    expect(rects).toHaveLength(6);
    expect(rects[0]).toEqual({ x: 26, y: 6, width: 68, height: 28 });
  });

  it("combines bitmap OCR and FACE boxes without scaling them a second time", () => {
    const ocr = [{ x: 30, y: 20, width: 9, height: 5, reason: "TEXT" as const, sensitivity: "HIGH" as const, confidence: 1, source: "OCR" as const }];
    const face = [{ x: 60, y: 30, width: 12, height: 8, reason: "FACE" as const, sensitivity: "HIGH" as const, confidence: 1, source: "FACE" as const }];
    const rects = buildCombinedMaskRects([], ocr, face, { viewportWidthCss: 100, viewportHeightCss: 50, width: 300, height: 100 });
    expect(rects).toEqual([{ x: 26, y: 16, width: 17, height: 13 }, { x: 56, y: 26, width: 20, height: 16 }]);
  });

  it.each([
    ["login with password hunter2", "login with [REDACTED_PASSWORD_1]"],
    ["enter OTP 123456", "enter [REDACTED_OTP_1]"],
    ["use PIN 4321 and CVV 987", "use [REDACTED_PIN_1] and [REDACTED_CVV_1]"],
    ["use api key q7Zp4Kx9Vm2Nc8Rt5Wy3", "use api key [REDACTED_PASSWORD_1]"],
    ["my password is hunter2", "my [REDACTED_PASSWORD_1]"],
    ["OTP is 123456", "[REDACTED_OTP_1]"],
    ["PIN is 4321 and CVV is 987", "[REDACTED_PIN_1] and [REDACTED_CVV_1]"],
    ["use 123456 as the OTP", "use [REDACTED_OTP_1]"],
    ["password is 'two word secret'", "[REDACTED_PASSWORD_1]"],
  ])("tokenizes goal before planner egress: %s", (goal, expected) => expect(sanitizeUserGoal(goal)).toBe(expected));

  it("passes only the tokenized goal to approval/network metadata", async () => {
    let approvedGoal = "";
    const deps: Omit<LivePipelineDeps, "approve" | "network"> = {
      capture: async () => ({ kind:"RAW_CAPTURE", bytes:new Uint8Array(), width:1,height:1,capturedAt:1,trigger:"USER_ACTION",scrollX:0,scrollY:0,viewportWidthCss:1,viewportHeightCss:1,devicePixelRatio:1 }),
      localVision: async () => ({ detections:[],ocrRegions:[],faceRegions:[] }),
      redact: async () => ({ kind:"SANITIZED_CAPTURE",bytes:new Uint8Array(),sha256:"0".repeat(64) }),
    };
    const result = await prepareLivePrivacyPipeline({ observationVersion:"v1",sessionId:"s",stepId:0,goal:"password hunter2",origin:"https://safe.test",title:"",dom:[] }, deps);
    approvedGoal = result.metadata.goal;
    expect(approvedGoal).toBe("[REDACTED_PASSWORD_1]");
    expect(approvedGoal).not.toMatch(/^\[(?:PASSWORD|OTP|PIN|CVV)_\d+\]$/);
    expect(JSON.stringify(result.metadata)).not.toContain("hunter2");
  });

  it.each(["hunter2", "123456", "4321", "987", "two word secret"])("removes source secret from planner metadata: %s", async secret => {
    const deps: Omit<LivePipelineDeps, "approve" | "network"> = {
      capture: async () => ({ kind:"RAW_CAPTURE", bytes:new Uint8Array(), width:1,height:1,capturedAt:1,trigger:"USER_ACTION",scrollX:0,scrollY:0,viewportWidthCss:1,viewportHeightCss:1,devicePixelRatio:1 }),
      localVision: async () => ({ detections:[],ocrRegions:[],faceRegions:[] }),
      redact: async () => ({ kind:"SANITIZED_CAPTURE",bytes:new Uint8Array(),sha256:"0".repeat(64) }),
    };
    const label = secret === "123456" ? "OTP" : secret === "4321" ? "PIN" : secret === "987" ? "CVV" : "password";
    const quoted = secret.includes(" ") ? `'${secret}'` : secret;
    const result = await prepareLivePrivacyPipeline({observationVersion:"v1",sessionId:"s",stepId:0,goal:`my ${label} is ${quoted}`,origin:"https://safe.test",title:"",dom:[]},deps);
    expect(JSON.stringify(result.metadata)).not.toContain(secret);
  });
});
