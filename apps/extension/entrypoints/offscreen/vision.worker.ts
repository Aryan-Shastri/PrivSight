import * as ort from "onnxruntime-web";
import { configurePackagedWasmPaths, createLocalVisionSession, loadVerifiedLocalModel } from "../../src/vision/onnx-runtime";
import { MODEL_HASHES, MODEL_PATHS, decodeOcrHeatmap, decodeUltraFace, decodeYolox, preprocessPpOcr, preprocessUltraFace, preprocessYolox } from "../../src/vision/privacy-models";
import { parseVisionWorkerRequest, resolveExactImageIdentity, type VisionWorkerResponse } from "../../src/vision/worker-contract";

configurePackagedWasmPaths(self.location.origin);

let sessions: Promise<{ ui: Awaited<ReturnType<typeof createLocalVisionSession>>; ocr: Awaited<ReturnType<typeof createLocalVisionSession>>; face: Awaited<ReturnType<typeof createLocalVisionSession>> }> | undefined;
let workerRun = 0;
let ocrCache: { key: string; regions: ReturnType<typeof decodeOcrHeatmap> } | undefined;
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
    if (!sessions) ort.env.wasm.numThreads = request.wasmThreads ?? 1;
    const sessionReused = sessions !== undefined, sessionStart = performance.now();
    const runtime = await getSessions(), sessionLoadMs = performance.now() - sessionStart;
    let started = performance.now(); const uiInput = preprocessYolox(request.rgba, request.width, request.height); const uiPreprocess = performance.now() - started;
    started = performance.now(); const uiRaw = await runtime.ui.session.run({ images: new ort.Tensor("float32", uiInput.data, uiInput.dims) }); const uiInference = performance.now() - started;
    const { key: imageKey, cacheHit: ocrCacheHit } = await resolveExactImageIdentity(request.rgba, request.width, request.height, ocrCache?.key);
    let ocrRaw:unknown,ocrPreprocess=0,ocrInference=0;
    if(!ocrCacheHit){started = performance.now(); const ocrInput = preprocessPpOcr(request.rgba, request.width, request.height); ocrPreprocess = performance.now() - started;
    started = performance.now(); ocrRaw = await runtime.ocr.session.run({ x: new ort.Tensor("float32", ocrInput.data, ocrInput.dims) }); ocrInference = performance.now() - started;}
    started = performance.now(); const faceInput = preprocessUltraFace(request.rgba, request.width, request.height); const facePreprocess = performance.now() - started;
    started = performance.now(); const faceRaw = await runtime.face.session.run({ input: new ort.Tensor("float32", faceInput.data, faceInput.dims) }); const faceInference = performance.now() - started;
    const uiOutput = tensor(uiRaw, "output"), heatmap = ocrCacheHit?undefined:tensor(ocrRaw, "4"), scores = tensor(faceRaw, "scores"), boxes = tensor(faceRaw, "boxes");
    const heatmapDims = heatmap&&(heatmap.dims?.length ? heatmap.dims : [1, 1, 736, 736]);
    const scoresDims = scores.dims?.length ? scores.dims : [1, scores.data.length / 2, 2];
    const boxesDims = boxes.dims?.length ? boxes.dims : [1, boxes.data.length / 4, 4];
    started = performance.now(); const detections = decodeYolox(uiOutput.data as Float32Array, uiOutput.dims, request.width, request.height); const uiPostprocess = performance.now() - started;
    started = performance.now(); const ocrRegions = ocrCacheHit?ocrCache!.regions:decodeOcrHeatmap(heatmap!.data as Float32Array, heatmapDims!, request.width, request.height); const ocrPostprocess = performance.now() - started;
    if (!ocrCacheHit) ocrCache = { key: imageKey, regions: ocrRegions };
    started = performance.now(); const faceRegions = decodeUltraFace(scores.data as Float32Array, boxes.data as Float32Array, scoresDims, boxesDims, request.width, request.height); const facePostprocess = performance.now() - started;
    const response: VisionWorkerResponse = {
      type: "LOCAL_VISION_RESULT", requestId, detections, ocrRegions, faceRegions,
      providers: { ui: runtime.ui.provider, ocr: runtime.ocr.provider, face: runtime.face.provider },
      timings: { sessionLoadMs, sessionReused, workerRun: ++workerRun, ocrCacheHit, models: { ui: { preprocessMs: uiPreprocess, inferenceMs: uiInference, postprocessMs: uiPostprocess }, ocr: { preprocessMs: ocrPreprocess, inferenceMs: ocrInference, postprocessMs: ocrPostprocess }, face: { preprocessMs: facePreprocess, inferenceMs: faceInference, postprocessMs: facePostprocess } } },
    };
    postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = message === "INVALID_VISION_REQUEST" ? "INVALID_REQUEST" : message === "INVALID_OUTPUT" ? "INVALID_OUTPUT" : message.includes("INTEGRITY") ? "MODEL_INTEGRITY_FAILURE" : "INFERENCE_UNAVAILABLE";
    postMessage({ type: "LOCAL_VISION_ERROR", requestId, code } satisfies VisionWorkerResponse);
  }
};
