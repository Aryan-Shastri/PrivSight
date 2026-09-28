import { describe, expect, it, vi } from "vitest";
import { runLivePrivacyPipeline, type ApprovedPayload, type LivePipelineDeps } from "../src/agent/live-pipeline";

const raw = new Uint8Array([82, 65, 87, 95, 83, 69, 67, 82, 69, 84]);
const sanitized = new Uint8Array([83, 65, 70, 69]);
const capture = { kind: "RAW_CAPTURE" as const, bytes: raw, width: 2, height: 2, capturedAt: 1, trigger: "USER_ACTION" as const, scrollX: 0, scrollY: 0, viewportWidthCss: 2, viewportHeightCss: 2, devicePixelRatio: 1 };
const dom = [{ id: "E001", observationVersion: "v7", role: "button", bbox: [0, 0, 1, 1] as [number, number, number, number], enabled: true, visible: true, source: "DOM" as const }];

function deps(overrides: Partial<LivePipelineDeps> = {}): LivePipelineDeps {
  const events: string[] = [];
  return {
    capture: async () => capture,
    localVision: async () => ({ detections: [{ className: "icon", confidence: .9, bbox: { x: 1, y: 1, width: 1, height: 1 } }], ocrRegions: [], faceRegions: [] }),
    redact: async (_capture, _regions) => { events.push("redact"); return { kind: "SANITIZED_CAPTURE", bytes: sanitized, sha256: "a".repeat(64) }; },
    approve: async (_metadata, image) => { events.push("approve"); expect(image.bytes).toEqual(sanitized); return { ok: true as const, value: { metadata: _metadata, image } }; },
    network: async (payload: ApprovedPayload) => { events.push("network"); expect(payload.image.bytes).toEqual(sanitized); expect(payload.image.bytes).not.toEqual(raw); return { planner: "MOCK PLANNER (TEST DOUBLE)", action: { type: "DONE", summary: "ok" } }; },
    events,
    ...overrides,
  };
}

describe("live privacy pipeline", () => {
  it("never exposes raw screenshot bytes to the network and redacts before approval", async () => {
    const d = deps();
    await runLivePrivacyPipeline({ observationVersion: "v7", sessionId: "s", stepId: 0, goal: "g", origin: "https://safe.test", title: "t", dom }, d);
    expect(d.events).toEqual(["redact", "approve", "network"]);
  });

  it("binds generated visual IDs to the current observation version", async () => {
    const d = deps();
    const result = await runLivePrivacyPipeline({ observationVersion: "v7", sessionId: "s", stepId: 0, goal: "g", origin: "https://safe.test", title: "t", dom }, d);
    expect(result.evidence.find(e => e.id === "V001")?.observationVersion).toBe("v7");
  });

  it.each(["UI_MODEL_UNAVAILABLE", "OCR_MODEL_UNAVAILABLE", "FACE_MODEL_UNAVAILABLE", "LOCAL_RUNTIME_FAILURE"])("blocks egress when local privacy processing fails: %s", async code => {
    const network = vi.fn();
    await expect(runLivePrivacyPipeline({ observationVersion: "v7", sessionId: "s", stepId: 0, goal: "g", origin: "https://safe.test", title: "t", dom }, deps({ localVision: async () => { throw new Error(code); }, network }))).rejects.toThrow(code);
    expect(network).not.toHaveBeenCalled();
  });
});
