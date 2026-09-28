import { describe, expect, it } from "vitest";
import { runAgentOrchestrator, type AgentObservation, type OrchestratorDeps } from "../src/agent/orchestrator";
import type { AgentAction } from "../src/actions/schemas";

const observation = (version: string, state = "before"): AgentObservation => ({ version, fingerprint: state, value: state });

function deps(actions: AgentAction[], observations: AgentObservation[]): OrchestratorDeps {
  let actionIndex = 0;
  let observationIndex = 0;
  return {
    observe: async () => observations[observationIndex++]!,
    sanitize: async value => value,
    egressCheck: async value => value,
    plan: async () => actions[actionIndex++]!,
    validate: async () => ({ ok: true, requiresConfirmation: false }),
    confirm: async () => true,
    execute: async () => ({ ok: true }),
    verify: async ({ before, after }) => ({ ok: before.fingerprint !== after.fingerprint }),
  };
}

describe("bounded deterministic agent orchestrator", () => {
  it("runs the ordered loop, verifies a change, reobserves, and stops on DONE", async () => {
    const events: string[] = [];
    const d = deps([{ type: "CLICK", elementId: "E001" }, { type: "DONE", summary: "done" }], [observation("v1"), observation("v2", "after")]);
    for (const key of ["observe", "sanitize", "egressCheck", "plan", "validate", "execute", "verify"] as const) {
      const original = d[key]!;
      (d as any)[key] = async (...args: unknown[]) => { events.push(key); return (original as (...values: unknown[]) => unknown)(...args); };
    }
    const result = await runAgentOrchestrator(d);
    expect(result).toMatchObject({ status: "DONE", steps: 2 });
    expect(events).toEqual(["observe", "sanitize", "egressCheck", "plan", "validate", "execute", "observe", "verify", "sanitize", "egressCheck", "plan"]);
  });

  it("defaults to 12 steps and rejects a limit above the hard cap of 15", async () => {
    const waiting = Array.from({ length: 15 }, () => ({ type: "WAIT", milliseconds: 1 } as const));
    const observations = Array.from({ length: 16 }, (_, index) => observation(`v${index}`, String(index)));
    await expect(runAgentOrchestrator(deps(waiting, observations))).resolves.toMatchObject({ status: "MAX_STEPS", steps: 12 });
    await expect(runAgentOrchestrator(deps([], []), { maxSteps: 16 })).rejects.toThrow("MAX_STEPS_EXCEEDS_HARD_LIMIT");
  });

  it("fails closed when post-action verification cannot prove a state change", async () => {
    const result = await runAgentOrchestrator(deps([{ type: "CLICK", elementId: "E001" }], [observation("v1"), observation("v2")]));
    expect(result).toMatchObject({ status: "VERIFICATION_FAILED", steps: 1 });
  });

  it("stops on stale reobservations and repeated action plus observation", async () => {
    await expect(runAgentOrchestrator(deps([{ type: "CLICK", elementId: "E001" }], [observation("v1"), observation("v1", "after")]))).resolves.toMatchObject({ status: "STALE_OBSERVATION" });
    const repeated = deps([{ type: "WAIT", milliseconds: 1 }, { type: "WAIT", milliseconds: 1 }], [observation("v1", "a"), observation("v2", "b"), observation("v3", "b")]);
    repeated.verify = async () => ({ ok: true });
    await expect(runAgentOrchestrator(repeated)).resolves.toMatchObject({ status: "NO_PROGRESS", steps: 2 });
  });

  it("stops without execution on ASK_USER, denied confirmation, cancellation, validation error, and thrown error", async () => {
    await expect(runAgentOrchestrator(deps([{ type: "ASK_USER", message: "help" }], [observation("v1")]))).resolves.toMatchObject({ status: "ASK_USER" });
    const denied = deps([{ type: "CLICK", elementId: "E001" }], [observation("v1")]);
    denied.validate = async () => ({ ok: true, requiresConfirmation: true });
    denied.confirm = async () => false;
    await expect(runAgentOrchestrator(denied)).resolves.toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    await expect(runAgentOrchestrator(deps([], []), { signal: AbortSignal.abort() })).resolves.toMatchObject({ status: "CANCELLED", steps: 0 });
    const invalid = deps([{ type: "CLICK", elementId: "E001" }], [observation("v1")]);
    invalid.validate = async () => ({ ok: false, code: "INVALID_ELEMENT" });
    await expect(runAgentOrchestrator(invalid)).resolves.toMatchObject({ status: "ERROR", code: "INVALID_ELEMENT" });
    const broken = deps([], []); broken.observe = async () => { throw new Error("boom"); };
    await expect(runAgentOrchestrator(broken)).resolves.toMatchObject({ status: "ERROR", code: "boom" });
  });
});
