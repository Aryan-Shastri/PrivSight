// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { executeAction } from "../src/actions/executor";
import { loadSession, saveSession, type PersistedSession } from "../src/agent/session-store";

const resolveToken = async () => "";

describe("approval boundary", () => {
  it("does not let approval for one action authorize another", async () => {
    document.body.innerHTML = '<button type="submit" data-privsight-id="safe">Submit</button><button type="submit" data-privsight-id="other">Delete</button>';
    let clicks = 0;
    document.querySelector('[data-privsight-id="other"]')!.addEventListener("click", event => { event.preventDefault(); clicks += 1; });
    const result = await executeAction(
      { type: "CLICK", elementId: "other" },
      { document, approvedAction: { type: "CLICK", elementId: "safe" }, resolveToken },
    );
    expect(result.status).toBe("APPROVAL_REQUIRED");
    expect(clicks).toBe(0);
  });
});

describe("service-worker session recovery", () => {
  it("restores a valid persisted session after worker restart", async () => {
    const values = new Map<string, unknown>();
    const storage = {
      get: async (key: string) => ({ [key]: values.get(key) }),
      set: async (record: Record<string, unknown>) => { for (const [key, value] of Object.entries(record)) values.set(key, value); },
      remove: async (key: string) => { values.delete(key); },
    };
    const session: PersistedSession = { sessionId: "s-1", tabId: 7, origin: "https://example.test", observationVersion: "o-1" };
    await saveSession(storage, session);
    expect(await loadSession(storage)).toEqual(session);
  });

  it("fails closed and clears malformed persisted state", async () => {
    let removed = false;
    const storage = {
      get: async () => ({ "privsight:active-session": { sessionId: "", tabId: "bad" } }),
      set: async () => undefined,
      remove: async () => { removed = true; },
    };
    expect(await loadSession(storage)).toBeUndefined();
    expect(removed).toBe(true);
  });
});
