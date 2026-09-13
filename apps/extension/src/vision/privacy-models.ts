export const MODEL_PATHS = Object.freeze({
  ui: "/models/privsight-ui6.onnx",
  ocr: "/models/text_detection_en_ppocrv3_2023may.onnx",
  face: "/models/version-RFB-320.onnx",
});
export const MODEL_HASHES = Object.freeze({
  ui: "0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9",
  ocr: "03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587",
  face: "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017",
});
export interface ModelInput { data: Float32Array; dims: [1, 3, number, number] }
export interface ModelRegion { x: number; y: number; width: number; height: number; confidence: number }
export interface UiDetection { className: "button"|"checkbox"|"text_input"|"dropdown"|"icon"|"text_region"; confidence:number; bbox:ModelRegion }

function resizeNchw(rgba: Uint8Array, width: number, height: number, outWidth: number, outHeight: number, normalize: (value: number, channel: number) => number): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new Error("INVALID_IMAGE_INPUT");
  const plane = outWidth * outHeight, output = new Float32Array(plane * 3);
  for (let y = 0; y < outHeight; y++) {
    const sy = Math.min(height - 1, Math.floor((y + .5) * height / outHeight));
    for (let x = 0; x < outWidth; x++) {
      const sx = Math.min(width - 1, Math.floor((x + .5) * width / outWidth));
      const source = (sy * width + sx) * 4, target = y * outWidth + x;
      for (let channel = 0; channel < 3; channel++) output[channel * plane + target] = normalize(rgba[source + channel]!, channel);
    }
  }
  return output;
}
export function preprocessPpOcr(rgba: Uint8Array, width: number, height: number): ModelInput {
  const mean = [.485, .456, .406], std = [.229, .224, .225];
  return { data: resizeNchw(rgba, width, height, 736, 736, (v, c) => (v / 255 - mean[c]!) / std[c]!), dims: [1, 3, 736, 736] };
}
export function preprocessUltraFace(rgba: Uint8Array, width: number, height: number): ModelInput {
  return { data: resizeNchw(rgba, width, height, 320, 240, v => (v - 127) / 128), dims: [1, 3, 240, 320] };
}
export function preprocessYolox(rgba: Uint8Array, width: number, height: number): ModelInput {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new Error("INVALID_IMAGE_INPUT");
  const size=416, scale=Math.min(size/width,size/height), rw=Math.floor(width*scale), rh=Math.floor(height*scale), plane=size*size, data=new Float32Array(plane*3).fill(114);
  for(let y=0;y<rh;y++) for(let x=0;x<rw;x++){const sx=Math.min(width-1,Math.floor((x+.5)/scale)),sy=Math.min(height-1,Math.floor((y+.5)/scale)),s=(sy*width+sx)*4,t=y*size+x;data[t]=rgba[s+2]!;data[plane+t]=rgba[s+1]!;data[2*plane+t]=rgba[s]!;}
  return {data,dims:[1,3,size,size]};
}

export function decodeOcrHeatmap(data: Float32Array, dims: readonly number[], sourceWidth: number, sourceHeight: number, options: { threshold?: number; minPixels?: number; padding?: number } = {}): ModelRegion[] {
  const h = dims.at(-2), w = dims.at(-1);
  if (!h || !w || data.length !== h * w || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) throw new Error("INVALID_OCR_OUTPUT");
  const threshold = options.threshold ?? .3, minPixels = options.minPixels ?? 8, padding = options.padding ?? 4;
  const seen = new Uint8Array(data.length), regions: ModelRegion[] = [];
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start]! < threshold) continue;
    const stack = [start]; seen[start] = 1;
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0, confidence = 0;
    while (stack.length) {
      const index = stack.pop()!, x = index % w, y = Math.floor(index / w); count++; confidence = Math.max(confidence, data[index]!);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const next of [index - 1, index + 1, index - w, index + w]) {
        if (next < 0 || next >= data.length || seen[next] || data[next]! < threshold) continue;
        const nx = next % w; if (Math.abs(nx - x) > 1) continue; seen[next] = 1; stack.push(next);
      }
    }
    if (count < minPixels) continue;
    const x1 = Math.max(0, minX * sourceWidth / w - padding), y1 = Math.max(0, minY * sourceHeight / h - padding);
    const x2 = Math.min(sourceWidth, (maxX + 1) * sourceWidth / w + padding), y2 = Math.min(sourceHeight, (maxY + 1) * sourceHeight / h + padding);
    regions.push({ x: Math.floor(x1), y: Math.floor(y1), width: Math.ceil(x2) - Math.floor(x1), height: Math.ceil(y2) - Math.floor(y1), confidence });
  }
  return regions;
}
function iou(a: ModelRegion, b: ModelRegion): number {
  const x1 = Math.max(a.x,b.x), y1 = Math.max(a.y,b.y), x2 = Math.min(a.x+a.width,b.x+b.width), y2 = Math.min(a.y+a.height,b.y+b.height);
  const intersection = Math.max(0,x2-x1)*Math.max(0,y2-y1); return intersection/(a.width*a.height+b.width*b.height-intersection);
}
export function decodeUltraFace(scores: Float32Array, boxes: Float32Array, scoreDims: readonly number[], boxDims: readonly number[], width: number, height: number, threshold=.7, nmsThreshold=.3): ModelRegion[] {
  const count = scoreDims.length === 3 && scoreDims[0] === 1 && scoreDims[2] === 2 ? scoreDims[1] : 0;
  if (!count || scoreDims[1] !== boxDims[1] || boxDims.length !== 3 || boxDims[0] !== 1 || boxDims[2] !== 4 || scores.length !== count*2 || boxes.length !== count*4) throw new Error("INVALID_FACE_OUTPUT");
  const candidates: ModelRegion[] = [];
  for (let i=0;i<count;i++) { const confidence=scores[i*2+1]!; if (confidence < threshold) continue;
    const x1=Math.max(0,Math.min(width,boxes[i*4]!*width)), y1=Math.max(0,Math.min(height,boxes[i*4+1]!*height));
    const x2=Math.max(0,Math.min(width,boxes[i*4+2]!*width)), y2=Math.max(0,Math.min(height,boxes[i*4+3]!*height));
    if (x2>x1 && y2>y1) candidates.push({x:Math.floor(x1),y:Math.floor(y1),width:Math.ceil(x2)-Math.floor(x1),height:Math.ceil(y2)-Math.floor(y1),confidence});
  }
  candidates.sort((a,b)=>b.confidence-a.confidence); const kept: ModelRegion[]=[];
  for (const candidate of candidates) if (kept.every(existing=>iou(candidate,existing)<=nmsThreshold)) kept.push(candidate);
  return kept;
}
export function decodeYolox(data: Float32Array, dims: readonly number[], width: number, height: number, threshold=.3, nmsThreshold=.45): UiDetection[] {
  const count=dims.length===3&&dims[0]===1&&dims[2]===11?dims[1]:0;if(!count||data.length!==count*11)throw new Error("INVALID_UI_OUTPUT");
  const classes=["button","checkbox","text_input","dropdown","icon","text_region"] as const,scale=Math.min(416/width,416/height),candidates:UiDetection[]=[];
  for(let i=0;i<count;i++){const o=i*11,obj=data[o+4]!;let score=0,cls=0;for(let c=0;c<6;c++){const s=obj*data[o+5+c]!;if(s>score){score=s;cls=c;}}if(score<threshold)continue;const x1=Math.max(0,(data[o]!-data[o+2]!/2)/scale),y1=Math.max(0,(data[o+1]!-data[o+3]!/2)/scale),x2=Math.min(width,(data[o]!+data[o+2]!/2)/scale),y2=Math.min(height,(data[o+1]!+data[o+3]!/2)/scale);if(x2>x1&&y2>y1)candidates.push({className:classes[cls]!,confidence:score,bbox:{x:Math.floor(x1),y:Math.floor(y1),width:Math.ceil(x2)-Math.floor(x1),height:Math.ceil(y2)-Math.floor(y1),confidence:score}});}
  candidates.sort((a,b)=>b.confidence-a.confidence);const kept:UiDetection[]=[];for(const c of candidates)if(kept.every(k=>c.className!==k.className||iou(c.bbox,k.bbox)<=nmsThreshold))kept.push(c);return kept;
}
