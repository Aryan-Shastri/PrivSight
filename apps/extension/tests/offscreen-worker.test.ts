import { describe, expect, it, vi } from "vitest";
import { ensureOffscreenHost } from "../src/vision/offscreen-lifecycle";
import { exactImageKey, parseVisionWorkerRequest, parseWasmBenchmarkConfig, resolveExactImageIdentity } from "../src/vision/worker-contract";

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

  it("accepts only supported WASM benchmark thread counts", () => {
    expect(parseWasmBenchmarkConfig("?wasmThreads=1")).toEqual({ numThreads: 1 });
    expect(parseWasmBenchmarkConfig("?wasmThreads=2")).toEqual({ numThreads: 2 });
    expect(parseWasmBenchmarkConfig("?wasmThreads=4")).toEqual({ numThreads: 4 });
    expect(() => parseWasmBenchmarkConfig("?wasmThreads=0")).toThrow("INVALID_WASM_CONFIG");
    expect(() => parseWasmBenchmarkConfig("?wasmThreads=8")).toThrow("INVALID_WASM_CONFIG");
  });

  it("produces the same SHA-256-scoped identity for the same frame", async () => {
    const frame = new Uint8Array([0, 1, 2, 3]);

    const first = await exactImageKey(frame, 1, 1);
    const second = await resolveExactImageIdentity(frame.slice(), 1, 1, first);

    expect(second).toEqual({ key: first, cacheHit: true });
    expect(first).toBe("1x1:4:054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8");
  });

  it("produces a different identity when one frame byte changes", async () => {
    const frame = new Uint8Array([0, 1, 2, 3]);
    const changed = frame.slice();
    changed[3] = 4;

    const cachedKey = await exactImageKey(frame, 1, 1);
    expect(await resolveExactImageIdentity(changed, 1, 1, cachedKey)).toMatchObject({ cacheHit: false });
    expect(await exactImageKey(frame, 2, 1)).not.toBe(await exactImageKey(frame, 1, 1));
  });
});
