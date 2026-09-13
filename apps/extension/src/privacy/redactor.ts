import type { RedactionRegion } from "./types";

export interface PixelRect { x: number; y: number; width: number; height: number }

export function scaleAndClampRegions(
  regions: RedactionRegion[],
  css: { width: number; height: number },
  bitmap: { width: number; height: number },
  margin = 4,
): PixelRect[] {
  if (css.width <= 0 || css.height <= 0 || bitmap.width <= 0 || bitmap.height <= 0) throw new Error("INVALID_REDACTION_GEOMETRY");
  const sx = bitmap.width / css.width;
  const sy = bitmap.height / css.height;
  return regions.map((region) => {
    const x = Math.max(0, Math.floor(region.x * sx - margin));
    const y = Math.max(0, Math.floor(region.y * sy - margin));
    const right = Math.min(bitmap.width, Math.ceil((region.x + region.width) * sx + margin));
    const bottom = Math.min(bitmap.height, Math.ceil((region.y + region.height) * sy + margin));
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  });
}

/** Returns a copy whose covered pixels are replaced, never blurred or recoverable. */
export function redactPixels(
  data: Uint8ClampedArray,
  width: number,
  rects: PixelRect[],
  rgba: [number, number, number, number] = [49, 35, 48, 255],
): Uint8ClampedArray {
  if (!Number.isInteger(width) || width <= 0 || data.length % (width * 4) !== 0) throw new Error("INVALID_PIXEL_BUFFER");
  const height = data.length / (width * 4);
  const output = new Uint8ClampedArray(data);
  for (const rect of rects) {
    const left = Math.max(0, Math.floor(rect.x));
    const top = Math.max(0, Math.floor(rect.y));
    const right = Math.min(width, Math.ceil(rect.x + rect.width));
    const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) output.set(rgba, (y * width + x) * 4);
    }
  }
  return output;
}
