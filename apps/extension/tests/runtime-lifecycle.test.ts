import { describe, expect, it, vi } from "vitest";
import { MemoryVaultStore, TokenVault } from "../src/privacy/token-vault";
import { ACTIVE_SESSION_KEY, saveSession } from "../src/agent/session-store";
import { RuntimeLifecycle, tokenizeObservation, assertAuthorizedOrigin } from "../src/agent/runtime-lifecycle";

class Storage {
  data: Record<string, unknown> = {};
  async get(key: string) { return { [key]: this.data[key] }; }
  async set(record: Record<string, unknown>) { Object.assign(this.data, record); }
  async remove(key: string) { delete this.data[key]; }
}

const session = { sessionId: "old", tabId: 7, origin: "https://safe.test", observationVersion: "v1", pending: { type: "CLICK", elementId: "E001" } };

describe("MV3 production lifecycle", () => {
  it("fails closed after restart and purges persisted pending state", async () => {
    const storage = new Storage();
    await saveSession(storage, session);
    const vault = new TokenVault(new MemoryVaultStore());
    const purge = vi.spyOn(vault, "purgeSession");
    const runtime = new RuntimeLifecycle(storage, vault);
    await expect(runtime.recover()).resolves.toEqual({ restartRequired: true });
    expect(storage.data[ACTIVE_SESSION_KEY]).toBeUndefined();
    expect(purge).toHaveBeenCalledWith("old");
    expect(runtime.ping()).toEqual({ state: "IDLE", restartRequired: true });
  });

  it("serializes starts and prevents an old run from mutating a new run", async () => {
    const runtime = new RuntimeLifecycle(new Storage(), new TokenVault(new MemoryVaultStore()));
    const first = await runtime.begin({ sessionId: "one", tabId: 7, origin: "https://safe.test", observationVersion: "pending" });
    await expect(runtime.begin({ sessionId: "two", tabId: 7, origin: "https://safe.test", observationVersion: "pending" })).rejects.toThrow("AGENT_ALREADY_RUNNING");
    await runtime.terminate(first);
    const second = await runtime.begin({ sessionId: "two", tabId: 7, origin: "https://safe.test", observationVersion: "pending" });
    expect(runtime.isCurrent(first)).toBe(false);
    expect(runtime.isCurrent(second)).toBe(true);
  });

  it("does not let concurrent begin be clobbered by old termination cleanup", async () => {
    let releaseRemove!: () => void;
    const removeGate = new Promise<void>(resolve => { releaseRemove = resolve; });
    class DeferredStorage extends Storage {
      defer = false;
      override async remove(key: string) {
        if (this.defer) await removeGate;
        await super.remove(key);
      }
    }
    const storage = new DeferredStorage();
    const runtime = new RuntimeLifecycle(storage, new TokenVault(new MemoryVaultStore()));
    const first = await runtime.begin({ sessionId: "one", tabId: 7, origin: "https://safe.test", observationVersion: "pending" });
    storage.defer = true;
    const terminating = runtime.terminate(first);
    await vi.waitFor(() => expect(runtime.ping().state).toBe("ACTIVE"));
    const starting = runtime.begin({ sessionId: "two", tabId: 7, origin: "https://safe.test", observationVersion: "pending" });
    let started = false;
    void starting.then(() => { started = true; });
    await Promise.resolve();
    expect(started).toBe(false);
    releaseRemove();
    await expect(terminating).resolves.toBe(true);
    const second = await starting;
    expect(runtime.isCurrent(second)).toBe(true);
    expect((storage.data[ACTIVE_SESSION_KEY] as { sessionId: string }).sessionId).toBe("two");
  });

  it("issues real deduplicated non-payment tokens and removes plaintext from planner observation", async () => {
    const vault = new TokenVault(new MemoryVaultStore(), () => 1_000);
    const scanned = { elements: [{ id: "E001", value: undefined }, { id: "E002", value: "public" }] };
    const sensitiveFields = [{ elementId: "E001", value: "secret", kind: "PASSWORD" as const, sensitivity: "CRITICAL" as const, fieldRole: "password" }];
    const scope = { sessionId: "s", tabId: 7, origin: "https://safe.test", expiresAt: 2_000 };
    const first = await tokenizeObservation(scanned, sensitiveFields, scope, vault);
    const second = await tokenizeObservation(scanned, sensitiveFields, scope, vault);
    expect(first.elements[0]!.value).toBe("[PASSWORD_1]");
    expect(second.elements[0]!.value).toBe("[PASSWORD_1]");
    expect(JSON.stringify(first)).not.toContain("secret");
    expect(await vault.issuedTokens("s")).toEqual(new Set(["[PASSWORD_1]"]));
    await expect(tokenizeObservation(scanned, [{ elementId: "E001", value: "4111111111111111", kind: "CARD", sensitivity: "CRITICAL", fieldRole: "card-number" }], scope, vault)).rejects.toThrow("UNSUPPORTED_PAYMENT_TOKEN");
  });

  it("fails closed if a post-action observation changed origin", () => {
    expect(() => assertAuthorizedOrigin("https://safe.test", "https://evil.test")).toThrow("CROSS_ORIGIN_REAUTH_REQUIRED");
  });

  it("purges session and vault on every terminal path and returns PING to IDLE", async () => {
    for (const status of ["DONE", "ASK_USER", "ERROR", "CANCELLED", "MAX_STEPS"]) {
      const storage = new Storage(); const vault = new TokenVault(new MemoryVaultStore());
      const runtime = new RuntimeLifecycle(storage, vault);
      const run = await runtime.begin({ sessionId: status, tabId: 7, origin: "https://safe.test", observationVersion: "pending" });
      const purge = vi.spyOn(vault, "purgeSession");
      await runtime.terminate(run);
      expect(purge).toHaveBeenCalledWith(status);
      expect(runtime.ping()).toEqual({ state: "IDLE", restartRequired: false });
      expect(storage.data[ACTIVE_SESSION_KEY]).toBeUndefined();
    }
  });
});
