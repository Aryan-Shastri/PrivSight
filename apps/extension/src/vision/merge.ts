export const UI_CLASSES = ["button", "checkbox", "text_input", "dropdown", "icon", "text_region"] as const;
export type UiClass = typeof UI_CLASSES[number];
export interface Rect { x: number; y: number; width: number; height: number }
export interface VisualDetection { className: UiClass; confidence: number; bbox: Rect }
export interface DomEvidence { id: string; role: string; bbox: readonly [number, number, number, number]; enabled: boolean; visible: boolean; source: "DOM" }
export interface MergedEvidence { id: string; role: string; bbox: readonly [number, number, number, number]; enabled: boolean; visible: boolean; source: "DOM" | "VISUAL" | "MERGED"; visualClass?: UiClass; visualConfidence?: number }

function tupleRect(value: DomEvidence["bbox"]): Rect { return { x: value[0], y: value[1], width: value[2], height: value[3] }; }
export function intersectionOverUnion(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}
function centerInside(inner: Rect, outer: Rect): boolean {
  const x = inner.x + inner.width / 2;
  const y = inner.y + inner.height / 2;
  return x >= outer.x && x <= outer.x + outer.width && y >= outer.y && y <= outer.y + outer.height;
}
function roleFor(className: UiClass): string {
  return ({ button: "button", checkbox: "checkbox", text_input: "textbox", dropdown: "combobox", icon: "button", text_region: "text" } as const)[className];
}

export function mergeVisualDetections(dom: DomEvidence[], visual: VisualDetection[], iouThreshold = 0.3): MergedEvidence[] {
  const used = new Set<number>();
  const merged: MergedEvidence[] = dom.map((element) => {
    const box = tupleRect(element.bbox);
    let best = -1;
    let score = -1;
    visual.forEach((detection, index) => {
      if (used.has(index)) return;
      const iou = intersectionOverUnion(box, detection.bbox);
      if ((iou >= iouThreshold || centerInside(detection.bbox, box) || centerInside(box, detection.bbox)) && iou > score) { best = index; score = iou; }
    });
    if (best < 0) return element;
    used.add(best);
    const detection = visual[best]!;
    return { ...element, source: "MERGED", visualClass: detection.className, visualConfidence: detection.confidence };
  });
  let visualId = 0;
  visual.forEach((detection, index) => {
    if (used.has(index)) return;
    visualId += 1;
    merged.push({ id: `V${String(visualId).padStart(3, "0")}`, role: roleFor(detection.className), bbox: [detection.bbox.x, detection.bbox.y, detection.bbox.width, detection.bbox.height], enabled: true, visible: true, source: "VISUAL", visualClass: detection.className, visualConfidence: detection.confidence });
  });
  return merged;
}
