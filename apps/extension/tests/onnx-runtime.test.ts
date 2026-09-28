import { describe, expect, it, vi } from "vitest";
import { createLocalVisionSession, loadVerifiedLocalModel } from "../src/vision/onnx-runtime";

describe("local ONNX runtime selection", () => {
  it("tries WebGPU first, falls back to WASM, and rejects remote model URLs", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("gpu unavailable")).mockResolvedValueOnce({ run: vi.fn() });
    const result = await createLocalVisionSession("/models/ui-detector.onnx", { create }, true);
    expect(create.mock.calls.map((call) => call[1].executionProviders)).toEqual([["webgpu"], ["wasm"]]);
    expect(result.provider).toBe("wasm");
    await expect(createLocalVisionSession("https://cdn.example/model.onnx", { create }, true)).rejects.toThrow("REMOTE_MODEL_FORBIDDEN");
  });

  it("falls back after an actual WebGPU inference failure instead of rejecting Brave", async () => {
    const gpuRun = vi.fn().mockRejectedValue(new Error("device lost"));
    const wasmRun = vi.fn().mockResolvedValue({ ok: true });
    const create = vi.fn().mockResolvedValueOnce({ run: gpuRun }).mockResolvedValueOnce({ run: wasmRun });
    const result = await createLocalVisionSession("/models/ui-detector.onnx", { create }, true);
    expect(result.provider).toBe("webgpu");
    await expect(result.session.run({})).resolves.toEqual({ ok: true });
    expect(create.mock.calls.map(call => call[1].executionProviders)).toEqual([["webgpu"], ["wasm"]]);
    expect(result.provider).toBe("wasm");
  });

  it("uses WASM directly only when navigator.gpu is absent", async () => {
    const create = vi.fn().mockResolvedValue({ run: vi.fn() });
    const result = await createLocalVisionSession("/models/ui-detector.onnx", { create }, false);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[1].executionProviders).toEqual(["wasm"]);
    expect(result.provider).toBe("wasm");
  });

  it("loads only hash-matching local model bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const digest = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
    const fetcher = vi.fn(async () => new Response(bytes));
    await expect(loadVerifiedLocalModel("chrome-extension://abc/models/model.onnx", digest, fetcher)).resolves.toEqual(bytes);
    await expect(loadVerifiedLocalModel("chrome-extension://abc/models/model.onnx", "0".repeat(64), fetcher)).rejects.toThrow("MODEL_INTEGRITY_FAILURE");
    expect(fetcher).toHaveBeenCalledWith("chrome-extension://abc/models/model.onnx", { cache: "no-store" });
  });
});
