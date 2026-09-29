/**
 * The gate commands: every decision a person makes on a draw, as one
 * interface the HTTP API and the CLI both drive; the list is lifecycle.ts's. A command validates its own
 * arguments, names the draw to show next, says whether its work continues after
 * the answer, and resolves to a payload of its own.
 *
 * The statuses and the preconditions are lifecycle.ts; the work itself is
 * draw.ts and drafting.ts. An adapter decides only what to do with a running
 * command: the API answers 202 and leaves it in the background, the CLI waits
 * for it and prints what it returned.
 */
import { newDrawId, type Pipeline } from "./draw.ts";
import type { Drafting, Instruction, PlanEdit } from "./drafting.ts";
import type { Overrides } from "./draftconfig.ts";
import { ACTIONS, type Action } from "./lifecycle.ts";
import { DISMISS_REASONS, isDismissReason, type DismissReason } from "./verdicts.ts";

export const GATE_ACTIONS = ACTIONS;
export type GateAction = Action;
export const isGateAction = (s: string): s is GateAction => (GATE_ACTIONS as readonly string[]).includes(s);

/** What the commands take between them. Each one asks for what it needs and refuses what it lacks. */
export type GateArgs = {
  step_id?: string; note?: string; findings?: string[]; finding?: string; beat?: number;
  beats?: number[]; instruction?: string; notes?: Record<string, string>; // rewrite: several beats, the flags ticked (`findings`) with a note on each, and the operator's words for them
  instructions?: Instruction[];                                         // accept: the operator's instructions, repaired with the findings
  premise?: string;                                                     // fork: the candidate's premise as the operator edited it
  reason?: DismissReason;                                               // dismiss
  checks?: string[]; samples?: number;                                  // check
  auto?: boolean; plan?: boolean; profile?: string; overrides?: Overrides; // draft: `plan` stops it at the plan gate
  at_beat?: number;                                                     // branch, replan
  real?: boolean;                                                       // mark: the finding read as real, or not, replan
  edits?: PlanEdit[];                                                   // apply: fields of beats the operator rewrote at the plan gate
  models?: Record<string, string>;                                      // any action: {stage or group: model}, set on the draw before it runs
};

/**
 * One command, already started. `draw` is the draw to show next, `running` says
 * the work goes on after the answer, and `done` resolves to the payload.
 */
export type GateCommand = { action: GateAction; draw: string | null; running: boolean; done: Promise<unknown> };

/** The answer an adapter gives back: which draw to show, whether work is still running, and the payload. */
export type GateResult = { draw: string | null; running: boolean; payload: unknown };

/** A manual draw drafts on from its brief and stops at the plan gate; an auto draw stops at its brief as before. */
const toPlan = (d: Drafting, id: string) => (d.p.draw(id).mode === "manual" ? d.draft(id, { plan: true }) : d.p.draw(id));

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined || v === null || v === "") throw new Error(`${what} required`);
  return v;
};

/**
 * Start `action` on a draw. It throws at once on an argument it needs and has
 * not got, and on a decision the draw's status refuses; the work of a running
 * command reports through `done`.
 */
export function gateCommand(p: Pipeline, d: Drafting, id: string, action: string, a: GateArgs = {}): GateCommand {
  const note = a.note ?? "";
  // a branch's models belong to the new draw, not to the draw it develops: the source is left as it stands
  if (a.models && Object.keys(a.models).length && action !== "branch") p.setModels(id, a.models);
  const cmd = (running: boolean, draw: string | null, done: unknown): GateCommand =>
    ({ action: action as GateAction, draw, running, done: Promise.resolve(done) });
  switch (action) {
    // a person's draw goes on from its brief to the plan gate: gate 1 is not a stop (docs/specs/2026-09-28-story-ir.md §15, T2)
    case "choose": return cmd(true, id, p.choose(id, need(a.step_id, "step_id")).then(() => toPlan(d, id)));
    case "fork": {
      const forkId = newDrawId();
      return cmd(true, forkId, p.fork(id, need(a.step_id, "step_id"), forkId, a.premise).then(() => toPlan(d, forkId)));
    }
    case "flag": return cmd(false, id, p.flag(id, note));
    case "archive": return cmd(false, id, p.archive(id, true));
    case "unarchive": return cmd(false, id, p.archive(id, false));
    case "accept": {
      const findings = a.findings ?? [];
      if (!findings.length && !a.instructions?.length) throw new Error("findings required");
      return cmd(true, id, d.accept(id, findings, { note, instructions: a.instructions }));
    }
    case "auto": return cmd(true, id, d.autoRounds(id, { note: note || undefined }));
    // a dismissal answers with the finding, and leaves the pane where it stands
    case "dismiss": {
      if (a.reason !== undefined && !isDismissReason(a.reason)) throw new Error(`reason must be ${DISMISS_REASONS.join(" | ")}`);
      return cmd(false, null, d.dismiss(id, need(a.finding, "finding"), note, "gate", a.reason));
    }
    case "hold": return cmd(false, id, d.hold(id));
    case "keep": return cmd(false, id, d.keep(id, note));
    case "apply": return cmd(true, id, d.applyPlan(id, { findings: a.findings, notes: a.notes, edits: a.edits }));
    case "replan": return cmd(true, id, d.replan(id, Number(need(a.at_beat, "at_beat")), a.instruction ?? "", { profile: a.profile, overrides: a.overrides }));
    case "mark": {
      if (typeof a.real !== "boolean") throw new Error("real required: true or false");
      return cmd(false, null, d.mark(id, need(a.finding, "finding"), a.real, note));
    }
    case "write": return cmd(true, id, d.writeScenes(id));
    case "rewrite": return cmd(true, id, d.rewrite(id, a.beats?.length ? a.beats.map(Number) : [Number(need(a.beat, "beat"))], { findings: a.findings, notes: a.notes, instruction: a.instruction }));
    case "check": return cmd(true, id, d.check(id, { checks: a.checks, samples: a.samples }));
    case "draft": return cmd(true, id, d.draft(id, { auto: !!a.auto, plan: !!a.plan, profile: a.profile, overrides: a.overrides }));
    // the branch is the draw to show next, as a fork is
    case "branch": return cmd(true, null, d.branch(id, { atBeat: a.at_beat, profile: a.profile, overrides: a.overrides, models: a.models, instruction: a.instruction }));
    // a deleted draw is nothing to show next
    case "delete": p.delete(id); return cmd(false, null, { deleted: id });
  }
  throw new Error(`action must be ${GATE_ACTIONS.join(" | ")}`);
}
