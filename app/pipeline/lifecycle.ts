/**
 * A draw's lifecycle: the statuses it moves through, which action each status
 * allows, what running work does to the status, and the answers the UI reads
 * (the tab, whether work is running, whether the draw waits at a gate, and each
 * action allowed or why not). This module is the only writer of draws.status
 * and of the link columns that change with it.
 *
 * A failed action on a draw that already stood somewhere puts it back there with
 * the reason in draws.error, cleared by the next action that succeeds. `failed`
 * is only for a draw whose own creation failed: a draw's first run, a fork, a
 * branch, or a repair's new round, none of which had a status to go back to.
 *
 * The tabs follow docs/specs/2026-09-10-four-tabs.md: every draw is in ideate for
 * ever, and also in check from the moment a candidate is chosen, and in write
 * from the moment it has a schedule.
 */
import type { Db } from "./store/db.ts";
import type { DrawRow } from "./draw.ts";
import { now } from "./paths.ts";
import { stageTab, type Tab } from "./config.ts";

// `awaiting_plan_gate` is the IR gate (docs/specs/2026-09-28-story-ir.md §6, §13.3, S3): it sits where a
// plan is lowered and statically checked, after the schedule and before any scene is drafted. It follows
// `awaiting_draft_gate`'s pattern (a stop with an auto rule) but is not wired to any action or screen yet:
// nothing commits a draw to it and no `WHEN` entry names it. `planGateAuto` (`ir/gate.ts`) is its auto rule.
export const STATUSES = ["running", "awaiting_gate", "done", "checking", "awaiting_check_gate", "repairing", "repaired", "awaiting_plan_gate", "drafting", "awaiting_draft_gate", "drafted", "failed"] as const;
export type Status = (typeof STATUSES)[number];
// the tab a stage belongs in is a fact about the stage: config.ts holds the table, and this re-export keeps one import for the page
export { stageTab, type Tab };

export const ACTIONS = ["choose", "fork", "flag", "archive", "unarchive", "delete", "check", "auto", "accept", "dismiss", "hold", "draft", "branch", "rewrite", "keep"] as const;
export type Action = (typeof ACTIONS)[number];

const RUNNING = new Set<string>(["running", "checking", "repairing", "drafting"]);
const GATES = new Set<string>(["awaiting_gate", "awaiting_check_gate", "awaiting_plan_gate", "awaiting_draft_gate"]);
const CHECK = new Set<string>(["done", "checking", "awaiting_check_gate", "repairing", "repaired"]);
const WRITE = new Set<string>(["awaiting_plan_gate", "drafting", "awaiting_draft_gate", "drafted"]);

const AT_BRIEF = ["done", "awaiting_check_gate"];
/** The statuses each action is allowed at; an action missing here is allowed at any. */
const WHEN: Partial<Record<Action, string[]>> = {
  choose: ["awaiting_gate"],
  check: AT_BRIEF, auto: AT_BRIEF, draft: AT_BRIEF,
  accept: ["awaiting_check_gate"], dismiss: ["awaiting_check_gate"], hold: ["awaiting_check_gate"],
  rewrite: ["awaiting_draft_gate"], keep: ["awaiting_draft_gate"],
  // a branch develops a draft, so there has to be one; a draft still being written has no settled scenes to carry
  branch: ["awaiting_draft_gate", "drafted"],
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


/** The tab where a draw at this status waits for a person: at a gate, or a brief nobody has checked. */
export function waitsIn(status: string): Tab | null {
  return status === "awaiting_gate" ? "ideate" : status === "done" || status === "awaiting_check_gate" ? "check" : status === "awaiting_plan_gate" || status === "awaiting_draft_gate" ? "write" : null;
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

/** The columns that change with a draw's status: which candidate it chose, how, what replaced it, how it drafts. */
export type Links = Partial<Record<"chosen_step" | "gate_method" | "superseded_by" | "draft_config", string | null>>;
/** A draw's new status, its link columns, or both. `ended` stamps ended_at. A settled status clears the last failure. */
export type Commit = { id: string; status?: Status; ended?: boolean; links?: Links };
/**
 * A draw held while work runs: at `during`, with `set` written as the hold begins.
 * When the work throws the draw goes to `back` with the reason, and `undo` is
 * written: `back` is where the draw stood before, or `failed` for a draw the
 * work was creating.
 */
export type Hold = { id: string; during: Status; back: Status; set?: Links; undo?: Links };

function write(db: Db, id: string, fields: Record<string, string | null>): void {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.query(`UPDATE draws SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
}

/** Write each draw's status and links in one transaction, so no reader sees half of a change. */
export function commit(db: Db, commits: Commit | Commit[]): void {
  db.transaction(() => {
    for (const c of [commits].flat()) {
      write(db, c.id, {
        ...(c.status ? { status: c.status, error: null } : {}),
        ...(c.ended ? { ended_at: now() } : {}),
        ...(c.links ?? {}),
      });
    }
  })();
}

/**
 * Run one action's work with its draws held, then commit what it decides. The
 * work can read the held status and the links written with it. If it throws,
 * every held draw goes back, with the reason, and the error is rethrown; if it
 * returns, `then` names the commits, and they land together.
 */
export async function act<T>(db: Db, holds: Hold | Hold[], work: () => Promise<T>, then: (value: T) => Commit | Commit[]): Promise<T> {
  const hs = [holds].flat();
  // the error of the attempt before this one is not this attempt's: a re-run showed the old reason for as long as it ran
  // the hold records where the draw goes back, so a recovery after a dead process puts it where a throw would have
  db.transaction(() => { for (const h of hs) write(db, h.id, { status: h.during, error: null, ...(h.set ?? {}), hold_back: h.back, hold_undo: JSON.stringify(h.undo ?? {}) }); })();
  let value: T;
  try {
    value = await work();
  } catch (e) {
    const reason = String((e as Error)?.message ?? e).slice(0, 500);
    db.transaction(() => {
      for (const h of hs) release(db, h.id, h.back, reason, h.undo);
    })();
    throw e;
  }
  db.transaction(() => {
    commit(db, then(value));
    for (const h of hs) write(db, h.id, { hold_back: null, hold_undo: null });
  })();
  return value;
}

/** Put a held draw back at `back` with the reason, write the undo links, and end the hold. */
function release(db: Db, id: string, back: Status, reason: string, undo: Links = {}): void {
  write(db, id, { status: back, error: reason, ...(back === "failed" ? { ended_at: now() } : {}), ...undo, hold_back: null, hold_undo: null });
}

// --- recovery on start ------------------------------------------------------------

/**
 * A process that dies mid-work leaves steps `running` and draws at a working
 * status with no call behind them, and nothing revisits them: the SIGHUP path
 * waits for its jobs, a reboot does not. On start, every such step fails with
 * the reason and its draw goes back where `act()` would have put it: the
 * status and the undo links the hold wrote when it began.
 *
 * A step whose process is still alive is left exactly as it is, and so is its
 * draw. The store is shared: a `cloudchamber` CLI run and the service hold it
 * at once, and "running when I started" does not mean "abandoned".
 */
/**
 * Whether another process still holds this step. Signal 0 asks the kernel
 * without delivering anything: it returns for a process this user owns, and
 * throws `EPERM` for one it does not — which still means the process is there.
 * Only `ESRCH`, no such process, says the step was abandoned.
 */
function alive(pid: number | null): boolean {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

export function recoverInterrupted(db: Db, reason: string): { steps: number; draws: string[]; left: number } {
  const stamp = now();
  // a CLI run shares this store, so a running step whose process is alive has a call behind it after all.
  // `serve` used to fail every running step on start; on 2026-09-24 a commit reloaded the service and it
  // killed a `cloudchamber branch` that was 5 beats in, $0.86 spent.
  const running = db.query("SELECT id, draw_id, pid FROM steps WHERE status = 'running'").all() as { id: string; draw_id: string | null; pid: number | null }[];
  const live = running.filter((s) => alive(s.pid));
  const dead = running.filter((s) => !alive(s.pid));
  const busy = new Set(live.map((s) => s.draw_id).filter(Boolean) as string[]);
  const fail = db.query("UPDATE steps SET status = 'failed', fail_reason = 'error', ended_at = ?, error = ? WHERE id = ?");
  for (const s of dead) fail.run(stamp, reason, s.id);
  const steps = dead.length;
  const draws: string[] = [];
  const held = db.query("SELECT id, hold_back, hold_undo FROM draws WHERE hold_back IS NOT NULL").all() as { id: string; hold_back: Status; hold_undo: string }[];
  for (const d of held.filter((x) => !busy.has(x.id))) {
    release(db, d.id, d.hold_back, reason, JSON.parse(d.hold_undo) as Links);
    draws.push(d.id);
  }
  return { steps, draws, left: live.length };
}
