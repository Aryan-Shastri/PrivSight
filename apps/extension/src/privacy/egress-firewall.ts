import {detectStructuredPii} from "./detectors";

export type BlockReason =
  | "UNKNOWN_PROPERTY"
  | "RAW_CAPTURE_TYPE"
  | "UNSANITIZED_IMAGE"
  | "PLAINTEXT_SECRET"
  | "PII_RESCAN_HIT"
  | "URL_QUERY_PRESENT"
  | "VAULT_SHAPE_DETECTED"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_SCHEMA"
  | "PRIVACY_ENGINE_UNAVAILABLE";

export interface SanitizedObservation {
  schemaVersion: "1.0";
  sessionId: string;
  stepId: number;
  observationVersion: string;
  goal: string;
  page: {origin: string; title: string};
  elements: Array<{
    id: string;
    role: string;
    label?: string;
    value?: string;
    enabled: boolean;
    visible: boolean;
    source: "DOM" | "VISUAL" | "MERGED";
  }>;
  redaction: {count: number; bySensitivity: Record<string, number>; sanitizedImageSha256: string};
}

export interface SanitizedImage {
  kind: "SANITIZED_CAPTURE";
  bytes: Uint8Array;
  sha256: string;
}

export type EgressDecision =
  | {ok: true; value: {metadata: SanitizedObservation; image: SanitizedImage}}
  | {ok: false; code: BlockReason};

const keys = {
  root: ["schemaVersion", "sessionId", "stepId", "observationVersion", "goal", "page", "elements", "redaction"],
  page: ["origin", "title"],
  element: ["id", "role", "label", "value", "enabled", "visible", "source"],
  redaction: ["count", "bySensitivity", "sanitizedImageSha256"],
};
const unknown = (object: object, allowed: string[]) => Object.keys(object).some(key => !allowed.includes(key));
const walk = (value: unknown): string[] =>
  typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(walk) : value && typeof value === "object" ? Object.values(value).flatMap(walk) : [];
const queryBearingUrl = /(?:https?:\/\/|(?:^|[\s("'`])\/|(?:^|[\s("'`])(?:[a-z0-9-]+\.)+[a-z]{2,}\/)[^\s<>"']*\?[^\s<>"']*=[^\s<>"']+/i;
const secretAssignment = /\b(?:password|passwd|pwd|api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|session(?:[_-]?id)?|cookie|set-cookie)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))/gi;
const redactionToken = /^\[[A-Z][A-Z0-9_]*_\d+\]$/;

function containsPlaintextSecret(value: string): boolean {
  return [...value.matchAll(secretAssignment)].some(match => {
    const assignedValue = match[1] ?? match[2] ?? match[3];
    return assignedValue !== undefined && !redactionToken.test(assignedValue);
  });
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function approveForEgress(c: unknown, image: unknown, max = 262144): Promise<EgressDecision> {
  if (!c || typeof c !== "object" || Array.isArray(c)) return {ok: false, code: "INVALID_SCHEMA"};
  const value = c as SanitizedObservation;
  if (unknown(value, keys.root)) return {ok: false, code: "UNKNOWN_PROPERTY"};
  if (
    !value.page || typeof value.page !== "object" || unknown(value.page, keys.page) ||
    !Array.isArray(value.elements) || value.elements.some(element => !element || typeof element !== "object" || unknown(element, keys.element)) ||
    !value.redaction || typeof value.redaction !== "object" || unknown(value.redaction, keys.redaction) || !value.redaction.bySensitivity || typeof value.redaction.bySensitivity !== "object" || Array.isArray(value.redaction.bySensitivity)
  ) return {ok: false, code: "UNKNOWN_PROPERTY"};
  if (value.schemaVersion !== "1.0" || typeof value.goal !== "string" || typeof value.page.origin !== "string") return {ok: false, code: "INVALID_SCHEMA"};

  try {
    const origin = new URL(value.page.origin);
    if (origin.pathname !== "/" || origin.search || origin.hash) return {ok: false, code: "URL_QUERY_PRESENT"};
  } catch {
    return {ok: false, code: "INVALID_SCHEMA"};
  }

  const strings = walk(value);
  if (strings.some(text => queryBearingUrl.test(text))) return {ok: false, code: "URL_QUERY_PRESENT"};
  if (strings.some(containsPlaintextSecret)) return {ok: false, code: "PLAINTEXT_SECRET"};
  if (strings.some(text => detectStructuredPii(text).length > 0)) return {ok: false, code: "PII_RESCAN_HIT"};
  if (strings.some(text => /expiresAt|allowedFieldRoles/i.test(text))) return {ok: false, code: "VAULT_SHAPE_DETECTED"};
  if (new TextEncoder().encode(JSON.stringify(value)).length > max) return {ok: false, code: "PAYLOAD_TOO_LARGE"};

  if(!image||typeof image!=="object"||(image as SanitizedImage).kind!=="SANITIZED_CAPTURE")return{ok:false,code:"RAW_CAPTURE_TYPE"};
  const sanitizedImage=image as SanitizedImage;
  if(!(sanitizedImage.bytes instanceof Uint8Array)||sanitizedImage.bytes.byteLength>1_572_864)return{ok:false,code:"PAYLOAD_TOO_LARGE"};
  if (!(sanitizedImage.bytes instanceof Uint8Array) || typeof sanitizedImage.sha256 !== "string" || typeof value.redaction.sanitizedImageSha256 !== "string") {
    return {ok: false, code: "UNSANITIZED_IMAGE"};
  }
  try {
    const actualHash = toHex(await crypto.subtle.digest("SHA-256", Uint8Array.from(sanitizedImage.bytes).buffer));
    if (actualHash !== sanitizedImage.sha256 || actualHash !== value.redaction.sanitizedImageSha256) return {ok: false, code: "UNSANITIZED_IMAGE"};
  } catch {
    return {ok: false, code: "UNSANITIZED_IMAGE"};
  }
  return {ok: true, value: {metadata: value, image: sanitizedImage}};
}
