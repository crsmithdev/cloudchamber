/**
 * A draw's lifecycle: the statuses it moves through, which action each status
 * allows, what running work does to the status, and the answers the UI reads
 * (the tab, whether work is running, whether the draw waits at a gate, and each
 * action allowed or why not). This module is the only writer of draws.status.
 *
 * A failed action on a draw that already stood somewhere puts it back there with
 * the reason in draws.error, cleared by the next action that succeeds. `failed`
 * is only for a draw whose own creation failed: a draw's first run, a fork, or a
 * repair's new round, none of which had a status to go back to.
 *
 * The tabs follow docs/specs/2026-09-10-four-tabs.md: every draw is in ideate for
 * ever, and also in check from the moment a candidate is chosen, and in write
 * from the moment it has a schedule.
 */
import type { Db } from "./store/db.ts";
import type { DrawRow } from "./draw.ts";
import { now } from "./paths.ts";

export const STATUSES = ["running", "awaiting_gate", "done", "checking", "awaiting_check_gate", "repairing", "repaired", "drafting", "awaiting_draft_gate", "drafted", "failed"] as const;
export type Status = (typeof STATUSES)[number];
export type Tab = "ideate" | "check" | "write";

export const ACTIONS = ["choose", "fork", "flag", "archive", "unarchive", "delete", "check", "auto", "accept", "dismiss", "hold", "draft", "rewrite", "keep"] as const;
export type Action = (typeof ACTIONS)[number];

const RUNNING = new Set<string>(["running", "checking", "repairing", "drafting"]);
const GATES = new Set<string>(["awaiting_gate", "awaiting_check_gate", "awaiting_draft_gate"]);
const CHECK = new Set<string>(["done", "checking", "awaiting_check_gate", "repairing", "repaired"]);
const WRITE = new Set<string>(["drafting", "awaiting_draft_gate", "drafted"]);

const AT_BRIEF = ["done", "awaiting_check_gate"];
/** The statuses each action is allowed at; an action missing here is allowed at any. */
const WHEN: Partial<Record<Action, string[]>> = {
  choose: ["awaiting_gate"],
  check: AT_BRIEF, auto: AT_BRIEF, draft: AT_BRIEF,
  accept: ["awaiting_check_gate"], dismiss: ["awaiting_check_gate"], hold: ["awaiting_check_gate"],
  rewrite: ["awaiting_draft_gate"], keep: ["awaiting_draft_gate"],
};

/** What the rules read off a draw. `referenced_by` is every draw pointing at it, which only delete reads. */
export type DrawFacts = Pick<DrawRow, "id" | "status" | "chosen_step" | "repaired_from"> & { referenced_by?: string[] };

/** Why `action` is refused on this draw now, or null when it is allowed. */
export function whyNot(draw: DrawFacts, action: Action): string | null {
  const when = WHEN[action];
  if (when && !when.includes(draw.status)) return `draw ${draw.id} is ${draw.status}, not ${when.join(" | ")}`;
  if (action === "fork") {
    if (draw.status === "awaiting_gate") return `draw ${draw.id} is awaiting the gate; choose a candidate instead of forking`;
    if (!draw.chosen_step) return `draw ${draw.id} chose no candidate; there is nothing to fork from`;
  }
  if (action === "delete") {
    if (draw.chosen_step) return `draw ${draw.id} developed a candidate; archive it instead of deleting it`;
    if (draw.referenced_by?.length) return `draw ${draw.id} is referenced by ${draw.referenced_by.join(", ")}`;
  }
  return null;
}

/** Throw the reason `action` is refused on this draw, if it is. */
export function must(draw: DrawFacts, action: Action): void {
  const why = whyNot(draw, action);
  if (why) throw new Error(why);
}

export function tabOf(draw: Pick<DrawRow, "status" | "chosen_step" | "repaired_from">): Tab {
  if (WRITE.has(draw.status)) return "write";
  if (CHECK.has(draw.status) || draw.chosen_step || draw.repaired_from) return "check";
  return "ideate";
}

/**
 * The tab a step belongs in: generation is ideate, checking and repair are
 * check, and scheduling, scenes and screens are write. The page filters its
 * step list by this rather than holding the stage names itself.
 */
/**
 * The tab each stage's steps belong in. `null` is a stage that runs on no draw
 * — the corpus and setting stages — so no draw's step list holds one. The page
 * filters its steps by this rather than keeping the stage names itself; a new
 * stage has to be placed here, which is the point of writing them all out.
 */
const STAGE_TAB: Readonly<Record<string, Tab | null>> = {
  themes: null, redundancy: null, "distill-map": null, distill: null,
  premises: "ideate", execute: "ideate", outline: "ideate", jobs: "ideate", context: "ideate", ending: "ideate",
  "ledger-extract": "check", "check-derivation": "check", "check-ledger": "check", "check-verify": "check",
  "check-structure": "check", "check-resemblance": "check", "check-claims-extract": "check", "check-claims-verify": "check",
  reconcile: "check", "repair-vignette": "check", "repair-context": "check", "repair-outline": "check", "repair-ending": "check",
  schedule: "write", scene: "write", "screen-ledger": "write", "screen-structure": "write", "screen-slop": "write",
};
export const stageTab = (stage: string): Tab | null => STAGE_TAB[stage] ?? null;

/** The tab where a draw at this status waits for a person: at a gate, or a brief nobody has checked. */
export function waitsIn(status: string): Tab | null {
  return status === "awaiting_gate" ? "ideate" : status === "done" || status === "awaiting_check_gate" ? "check" : status === "awaiting_draft_gate" ? "write" : null;
}

export type LifecycleView = { stage: Tab; running: boolean; at_gate: boolean; actions: Record<Action, string | null> };

/** Everything the UI reads about a draw's lifecycle, so it keeps no status rules of its own. */
export function lifecycleView(draw: DrawFacts): LifecycleView {
  return {
    stage: tabOf(draw),
    running: RUNNING.has(draw.status),
    at_gate: GATES.has(draw.status),
    actions: Object.fromEntries(ACTIONS.map((a) => [a, whyNot(draw, a)])) as Record<Action, string | null>,
  };
}

// --- writing the status ---------------------------------------------------------

/** Set a draw's status after an action succeeded, which clears the last failure. `ended` stamps ended_at. */
export function settle(db: Db, drawId: string, status: Status, opts: { ended?: boolean } = {}): void {
  db.query(`UPDATE draws SET status = ?, error = NULL${opts.ended ? ", ended_at = ?" : ""} WHERE id = ?`)
    .run(...(opts.ended ? [status, now(), drawId] : [status, drawId]));
}

/**
 * Run work with the draw at a working status. When the work throws, the draw goes
 * to `back` with the reason recorded, and the error is rethrown: `back` is the
 * status the draw stood at before, or `failed` for a draw the work was creating.
 * On success the status stays at `during` for the caller to settle.
 */
export async function under<T>(db: Db, drawId: string, during: Status, back: Status, work: () => Promise<T>): Promise<T> {
  db.query("UPDATE draws SET status = ? WHERE id = ?").run(during, drawId);
  try {
    return await work();
  } catch (e) {
    const reason = String((e as Error)?.message ?? e).slice(0, 500);
    db.query(`UPDATE draws SET status = ?, error = ?${back === "failed" ? ", ended_at = ?" : ""} WHERE id = ?`)
      .run(...(back === "failed" ? [back, reason, now(), drawId] : [back, reason, drawId]));
    throw e;
  }
}

// --- recovery on start ------------------------------------------------------------

/**
 * A process that dies mid-work leaves steps `running` and draws at a working
 * status with no call behind them, and nothing revisits them: the SIGHUP path
 * waits for its jobs, a reboot does not. On start, every such step fails with
 * the reason and its draw goes back where `under()` would have put it, read
 * off what the draw has: a schedule, a check pass, a brief, a chosen candidate.
 */
export function recoverInterrupted(db: Db, reason: string): { steps: number; draws: string[] } {
  const stamp = now();
  const steps = db.query("UPDATE steps SET status = 'failed', fail_reason = 'error', ended_at = ?, error = ? WHERE status = 'running'").run(stamp, reason).changes;
  const draws: string[] = [];
  for (const d of db.query("SELECT id, status, chosen_step, repaired_from, forked_from FROM draws WHERE status IN ('running', 'checking', 'repairing', 'drafting')").all() as Interrupted[]) {
    const back = interruptedBack(db, d);
    db.query(`UPDATE draws SET status = ?, error = ?${back === "failed" ? ", ended_at = ?" : ""} WHERE id = ?`)
      .run(...(back === "failed" ? [back, reason, stamp, d.id] : [back, reason, d.id]));
    draws.push(d.id);
  }
  return { steps, draws };
}
type Interrupted = { id: string; status: string; chosen_step: string | null; repaired_from: string | null; forked_from: string | null };
/** The status an interrupted draw stood at before the work began. */
function interruptedBack(db: Db, d: Interrupted): Status {
  const has = (kind: string) => !!db.query("SELECT 1 FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.draw_id = ? AND a.kind = ? LIMIT 1").get(d.id, kind);
  // a first run, a fork or a repair's new round was making the draw; a draw developing its chosen candidate was at the gate
  if (d.status === "running") return d.repaired_from || d.forked_from || !d.chosen_step ? "failed" : "awaiting_gate";
  if (d.status === "repairing") return "awaiting_check_gate";
  if (d.status === "drafting" && has("schedule")) return "awaiting_draft_gate";
  return has("pass") ? "awaiting_check_gate" : "done";
}
