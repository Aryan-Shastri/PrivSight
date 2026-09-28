import type { AgentAction } from "../actions/schemas";

export const DEFAULT_MAX_STEPS = 12;
export const HARD_MAX_STEPS = 15;

export interface AgentObservation {
  version: string;
  fingerprint: string;
  [key: string]: unknown;
}

export type ActionValidation =
  | { ok: true; requiresConfirmation: boolean }
  | { ok: false; code: string };

export interface OrchestratorDeps {
  observe(): Promise<AgentObservation>;
  sanitize(observation: AgentObservation): Promise<unknown>;
  egressCheck(sanitized: unknown): Promise<unknown>;
  plan(approved: unknown): Promise<AgentAction>;
  validate(action: AgentAction, observation: AgentObservation): Promise<ActionValidation>;
  confirm(action: AgentAction): Promise<boolean>;
  execute(action: AgentAction): Promise<{ ok: boolean; code?: string }>;
  verify(input: { action: AgentAction; before: AgentObservation; after: AgentObservation }): Promise<{ ok: boolean; code?: string }>;
}

export type OrchestratorStatus =
  | "DONE" | "ASK_USER" | "CONFIRMATION_REQUIRED" | "CANCELLED"
  | "MAX_STEPS" | "NO_PROGRESS" | "STALE_OBSERVATION"
  | "VERIFICATION_FAILED" | "ERROR";

export interface OrchestratorResult {
  status: OrchestratorStatus;
  steps: number;
  action?: AgentAction;
  code?: string;
}

const actionKey = (action: AgentAction) => JSON.stringify(action);

export async function runAgentOrchestrator(
  deps: OrchestratorDeps,
  options: { maxSteps?: number; signal?: AbortSignal } = {},
): Promise<OrchestratorResult> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error("INVALID_MAX_STEPS");
  if (maxSteps > HARD_MAX_STEPS) throw new Error("MAX_STEPS_EXCEEDS_HARD_LIMIT");
  let steps = 0;
  let current: AgentObservation | undefined;
  const seen = new Set<string>();

  try {
    while (steps < maxSteps) {
      if (options.signal?.aborted) return { status: "CANCELLED", steps };
      current ??= await deps.observe();
      const sanitized = await deps.sanitize(current);
      const approved = await deps.egressCheck(sanitized);
      const action = await deps.plan(approved);
      steps += 1;

      if (action.type === "DONE") return { status: "DONE", steps, action };
      if (action.type === "ASK_USER") return { status: "ASK_USER", steps, action };

      const validation = await deps.validate(action, current);
      if (!validation.ok) return { status: "ERROR", steps, action, code: validation.code };
      const key = `${current.fingerprint}\n${actionKey(action)}`;
      if (seen.has(key)) return { status: "NO_PROGRESS", steps, action };
      seen.add(key);

      if (validation.requiresConfirmation && !(await deps.confirm(action))) {
        return { status: "CONFIRMATION_REQUIRED", steps, action };
      }
      if (options.signal?.aborted) return { status: "CANCELLED", steps, action };
      const executed = await deps.execute(action);
      if (!executed.ok) return { status: "ERROR", steps, action, code: executed.code ?? "EXECUTION_FAILED" };

      const after = await deps.observe();
      if (after.version === current.version) return { status: "STALE_OBSERVATION", steps, action };
      const verified = await deps.verify({ action, before: current, after });
      if (!verified.ok) return { status: "VERIFICATION_FAILED", steps, action, code: verified.code ?? "EXPECTED_STATE_CHANGE_NOT_PROVEN" };
      if (after.fingerprint === current.fingerprint) return { status: "NO_PROGRESS", steps, action };
      current = after;
    }
    return { status: "MAX_STEPS", steps };
  } catch (error) {
    return { status: options.signal?.aborted ? "CANCELLED" : "ERROR", steps, code: String((error as Error)?.message ?? error) };
  }
}
