import type { AgentAction } from "../actions/schemas";
import type { ElementSnapshot } from "../observation/dom-scanner";
import type { SanitizedImage, SanitizedObservation } from "../privacy/egress-firewall";
import type { RedactionRegion } from "../privacy/types";
import { detectSensitiveField, detectStructuredPii } from "../privacy/detectors";
import { mergeVisualDetections, type MergedEvidence, type VisualDetection } from "../vision/merge";

export interface RawCapture {
  kind: "RAW_CAPTURE";
  bytes: Uint8Array;
  width: number;
  height: number;
  capturedAt: number;
  trigger: "NAVIGATION" | "USER_ACTION" | "DOM_MUTATION" | "EXPLICIT_REFRESH";
  scrollX: number;
  scrollY: number;
  viewportWidthCss: number;
  viewportHeightCss: number;
  devicePixelRatio: number;
}
export interface LocalVisionResult { detections: VisualDetection[]; ocrRegions: RedactionRegion[]; faceRegions: RedactionRegion[] }
export interface BoundEvidence extends MergedEvidence { observationVersion: string; label?: string; value?: string }
export interface ApprovedPayload { metadata: SanitizedObservation; image: SanitizedImage }
export interface LivePipelineDeps {
  capture(): Promise<RawCapture>;
  localVision(capture: RawCapture): Promise<LocalVisionResult>;
  redact(capture: RawCapture, regions: RedactionRegion[]): Promise<SanitizedImage>;
  approve(metadata: SanitizedObservation, image: SanitizedImage): { ok: true; value: ApprovedPayload } | { ok: false; code: string };
  network(payload: ApprovedPayload): Promise<{ planner: string; action: AgentAction }>;
  events?: string[];
}
export interface LivePipelineInput { observationVersion: string; sessionId: string; stepId: number; goal: string; origin: string; title: string; dom: ElementSnapshot[] }

function domRegions(dom: ElementSnapshot[]): RedactionRegion[] {
  return dom.flatMap(element => {
    const hits = element.value ? detectSensitiveField({ label: element.label, value: element.value }) : [];
    return hits.map(hit => ({ x: element.bbox[0], y: element.bbox[1], width: element.bbox[2], height: element.bbox[3], reason: hit.kind, sensitivity: hit.sensitivity, confidence: 1, source: "DOM" as const }));
  });
}
function sanitizeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hits = detectStructuredPii(value);
  return hits.reduce((text, hit, index) => hit.value ? text.replace(hit.value, `[${hit.kind}_${index + 1}]`) : text, value);
}

export async function runLivePrivacyPipeline(input: LivePipelineInput, deps: LivePipelineDeps) {
  const capture = await deps.capture();
  const visual = await deps.localVision(capture);
  const merged = mergeVisualDetections(input.dom, visual.detections);
  const evidence: BoundEvidence[] = merged.map(element => {
    const source = input.dom.find(item => item.id === element.id);
    return { ...element, observationVersion: input.observationVersion, ...(source?.label ? { label: source.label } : {}), ...(source?.value ? { value: source.value } : {}) };
  });
  const regions = [...domRegions(input.dom), ...visual.ocrRegions, ...visual.faceRegions];
  const image = await deps.redact(capture, regions);
  const metadata: SanitizedObservation = {
    schemaVersion: "1.0", sessionId: input.sessionId, stepId: input.stepId, observationVersion: input.observationVersion,
    goal: input.goal, page: { origin: input.origin, title: sanitizeText(input.title) ?? "" },
    elements: evidence.map(element => ({ id: element.id, role: element.role, ...(element.label ? { label: sanitizeText(element.label) } : {}), ...(element.value ? { value: sanitizeText(element.value) } : {}), enabled: element.enabled, visible: element.visible, source: element.source })),
    redaction: { count: regions.length, sanitizedImageSha256: image.sha256 },
  };
  const approved = deps.approve(metadata, image);
  if (!approved.ok) throw new Error(approved.code);
  const planned = await deps.network(approved.value);
  return { ...planned, observationVersion: input.observationVersion, evidence };
}
