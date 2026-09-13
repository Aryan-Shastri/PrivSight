export interface Rect { x: number; y: number; width: number; height: number }
export interface BoundingBox extends Rect { confidence: number }
export interface OcrResult { text: string; confidence: number; bbox: Rect }
export interface LocalAdapter { name: string; available(): Promise<boolean>; detect(source: ImageBitmap | ImageData): Promise<BoundingBox[]> }
export interface CandidateOcr { recognize(source: ImageBitmap | ImageData, candidates: Rect[]): Promise<OcrResult[]> }
export interface LocalFaceDetector { detect(source: ImageBitmap | ImageData): Promise<BoundingBox[]> }

abstract class UnavailableAdapter implements LocalAdapter {
  abstract name: string;
  async available() { return false; }
  async detect(_source: ImageBitmap | ImageData): Promise<BoundingBox[]> { throw new Error(`${this.name.toUpperCase()}_UNAVAILABLE`); }
}
export class VisionAdapter extends UnavailableAdapter { name = "ui_model"; }
export class OcrAdapter extends UnavailableAdapter { name = "ocr_model"; }
export class FaceAdapter extends UnavailableAdapter { name = "face_model"; }

export class CandidateRegionOcr implements CandidateOcr {
  async recognize(_source: ImageBitmap | ImageData, _candidates: Rect[]): Promise<OcrResult[]> { throw new Error("OCR_MODEL_UNAVAILABLE"); }
}
export class DeterministicOcr implements CandidateOcr {
  constructor(private readonly results: OcrResult[]) {}
  async recognize(_source: ImageBitmap | ImageData, candidates: Rect[]): Promise<OcrResult[]> {
    return this.results.filter(result => candidates.some(candidate => candidate.x === result.bbox.x && candidate.y === result.bbox.y && candidate.width === result.bbox.width && candidate.height === result.bbox.height)).map(result => ({ ...result, bbox: { ...result.bbox } }));
  }
}
export class BundledFaceDetector implements LocalFaceDetector {
  constructor(private readonly modelPath: string, private readonly run: (source: ImageBitmap | ImageData, modelPath: string) => Promise<BoundingBox[]>) {}
  async detect(source: ImageBitmap | ImageData): Promise<BoundingBox[]> {
    if (!this.modelPath.startsWith("/") || this.modelPath.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(this.modelPath)) throw new Error("REMOTE_MODEL_FORBIDDEN");
    if (!this.modelPath.endsWith(".onnx")) throw new Error("INVALID_MODEL_PATH");
    return this.run(source, this.modelPath);
  }
}
export class DeterministicFaceDetector implements LocalFaceDetector {
  constructor(private readonly regions: BoundingBox[]) {}
  async detect(_source: ImageBitmap | ImageData): Promise<BoundingBox[]> { return this.regions.map(region => ({ ...region })); }
}
