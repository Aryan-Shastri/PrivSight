import { describe, expect, it } from "vitest";
import { mergeVisualDetections } from "../src/vision/merge";

describe("DOM and visual evidence merge", () => {
  it("merges overlap or center-contained detections and assigns stable V IDs to unmatched controls", () => {
    const dom = [{ id: "E001", role: "button", bbox: [10, 10, 20, 20] as const, enabled: true, visible: true, source: "DOM" as const }];
    const visual = [
      { className: "button" as const, confidence: 0.9, bbox: { x: 12, y: 12, width: 18, height: 18 } },
      { className: "icon" as const, confidence: 0.8, bbox: { x: 100, y: 40, width: 10, height: 10 } },
    ];
    expect(mergeVisualDetections(dom, visual, 0.25)).toEqual([
      expect.objectContaining({ id: "E001", source: "MERGED", visualClass: "button" }),
      expect.objectContaining({ id: "V001", source: "VISUAL", role: "button", visualClass: "icon" }),
    ]);
  });
});
