import type { AgentAction } from "../actions/schemas";
import type { ElementSnapshot } from "../observation/dom-scanner";
import type { SanitizedImage, SanitizedObservation } from "../privacy/egress-firewall";
import type { RedactionRegion } from "../privacy/types";
import { detectStructuredPii, highEntropySecret } from "../privacy/detectors";
import { semanticDomRegions } from "../privacy/masking";
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
  approve(metadata: SanitizedObservation, image: SanitizedImage): Promise<{ ok: true; value: ApprovedPayload } | { ok: false; code: string }>;
  network(payload: ApprovedPayload): Promise<{ planner: string; action: AgentAction }>;
  events?: string[];
}
export interface LivePipelineInput { observationVersion: string; sessionId: string; stepId: number; goal: string; origin: string; title: string; dom: ElementSnapshot[] }

function sanitizeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hits = detectStructuredPii(value);
  return hits.reduce((text, hit, index) => hit.value ? text.replace(hit.value, `[${hit.kind}_${index + 1}]`) : text, value);
}

export function sanitizeUserGoal(goal: string): string {
  const counters = new Map<string, number>();
  // Goal secrets are irreversible redactions, not executable vault aliases.
  // Keeping a distinct namespace prevents collision with DOM-issued TYPE_TOKEN aliases.
  const token = (kind: string) => { const next = (counters.get(kind) ?? 0) + 1; counters.set(kind, next); return `[REDACTED_${kind}_${next}]`; };
  const kindOf = (label: string) => /otp|one/i.test(label) ? "OTP" : /pin/i.test(label) ? "PIN" : /cvv|cvc/i.test(label) ? "CVV" : "PASSWORD";
  const labels = "password|passwd|pwd|otp|one[- ]time code|pin|cvv|cvc";
  // Quoted values may contain spaces; consume the complete quoted secret.
  let result = goal.replace(new RegExp(`\\b(${labels})\\b\\s*(?:(?:is|was|equals)\\s+|[:=]\\s*|\\s+)(["'])(.*?)\\2`, "gi"), (_all, label: string) => token(kindOf(label)));
  // Handle common forward forms, including a copula, without mistaking "is" for the secret.
  result = result.replace(new RegExp(`\\b(${labels})\\b\\s*(?:(?:is|was|equals)\\s+|[:=]\\s*|\\s+)([^\\s,;]+)`, "gi"), (_all, label: string) => token(kindOf(label)));
  // Handle reverse forms such as "use 123456 as the OTP".
  result = result.replace(new RegExp(`\\b(use|enter|type)\\s+(["']?)([^\\s,;"']+)\\2\\s+as\\s+(?:the\\s+)?(${labels})\\b`, "gi"), (_all, verb: string, _quote: string, _value: string, label: string) => `${verb} ${token(kindOf(label))}`);
  for (const hit of detectStructuredPii(result)) if (hit.value) result = result.replace(hit.value, token(hit.kind));
  result = result.replace(/\b[A-Za-z0-9_-]{16,}\b/g, value => highEntropySecret(value) ? token("PASSWORD") : value);
  return result;
}

export async function prepareLivePrivacyPipeline(input: LivePipelineInput, deps: Omit<LivePipelineDeps, "network" | "approve">) {
  const capture = await deps.capture();
  const visual = await deps.localVision(capture);
  const cssDetections=visual.detections.map(d=>({...d,bbox:{x:d.bbox.x/capture.devicePixelRatio,y:d.bbox.y/capture.devicePixelRatio,width:d.bbox.width/capture.devicePixelRatio,height:d.bbox.height/capture.devicePixelRatio}}));
  const merged = mergeVisualDetections(input.dom,cssDetections);
  const evidence: BoundEvidence[] = merged.map(element => {
    const source = input.dom.find(item => item.id === element.id);
    return { ...element, observationVersion: input.observationVersion, ...(source?.label ? { label: source.label } : {}), ...(source?.value ? { value: source.value } : {}) };
  });
  const regions = [...semanticDomRegions(input.dom), ...visual.ocrRegions, ...visual.faceRegions];
  const image = await deps.redact(capture, regions);
  const metadata: SanitizedObservation = {
    schemaVersion: "1.0", sessionId: input.sessionId, stepId: input.stepId, observationVersion: input.observationVersion,
    goal: sanitizeUserGoal(input.goal), page: { origin: input.origin, title: sanitizeText(input.title) ?? "" },
    elements: evidence.map(element => ({ id: element.id, role: element.role, ...(element.label ? { label: sanitizeText(element.label) } : {}), ...(element.value ? { value: sanitizeText(element.value) } : {}), enabled: element.enabled, visible: element.visible, source: element.source })),
    redaction: { count: regions.length, bySensitivity: regions.reduce<Record<string,number>>((counts,region)=>{counts[region.sensitivity]=(counts[region.sensitivity]??0)+1;return counts},{}), sanitizedImageSha256: image.sha256 },
  };
  return { metadata, image, observationVersion: input.observationVersion, evidence };
}

export async function runLivePrivacyPipeline(input: LivePipelineInput, deps: LivePipelineDeps) {
  const prepared = await prepareLivePrivacyPipeline(input, deps);
  const approved = await deps.approve(prepared.metadata, prepared.image);
  if (!approved.ok) throw new Error(approved.code);
  const planned = await deps.network(approved.value);
  return { ...planned, observationVersion: prepared.observationVersion, evidence: prepared.evidence };
}
