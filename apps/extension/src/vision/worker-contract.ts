import type { VisualDetection } from "./merge";
import type { ModelRegion } from "./privacy-models";

export interface VisionWorkerRequest {
  type: "RUN_LOCAL_PRIVACY";
  requestId: string;
  width: number;
  height: number;
  rgba: Uint8Array;
}
export type VisionWorkerResponse =
  | { type: "LOCAL_VISION_RESULT"; requestId: string; detections: VisualDetection[]; ocrRegions: ModelRegion[]; faceRegions: ModelRegion[]; providers: { ui: "webgpu" | "wasm"; ocr: "webgpu" | "wasm"; face: "webgpu" | "wasm" } }
  | { type: "LOCAL_VISION_ERROR"; requestId: string; code: "INVALID_REQUEST" | "INFERENCE_UNAVAILABLE" | "INVALID_OUTPUT" | "MODEL_INTEGRITY_FAILURE" };

export function parseVisionWorkerRequest(value: unknown): VisionWorkerRequest {
  const request = value as Partial<VisionWorkerRequest> | null;
  if (!request || request.type !== "RUN_LOCAL_PRIVACY" || typeof request.requestId !== "string" || !request.requestId || !Number.isInteger(request.width) || !Number.isInteger(request.height) || (request.width ?? 0) <= 0 || (request.height ?? 0) <= 0 || !(request.rgba instanceof Uint8Array) || request.rgba.byteLength !== request.width! * request.height! * 4) throw new Error("INVALID_VISION_REQUEST");
  return request as VisionWorkerRequest;
}
