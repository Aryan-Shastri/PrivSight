import * as ort from "onnxruntime-web";
import { createLocalVisionSession, loadVerifiedLocalModel } from "../../src/vision/onnx-runtime";
import { MODEL_HASHES, MODEL_PATHS, decodeOcrHeatmap, decodeUltraFace, decodeYolox, preprocessPpOcr, preprocessUltraFace, preprocessYolox } from "../../src/vision/privacy-models";
import { parseVisionWorkerRequest, type VisionWorkerResponse } from "../../src/vision/worker-contract";

ort.env.wasm.numThreads = 1;

let sessions: Promise<{ ui: Awaited<ReturnType<typeof createLocalVisionSession>>; ocr: Awaited<ReturnType<typeof createLocalVisionSession>>; face: Awaited<ReturnType<typeof createLocalVisionSession>> }> | undefined;
function modelUrl(path: string): string { return new URL(path.replace(/^\//, ""), self.location.origin + "/").href; }
async function getSessions() {
  return sessions ??= (async () => {
    const [uiBytes, ocrBytes, faceBytes] = await Promise.all([
      loadVerifiedLocalModel(modelUrl(MODEL_PATHS.ui), MODEL_HASHES.ui),
      loadVerifiedLocalModel(modelUrl(MODEL_PATHS.ocr), MODEL_HASHES.ocr),
      loadVerifiedLocalModel(modelUrl(MODEL_PATHS.face), MODEL_HASHES.face),
    ]);
    const factory = { create: (model: string | Uint8Array, options: { executionProviders: ("webgpu" | "wasm")[] }) => {
      if (options.executionProviders[0] === "webgpu" && !("gpu" in navigator)) return Promise.reject(new Error("WebGPU unavailable"));
      return typeof model === "string" ? ort.InferenceSession.create(model, options) : ort.InferenceSession.create(model, options);
    } };
    const ui = await createLocalVisionSession(uiBytes, factory);
    const ocr = await createLocalVisionSession(ocrBytes, factory);
    const face = await createLocalVisionSession(faceBytes, factory);
    return { ui, ocr, face };
  })().catch(error => { sessions = undefined; throw error; });
}
function tensor(output: unknown, name: string): ort.Tensor {
  const value = (output as Record<string, unknown>)[name];
  if (!(value instanceof ort.Tensor) || !(value.data instanceof Float32Array)) throw new Error("INVALID_OUTPUT");
  return value;
}
self.onmessage = async ({ data }: MessageEvent<unknown>) => {
  let requestId = "invalid";
  try {
    const request = parseVisionWorkerRequest(data); requestId = request.requestId;
    const runtime = await getSessions();
    const uiInput=preprocessYolox(request.rgba,request.width,request.height);const uiRaw=await runtime.ui.session.run({images:new ort.Tensor("float32",uiInput.data,uiInput.dims)});
    const ocrRaw = await runtime.ocr.session.run({ x: new ort.Tensor("float32", preprocessPpOcr(request.rgba, request.width, request.height).data, [1,3,736,736]) });
    const faceRaw = await runtime.face.session.run({ input: new ort.Tensor("float32", preprocessUltraFace(request.rgba, request.width, request.height).data, [1,3,240,320]) });
    const uiOutput=tensor(uiRaw,"output");const heatmap = tensor(ocrRaw, "4"); const scores = tensor(faceRaw, "scores"); const boxes = tensor(faceRaw, "boxes");
    const heatmapDims = heatmap.dims?.length ? heatmap.dims : [1, 1, 736, 736];
    const scoresDims = scores.dims?.length ? scores.dims : [1, scores.data.length / 2, 2];
    const boxesDims = boxes.dims?.length ? boxes.dims : [1, boxes.data.length / 4, 4];
    const response: VisionWorkerResponse = {
      type: "LOCAL_VISION_RESULT", requestId, detections: decodeYolox(uiOutput.data as Float32Array,uiOutput.dims,request.width,request.height),
      ocrRegions: decodeOcrHeatmap(heatmap.data as Float32Array, heatmapDims, request.width, request.height),
      faceRegions: decodeUltraFace(scores.data as Float32Array, boxes.data as Float32Array, scoresDims, boxesDims, request.width, request.height),
      providers: { ui:runtime.ui.provider, ocr: runtime.ocr.provider, face: runtime.face.provider },
    };
    postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = message === "INVALID_VISION_REQUEST" ? "INVALID_REQUEST" : message === "INVALID_OUTPUT" ? "INVALID_OUTPUT" : message.includes("INTEGRITY") ? "MODEL_INTEGRITY_FAILURE" : "INFERENCE_UNAVAILABLE";
    postMessage({ type: "LOCAL_VISION_ERROR", requestId, code } satisfies VisionWorkerResponse);
  }
};
