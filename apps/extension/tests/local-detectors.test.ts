import { describe, expect, it } from "vitest";
import { BundledFaceDetector, CandidateRegionOcr, DeterministicFaceDetector, DeterministicOcr } from "../src/vision/adapters";

const image = {} as ImageData;
describe("local-only privacy detector interfaces", () => {
  it("OCR receives only candidate regions and deterministic doubles preserve them", async () => {
    const candidates = [{ x: 1, y: 2, width: 3, height: 4 }];
    const ocr = new DeterministicOcr([{ text: "alice@example.com", confidence: .9, bbox: candidates[0]! }]);
    expect(await ocr.recognize(image, candidates)).toEqual([{ text: "alice@example.com", confidence: .9, bbox: candidates[0] }]);
    await expect(new CandidateRegionOcr().recognize(image, candidates)).rejects.toThrow("OCR_MODEL_UNAVAILABLE");
  });

  it("face detector rejects remote model paths before runtime creation", async () => {
    const detector = new BundledFaceDetector("https://models.test/face.onnx", async () => []);
    await expect(detector.detect(image)).rejects.toThrow("REMOTE_MODEL_FORBIDDEN");
  });

  it("deterministic face double returns stable local regions", async () => {
    const regions = [{ x: 2, y: 3, width: 4, height: 5, confidence: .8 }];
    await expect(new DeterministicFaceDetector(regions).detect(image)).resolves.toEqual(regions);
  });
});
