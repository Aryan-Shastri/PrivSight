import { describe, expect, it } from "vitest";
import {
  MODEL_PATHS,
  decodeOcrHeatmap,
  decodeUltraFace,
  preprocessPpOcr,
  preprocessUltraFace,
} from "../src/vision/privacy-models";

function rgba(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return data;
}

describe("validated privacy model contracts", () => {
  it("uses browser-local immutable model paths", () => {
    expect(MODEL_PATHS).toEqual({ ui: "/models/privsight-ui6.onnx", ocr: "/models/text_detection_en_ppocrv3_2023may.onnx", face: "/models/version-RFB-320.onnx" });
  });

  it("preprocesses PP-OCRv3 RGB into normalized 1x3x736x736 NCHW", () => {
    const input = preprocessPpOcr(rgba(1, 1, [255, 0, 127]), 1, 1);
    expect(input.dims).toEqual([1, 3, 736, 736]);
    const plane = 736 * 736;
    expect(input.data[0]).toBeCloseTo((1 - .485) / .229, 5);
    expect(input.data[plane]).toBeCloseTo((0 - .456) / .224, 5);
    expect(input.data[plane * 2]).toBeCloseTo((127 / 255 - .406) / .225, 5);
  });

  it("preprocesses UltraFace RGB into normalized 1x3x240x320 NCHW", () => {
    const input = preprocessUltraFace(rgba(1, 1, [255, 127, 0]), 1, 1);
    expect(input.dims).toEqual([1, 3, 240, 320]);
    const plane = 240 * 320;
    expect(input.data[0]).toBeCloseTo(1, 5);
    expect(input.data[plane]).toBeCloseTo(0, 5);
    expect(input.data[plane * 2]).toBeCloseTo(-127 / 128, 5);
  });

  it("turns connected OCR heatmap candidates into padded source-image regions", () => {
    const heatmap = new Float32Array(16);
    heatmap[5] = .8; heatmap[6] = .9; heatmap[9] = .7; heatmap[10] = .8;
    expect(decodeOcrHeatmap(heatmap, [4, 4], 400, 200, { threshold: .5, minPixels: 2, padding: 0 })).toEqual([
      { x: 100, y: 50, width: 200, height: 100, confidence: expect.closeTo(.9) },
    ]);
  });

  it("filters, clips, scales and NMS-deduplicates UltraFace boxes", () => {
    const scores = new Float32Array([.1,.9, .15,.85, .8,.2]);
    const boxes = new Float32Array([.1,.2,.5,.6, .12,.22,.51,.61, -.1,.2,1.2,.8]);
    expect(decodeUltraFace(scores, boxes, [1,3,2], [1,3,4], 1000, 500, .7, .3)).toEqual([
      { x: 100, y: 100, width: 400, height: 201, confidence: expect.closeTo(.9) },
    ]);
  });

  it("rejects malformed model outputs fail-closed", () => {
    expect(() => decodeOcrHeatmap(new Float32Array(3), [2,2], 10, 10)).toThrow("INVALID_OCR_OUTPUT");
    expect(() => decodeUltraFace(new Float32Array(2), new Float32Array(4), [1,2,2], [1,1,4], 10, 10)).toThrow("INVALID_FACE_OUTPUT");
  });
});
