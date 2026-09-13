export type CaptureTrigger = "NAVIGATION" | "USER_ACTION" | "DOM_MUTATION" | "EXPLICIT_REFRESH";

export interface CaptureCoordinates {
  scrollX: number;
  scrollY: number;
  viewportWidthCss: number;
  viewportHeightCss: number;
  devicePixelRatio: number;
  bitmapWidth: number;
  bitmapHeight: number;
}

export interface CaptureRequest extends CaptureCoordinates {
  kind: "CAPTURE_VIEWPORT";
  trigger: CaptureTrigger;
  capturedAt: number;
}

export interface CssRect { x: number; y: number; width: number; height: number }
export interface BitmapRect { x: number; y: number; width: number; height: number }

export function createCaptureRequest(trigger: CaptureTrigger, coordinates: CaptureCoordinates): CaptureRequest {
  const values = Object.values(coordinates);
  if (values.some((value) => !Number.isFinite(value)) || coordinates.viewportWidthCss <= 0 || coordinates.viewportHeightCss <= 0 || coordinates.bitmapWidth <= 0 || coordinates.bitmapHeight <= 0 || coordinates.devicePixelRatio <= 0) {
    throw new Error("INVALID_CAPTURE_COORDINATES");
  }
  return { kind: "CAPTURE_VIEWPORT", trigger, capturedAt: Date.now(), ...coordinates };
}

export function toBitmapRect(rect: CssRect, capture: CaptureCoordinates): BitmapRect {
  const scaleX = capture.bitmapWidth / capture.viewportWidthCss;
  const scaleY = capture.bitmapHeight / capture.viewportHeightCss;
  const left = Math.max(0, Math.floor(rect.x * scaleX));
  const top = Math.max(0, Math.floor(rect.y * scaleY));
  const right = Math.min(capture.bitmapWidth, Math.ceil((rect.x + rect.width) * scaleX));
  const bottom = Math.min(capture.bitmapHeight, Math.ceil((rect.y + rect.height) * scaleY));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
