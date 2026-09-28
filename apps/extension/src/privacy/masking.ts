import type { ElementSnapshot } from "../observation/dom-scanner";
import { detectSensitiveField } from "./detectors";
import { scaleAndClampRegions, type PixelRect } from "./redactor";
import type { RedactionRegion } from "./types";

interface CaptureGeometry { viewportWidthCss: number; viewportHeightCss: number; width: number; height: number }

export function semanticDomRegions(dom: ElementSnapshot[]): RedactionRegion[] {
  return dom.flatMap(element => detectSensitiveField({
    type: (element as ElementSnapshot & { inputType?: string }).inputType,
    autocomplete: (element as ElementSnapshot & { autocomplete?: string }).autocomplete,
    label: element.label,
    value: element.value,
  }).map(hit => ({
    x: element.bbox[0], y: element.bbox[1], width: element.bbox[2], height: element.bbox[3],
    reason: hit.kind, sensitivity: hit.sensitivity, confidence: 1, source: "DOM" as const,
  })));
}

/** DOM boxes are CSS pixels; local visual detector boxes are bitmap pixels. */
export function buildCombinedMaskRects(
  dom: ElementSnapshot[], ocrRegions: RedactionRegion[], faceRegions: RedactionRegion[], capture: CaptureGeometry, margin = 4,
): PixelRect[] {
  const bitmap = { width: capture.width, height: capture.height };
  const domRects = scaleAndClampRegions(semanticDomRegions(dom), { width: capture.viewportWidthCss, height: capture.viewportHeightCss }, bitmap, margin);
  const visualRects = scaleAndClampRegions([...ocrRegions, ...faceRegions], bitmap, bitmap, margin);
  return [...domRects, ...visualRects].filter(rect => rect.width > 0 && rect.height > 0);
}
