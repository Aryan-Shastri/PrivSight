import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {approveForEgress, type SanitizedImage, type SanitizedObservation} from "../src/privacy/egress-firewall";

const bytes = new Uint8Array([1, 2, 3]);
const digest = createHash("sha256").update(bytes).digest("hex");
const base: SanitizedObservation = {
  schemaVersion: "1.0",
  sessionId: "s",
  stepId: 1,
  observationVersion: "v1",
  goal: "Open the profile",
  page: {origin: "https://safe.test", title: "Profile"},
  elements: [{id: "E001", role: "button", label: "Open", enabled: true, visible: true, source: "DOM"}],
  redaction: {count: 1, bySensitivity:{HIGH:1}, sanitizedImageSha256: digest},
};
const image: SanitizedImage = {kind: "SANITIZED_CAPTURE", bytes, sha256: digest};

describe("egress firewall", () => {
  it("approves a sanitized capture whose bytes match both declared hashes", async () => {
    await expect(approveForEgress(base, image)).resolves.toMatchObject({ok: true});
  });

  it("rejects forged image bytes even when both caller-supplied hashes agree", async () => {
    const forged = {...image, bytes: new Uint8Array([9, 9, 9])};
    await expect(approveForEgress(base, forged)).resolves.toEqual({ok: false, code: "UNSANITIZED_IMAGE"});
  });

  it.each([
    "password=hunter2",
    ["api", "_key: sk_live_secretvalue"].join(""),
    ["client", "-secret = very-", "secret-value"].join(""),
  ])("rejects plaintext key/value secret material: %s", async goal => {
    await expect(approveForEgress({...base, goal}, image)).resolves.toEqual({ok: false, code: "PLAINTEXT_SECRET"});
  });

  it.each([
    "cookie=sessionid=abc123",
    "session_id: deadbeefcafebabe",
    "Set-Cookie: auth_token=xyz789",
  ])("rejects cookie or session material: %s", async goal => {
    await expect(approveForEgress({...base, goal}, image)).resolves.toEqual({ok: false, code: "PLAINTEXT_SECRET"});
  });

  it.each([
    "Open https://safe.test/callback?code=abc123",
    "Return to /account?access_token=secret",
    "See safe.test/search?q=private",
  ])("rejects embedded query-bearing URLs: %s", async title => {
    await expect(approveForEgress({...base, page: {...base.page, title}}, image)).resolves.toEqual({ok: false, code: "URL_QUERY_PRESENT"});
  });

  it.each(["Enter password", "password field", "Confirm your password to continue"])(
    "allows password semantics without a value: %s",
    async label => {
      const candidate = {...base, elements: [{id: "E001", role: "password", label, enabled: true, visible: true, source: "DOM" as const}]};
      await expect(approveForEgress(candidate, image)).resolves.toMatchObject({ok: true});
    },
  );

  it.each([
    [{...base, goal: "Email me at a@b.co"}, image, "PII_RESCAN_HIT"],
    [{...base, page: {...base.page, origin: "https://safe.test/path?token=x"}}, image, "URL_QUERY_PRESENT"],
    [{...base, telemetry: {raw: "x"}}, image, "UNKNOWN_PROPERTY"],
    [base, new Uint8Array(), "RAW_CAPTURE_TYPE"],
  ])("fails closed for adversarial payload", async (candidate, candidateImage, code) => {
    await expect(approveForEgress(candidate, candidateImage)).resolves.toEqual({ok: false, code});
  });

  it("rejects an image metadata hash mismatch", async () => {
    await expect(approveForEgress(base, {...image, sha256: "no"})).resolves.toEqual({ok: false, code: "UNSANITIZED_IMAGE"});
  });

  it("keeps the payload cap", async () => {
    await expect(approveForEgress({...base, goal: "x".repeat(100)}, image, 10)).resolves.toEqual({ok: false, code: "PAYLOAD_TOO_LARGE"});
  });
  it("blocks a sanitized image above the 1.5 MiB client cap", async () => {
    const oversized={...image,bytes:new Uint8Array(1_572_865)};
    await expect(approveForEgress(base,oversized)).resolves.toEqual({ok:false,code:"PAYLOAD_TOO_LARGE"});
  });
  it("blocks 120 synthetic PII placements across every allowed outbound text field", async()=>{
    const fields=["goal","title","label","value"] as const;
    let blocked=0;
    for(const field of fields)for(let i=0;i<30;i++){
      const marker=`person${i}@example.test`;
      const candidate=field==="goal"?{...base,goal:marker}:field==="title"?{...base,page:{...base.page,title:marker}}:{...base,elements:[{...base.elements[0]!,[field]:marker}]};
      const result=await approveForEgress(candidate,image);if(!result.ok)blocked++;
    }
    expect(blocked).toBe(120);
  });
  it.each(["error","history","telemetry","placeholder","ariaLabel","imageFilename","multipartMetadata"])("rejects forbidden outbound field %s",async key=>{
    await expect(approveForEgress({...base,[key]:"synthetic"},image)).resolves.toEqual({ok:false,code:"UNKNOWN_PROPERTY"});
  });
});
