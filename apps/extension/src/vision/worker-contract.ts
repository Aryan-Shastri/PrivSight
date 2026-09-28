import type { VisualDetection } from "./merge";
import type { ModelRegion } from "./privacy-models";

export interface VisionWorkerRequest {
  type: "RUN_LOCAL_PRIVACY";
  requestId: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  wasmThreads?: 1 | 2 | 4;
}
export interface ModelTiming { preprocessMs: number; inferenceMs: number; postprocessMs: number }
export interface VisionTimings {
  sessionLoadMs: number;
  models: { ui: ModelTiming; ocr: ModelTiming; face: ModelTiming };
  sessionReused: boolean;
  workerRun: number;
  ocrCacheHit?: boolean;
}

export async function exactImageKey(bytes: Uint8Array, width: number, height: number): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  const hex = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  return `${width}x${height}:${bytes.byteLength}:${hex}`;
}

export async function resolveExactImageIdentity(bytes: Uint8Array, width: number, height: number, cachedKey?: string): Promise<{ key: string; cacheHit: boolean }> {
  const key = await exactImageKey(bytes, width, height);
  return { key, cacheHit: key === cachedKey };
}
export type VisionWorkerResponse =
  | { type: "LOCAL_VISION_RESULT"; requestId: string; detections: VisualDetection[]; ocrRegions: ModelRegion[]; faceRegions: ModelRegion[]; providers: { ui: "webgpu" | "wasm"; ocr: "webgpu" | "wasm"; face: "webgpu" | "wasm" }; timings: VisionTimings }
  | { type: "LOCAL_VISION_ERROR"; requestId: string; code: "INVALID_REQUEST" | "INFERENCE_UNAVAILABLE" | "INVALID_OUTPUT" | "MODEL_INTEGRITY_FAILURE" };

export function parseVisionWorkerRequest(value: unknown): VisionWorkerRequest {
  const request = value as Partial<VisionWorkerRequest> | null;
  if (!request || request.type !== "RUN_LOCAL_PRIVACY" || typeof request.requestId !== "string" || !request.requestId || !Number.isInteger(request.width) || !Number.isInteger(request.height) || (request.width ?? 0) <= 0 || (request.height ?? 0) <= 0 || !(request.rgba instanceof Uint8Array) || request.rgba.byteLength !== request.width! * request.height! * 4 || (request.wasmThreads !== undefined && ![1, 2, 4].includes(request.wasmThreads))) throw new Error("INVALID_VISION_REQUEST");
  return request as VisionWorkerRequest;
}

export function parseWasmBenchmarkConfig(search: string): { numThreads: 1 | 2 | 4 } {
  const value = Number(new URLSearchParams(search).get("wasmThreads") ?? "1");
  if (value !== 1 && value !== 2 && value !== 4) throw new Error("INVALID_WASM_CONFIG");
  return { numThreads: value };
}
