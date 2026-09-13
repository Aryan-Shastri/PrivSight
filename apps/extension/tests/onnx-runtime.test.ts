import { describe, expect, it, vi } from "vitest";
import { createLocalVisionSession, loadVerifiedLocalModel } from "../src/vision/onnx-runtime";

describe("local ONNX runtime selection", () => {
  it("tries WebGPU first, falls back to WASM, and rejects remote model URLs", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("gpu unavailable")).mockResolvedValueOnce({ run: vi.fn() });
    const result = await createLocalVisionSession("/models/ui-detector.onnx", { create });
    expect(create.mock.calls.map((call) => call[1].executionProviders)).toEqual([["webgpu"], ["wasm"]]);
    expect(result.provider).toBe("wasm");
    await expect(createLocalVisionSession("https://cdn.example/model.onnx", { create })).rejects.toThrow("REMOTE_MODEL_FORBIDDEN");
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
