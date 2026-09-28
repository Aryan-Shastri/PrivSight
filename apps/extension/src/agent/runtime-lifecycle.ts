import { clearSession, loadSession, saveSession, type PersistedSession, type SessionStorage } from "./session-store";
import { TokenVault, type VaultToken } from "../privacy/token-vault";
import type { Sensitivity, TokenKind } from "../privacy/types";

export interface SensitiveField { elementId: string; value: string; kind: TokenKind; sensitivity: Sensitivity; fieldRole: string }
export interface TokenScope { sessionId: string; tabId: number; origin: string; expiresAt: number }
export interface RunIdentity { sessionId: string; nonce: symbol }

export function assertAuthorizedOrigin(expected: string, actual: string): void {
  if (expected !== actual) throw new Error("CROSS_ORIGIN_REAUTH_REQUIRED");
}

export async function tokenizeObservation<T extends { elements: Array<Record<string, unknown>> }>(
  scanned: T, fields: SensitiveField[], scope: TokenScope, vault: TokenVault,
): Promise<T> {
  const aliases = new Map<string, VaultToken>();
  for (const field of fields) {
    if (field.kind === "CARD" || field.kind === "CVV") throw new Error("UNSUPPORTED_PAYMENT_TOKEN");
    aliases.set(field.elementId, await vault.put({
      value: field.value, kind: field.kind, sensitivity: field.sensitivity, ...scope,
      allowedFieldRoles: [field.fieldRole], sourceElementId: field.elementId,
    }));
  }
  return { ...scanned, elements: scanned.elements.map(element => aliases.has(String(element.id)) ? { ...element, value: aliases.get(String(element.id)) } : element) };
}

export class RuntimeLifecycle {
  private run?: RunIdentity;
  private restartRequired = false;
  private transition: Promise<void> = Promise.resolve();
  constructor(private storage: SessionStorage, private vault: TokenVault) {}
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transition.then(operation, operation);
    this.transition = result.then(() => undefined, () => undefined);
    return result;
  }
  recover(): Promise<{ restartRequired: boolean }> { return this.serialize(async () => {
    const stale = await loadSession(this.storage);
    if (stale) {
      await this.vault.purgeSession(stale.sessionId);
      await clearSession(this.storage);
      this.restartRequired = Boolean(stale.pending);
    }
    return { restartRequired: this.restartRequired };
  }); }
  ping() { return { state: this.run ? "ACTIVE" as const : "IDLE" as const, restartRequired: this.restartRequired }; }
  begin(session: PersistedSession): Promise<RunIdentity> { return this.serialize(async () => {
    if (this.run) throw new Error("AGENT_ALREADY_RUNNING");
    const run = { sessionId: session.sessionId, nonce: Symbol(session.sessionId) };
    this.run = run; this.restartRequired = false;
    try {
      const stale = await loadSession(this.storage);
      if (stale) await this.vault.purgeSession(stale.sessionId);
      await clearSession(this.storage);
      await saveSession(this.storage, session);
      return run;
    } catch (error) { if (this.run === run) this.run = undefined; throw error; }
  }); }
  isCurrent(run: RunIdentity) { return this.run === run; }
  terminate(run: RunIdentity): Promise<boolean> { return this.serialize(async () => {
    if (!this.isCurrent(run)) return false;
    await this.vault.purgeSession(run.sessionId);
    await clearSession(this.storage);
    this.run = undefined;
    return true;
  }); }
}
