/**
 * S3 (backend only): the IR gate's status and its auto rule
 * (docs/specs/2026-09-28-story-ir.md §6, §13.3). No UI reads this yet; it is
 * a function a script calls, the way `evals/replay/run.ts` calls
 * `autoRounds` directly rather than through the API.
 *
 * The doc's gate sits between the schedule (S1's `Schedule`) and the first
 * scene: "brief → check → GATE 1 → repair … → lower (L1–L5) → GATE IR: edit |
 * replan | draft" (§6). `enterPlanGate` is the state transition (mirrors
 * `awaiting_draft_gate`, `lifecycle.ts`); `planGateAuto` is the auto rule:
 * "zero static errors and no `resolved = CONTRADICTED` symbol" (§6, ADR-0006:
 * no model decides at a gate).
 */
import type { Db } from "../store/db.ts";
import { commit, must, type Status } from "../lifecycle.ts";
import type { S1Finding } from "./s1.ts";
import type { Sym } from "./s2.ts";

/** What the gate reads: S1's static findings and S2's symbol table, for one draw. */
export type PlanGateInput = { s1: S1Finding[]; symbols: Sym[] };

export type PlanGateVerdict =
  | { pass: true }
  | { pass: false; reason: string; staticErrors: string[]; contradicted: string[] };

/**
 * The auto rule, read-only: no static error (S1) and no symbol L2 resolved
 * CONTRADICTED. A model-assisted finding (L4's plan-vs-ledger call) is not
 * part of the auto rule — same shape as `autoRounds`' floor rule
 * (`drafting.ts:464-466`): auto passes on the deterministic half only, and
 * leaves the model-assisted findings for the operator's pane.
 */
export function planGateAuto(input: PlanGateInput): PlanGateVerdict {
  const staticErrors = input.s1.map((f) => `[${f.check}]${f.beat ? ` beat ${f.beat}` : ""}: ${f.message}`);
  const contradicted = input.symbols.filter((s) => s.resolved === "CONTRADICTED").map((s) => s.id);
  if (!staticErrors.length && !contradicted.length) return { pass: true };
  return { pass: false, reason: `${staticErrors.length} static error(s), ${contradicted.length} contradicted symbol(s)`, staticErrors, contradicted };
}

/** Put a draw that has a schedule at the plan gate. Mirrors `awaiting_draft_gate`'s commit; callable from a script only. */
export function enterPlanGate(db: Db, drawId: string, from: { id: string; status: Status; chosen_step: string | null; repaired_from: string | null }): void {
  must(from, "draft");
  commit(db, { id: drawId, status: "awaiting_plan_gate" });
}
