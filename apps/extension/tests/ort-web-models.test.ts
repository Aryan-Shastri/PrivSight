// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as ort from "onnxruntime-web";
import { preprocessPpOcr, preprocessUltraFace, preprocessYolox } from "../src/vision/privacy-models";

const model = (name: string) => new URL(`../public/models/${name}`, import.meta.url);
describe("packaged models in ORT-Web WASM", () => {
  it("loads and executes the trained six-class UI detector", async () => {
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(new Uint8Array(await readFile(model("privsight-ui6.onnx"))), { executionProviders: ["wasm"] });
    const input = preprocessYolox(new Uint8Array(4), 1, 1);
    const output = await session.run({ images: new ort.Tensor("float32", input.data, input.dims) });
    expect(output.output?.dims).toEqual([1, 3549, 11]);
  }, 60_000);
  it("loads and executes the fixed PP-OCRv3 contract", async () => {
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(new Uint8Array(await readFile(model("text_detection_en_ppocrv3_2023may.onnx"))), { executionProviders: ["wasm"] });
    const input = preprocessPpOcr(new Uint8Array(4), 1, 1);
    const output = await session.run({ x: new ort.Tensor("float32", input.data, input.dims) });
    expect(output["4"]?.dims).toEqual([736, 736]);
  }, 60_000);
  it("loads and executes the fixed UltraFace contract", async () => {
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(new Uint8Array(await readFile(model("version-RFB-320.onnx"))), { executionProviders: ["wasm"] });
    const input = preprocessUltraFace(new Uint8Array(4), 1, 1);
    const output = await session.run({ input: new ort.Tensor("float32", input.data, input.dims) });
    expect(output.scores?.dims).toEqual([1, 4420, 2]); expect(output.boxes?.dims).toEqual([1, 4420, 4]);
  }, 60_000);
});
