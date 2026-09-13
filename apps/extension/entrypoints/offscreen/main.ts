import type { VisionWorkerRequest, VisionWorkerResponse } from "../../src/vision/worker-contract";
import type { RawCapture } from "../../src/agent/live-pipeline";
import type { RedactionRegion } from "../../src/privacy/types";

const worker = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module", name: "privsight-local-vision" });
const pending = new Map<string, (response: VisionWorkerResponse) => void>();
worker.onmessage = ({ data }: MessageEvent<VisionWorkerResponse>) => { pending.get(data.requestId)?.(data); pending.delete(data.requestId); };
worker.onerror = () => { for (const [requestId, resolve] of pending) resolve({ type: "LOCAL_VISION_ERROR", requestId, code: "INFERENCE_UNAVAILABLE" }); pending.clear(); };

async function imageFromPng(capture: RawCapture): Promise<{ bitmap: ImageBitmap; rgba: Uint8Array }> {
  const bytes = capture.bytes instanceof Uint8Array ? capture.bytes : Uint8Array.from(capture.bytes as unknown as number[]);
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }));
  if (bitmap.width !== capture.width || bitmap.height !== capture.height) { bitmap.close(); throw Error("CAPTURE_DIMENSION_MISMATCH"); }
  const canvas = new OffscreenCanvas(capture.width, capture.height); const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) { bitmap.close(); throw Error("LOCAL_RUNTIME_FAILURE"); } context.drawImage(bitmap, 0, 0);
  return { bitmap, rgba: new Uint8Array(context.getImageData(0, 0, capture.width, capture.height).data) };
}
function runWorker(request: VisionWorkerRequest): Promise<VisionWorkerResponse> {
  return new Promise(resolve => { pending.set(request.requestId, resolve); worker.postMessage(request, [request.rgba.buffer]); });
}
async function maskedPng(bitmap: ImageBitmap, width: number, height: number, regions: RedactionRegion[]) {
  const canvas = new OffscreenCanvas(width, height); const context = canvas.getContext("2d");
  if (!context) throw Error("LOCAL_RUNTIME_FAILURE"); context.drawImage(bitmap, 0, 0); bitmap.close();
  context.fillStyle = "#000"; for (const region of regions) context.fillRect(region.x, region.y, region.width, region.height);
  const blob = await canvas.convertToBlob({ type: "image/png" }); const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  return { kind: "SANITIZED_CAPTURE" as const, bytes: [...bytes] as unknown as Uint8Array, sha256 };
}
function privacyRegion(region: { x:number;y:number;width:number;height:number;confidence:number }, kind: "OCR" | "FACE"): RedactionRegion {
  return { ...region, reason: kind === "OCR" ? "TEXT" : "FACE", sensitivity: "HIGH", source: kind };
}
browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const input = message as { type?: string; requestId?: string; capture?: RawCapture };
  if (input.type !== "PROCESS_LOCAL_PRIVACY") return false;
  void (async () => {
    const requestId = input.requestId || "invalid";
    try {
      if (!input.capture || input.capture.kind !== "RAW_CAPTURE") throw Error("INVALID_REQUEST");
      const decoded = await imageFromPng(input.capture);
      const visual = await runWorker({ type: "RUN_LOCAL_PRIVACY", requestId, width: input.capture.width, height: input.capture.height, rgba: decoded.rgba });
      if (visual.type === "LOCAL_VISION_ERROR") { decoded.bitmap.close(); return { type: "LOCAL_PRIVACY_ERROR", requestId, code: visual.code }; }
      const ocrRegions = visual.ocrRegions.map(region => privacyRegion(region, "OCR"));
      const faceRegions = visual.faceRegions.map(region => privacyRegion(region, "FACE"));
      const image = await maskedPng(decoded.bitmap, input.capture.width, input.capture.height, [...ocrRegions, ...faceRegions]);
      return { type: "LOCAL_PRIVACY_RESULT", requestId, vision: { detections: visual.detections, ocrRegions, faceRegions }, image, providers: visual.providers };
    } catch (error) {
      return { type: "LOCAL_PRIVACY_ERROR", requestId, code: error instanceof Error ? error.message : "LOCAL_RUNTIME_FAILURE" };
    }
  })().then(sendResponse);
  return true;
});
