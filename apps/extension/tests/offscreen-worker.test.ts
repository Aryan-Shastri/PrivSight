import { describe, expect, it, vi } from "vitest";
import { ensureOffscreenHost } from "../src/vision/offscreen-lifecycle";
import { parseVisionWorkerRequest } from "../src/vision/worker-contract";

describe("offscreen compute lifecycle and worker contract", () => {
  it("coalesces creation and recreates the required host after it disappears", async () => {
    let present = false;
    const api = { hasDocument: vi.fn(async () => present), createDocument: vi.fn(async () => { present = true; }) };
    await Promise.all([ensureOffscreenHost(api), ensureOffscreenHost(api)]);
    expect(api.createDocument).toHaveBeenCalledTimes(1);
    present = false;
    await ensureOffscreenHost(api);
    expect(api.createDocument).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed dedicated-worker requests", () => {
    expect(() => parseVisionWorkerRequest({ type: "RUN_LOCAL_PRIVACY", requestId: "r", rgba: new Uint8Array(0) })).toThrow("INVALID_VISION_REQUEST");
  });
});
