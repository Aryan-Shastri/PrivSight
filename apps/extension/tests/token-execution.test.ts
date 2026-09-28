// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { TokenVault, MemoryVaultStore } from "../src/privacy/token-vault";

const scopedEntry = (overrides: Record<string, unknown> = {}) => ({
  value: "correct horse battery staple",
  kind: "PASSWORD" as const,
  sensitivity: "CRITICAL" as const,
  sessionId: "session-1",
  tabId: 7,
  origin: "https://safe.test",
  expiresAt: 2_000,
  allowedFieldRoles: ["password"],
  sourceElementId: "E001",
  ...overrides,
});

describe("TYPE_TOKEN secure execution", () => {
  it("rejects expired and incompatible field resolutions", async () => {
    const vault = new TokenVault(new MemoryVaultStore(), () => 1_000);
    const token = await vault.put(scopedEntry());
    await expect(vault.resolveForAction(token, { sessionId: "session-1", tabId: 7, origin: "https://safe.test", fieldRole: "email", sourceElementId: "E001" })).rejects.toThrow("TOKEN_FIELD_MISMATCH");

    const expired = new TokenVault(new MemoryVaultStore(), () => 2_000);
    const expiredToken = await expired.put(scopedEntry());
    await expect(expired.resolveForAction(expiredToken, { sessionId: "session-1", tabId: 7, origin: "https://safe.test", fieldRole: "password", sourceElementId: "E001" })).rejects.toThrow("TOKEN_EXPIRED");
  });

  it("rejects redirecting a token to a different element with the same role", async () => {
    const vault = new TokenVault(new MemoryVaultStore(), () => 1_000);
    const token = await vault.put(scopedEntry());
    await expect(vault.resolveForAction(token, {
      sessionId: "session-1", tabId: 7, origin: "https://safe.test",
      fieldRole: "password", sourceElementId: "E002",
    })).rejects.toThrow("TOKEN_ELEMENT_MISMATCH");
  });

  it("rejects payment token creation", async () => {
    const vault = new TokenVault(new MemoryVaultStore(), () => 1_000);
    await expect(vault.put(scopedEntry({ kind: "CARD", sensitivity: "HIGH", allowedFieldRoles: ["card-number"] }))).rejects.toThrow("UNSUPPORTED_PAYMENT_TOKEN");
  });

  it("types an ephemeral value only into the exact compatible element", async () => {
    document.body.innerHTML = '<input type="password" aria-label="Password" value="typed-secret">';
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 1, y: 2, width: 100, height: 20, top: 2, left: 1, right: 101, bottom: 22, toJSON() {} } as DOMRect);
    let listener: (message: unknown, sender: unknown, reply: (response: unknown) => void) => boolean | void = () => undefined;
    Object.assign(globalThis, { chrome: { runtime: { onMessage: { addListener(fn: typeof listener) { listener = fn; } } } } });
    delete (globalThis as { __privsightInstalled?: boolean }).__privsightInstalled;
    const source = readFileSync(`${process.cwd()}/public/content-runtime.js`, "utf8");
    Function(source)();

    const scan = await new Promise<any>((resolve) => listener({ type: "SCAN_DOM", observationVersion: "v1" }, {}, resolve));
    expect(scan.elements[0].value).toBeUndefined();
    expect(scan.sensitiveFields).toEqual([{ elementId: "E001", value: "typed-secret", kind: "PASSWORD", sensitivity: "CRITICAL", fieldRole: "password" }]);
    expect(JSON.stringify(scan.elements)).not.toContain("typed-secret");
    const response = await new Promise<any>((resolve) => listener({ type: "EXECUTE_TOKEN_VALUE", elementId: "E001", origin: location.origin, value: "local-only", fieldRole: "password", observationVersion:"v1" }, {}, resolve));
    expect(response).toEqual({ ok: true, result: { status: "EXECUTED" } });
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("local-only");

    await new Promise<any>((resolve)=>listener({type:"SCAN_DOM",observationVersion:"v2"},{},resolve));
    const mismatch = await new Promise<any>((resolve) => listener({ type: "EXECUTE_TOKEN_VALUE", elementId: "E001", origin: location.origin, value: "must-not-type", fieldRole: "email", observationVersion:"v2" }, {}, resolve));
    expect(mismatch).toEqual({ ok: false, error: "TOKEN_FIELD_MISMATCH" });
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("local-only");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (globalThis as { __privsightInstalled?: boolean }).__privsightInstalled;
  delete (globalThis as { chrome?: unknown }).chrome;
});
