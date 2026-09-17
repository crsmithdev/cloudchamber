/**
 * The gate commands: the twelve decisions a person makes on a draw, as one
 * interface the HTTP API and the CLI both drive. A command validates its own
 * arguments, names the draw to show next, says whether its work continues after
 * the answer, and resolves to a payload of its own.
 *
 * The statuses and the preconditions are lifecycle.ts; the work itself is
 * draw.ts and drafting.ts. An adapter decides only what to do with a running
 * command: the API answers 202 and leaves it in the background, the CLI waits
 * for it and prints what it returned.
 */
import { newDrawId, type Pipeline } from "./draw.ts";
import type { Drafting } from "./drafting.ts";

export const GATE_ACTIONS = ["choose", "fork", "flag", "archive", "unarchive", "accept", "auto", "dismiss", "hold", "keep", "patch", "rewrite"] as const;
export type GateAction = (typeof GATE_ACTIONS)[number];
export const isGateAction = (s: string): s is GateAction => (GATE_ACTIONS as readonly string[]).includes(s);

/** What the commands take between them. Each one asks for what it needs and refuses what it lacks. */
export type GateArgs = { step_id?: string; note?: string; findings?: string[]; finding?: string; beat?: number };

/**
 * One command, already started. `draw` is the draw to show next, `running` says
 * the work goes on after the answer, and `done` resolves to the payload.
 */
export type GateCommand = { action: GateAction; draw: string | null; running: boolean; done: Promise<unknown> };

/** The answer an adapter gives back: which draw to show, whether work is still running, and the payload. */
export type GateResult = { draw: string | null; running: boolean; payload: unknown };

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
  const cmd = (running: boolean, draw: string | null, done: unknown): GateCommand =>
    ({ action: action as GateAction, draw, running, done: Promise.resolve(done) });
  switch (action) {
    case "choose": return cmd(true, id, p.choose(id, need(a.step_id, "step_id")));
    case "fork": {
      const forkId = newDrawId();
      return cmd(true, forkId, p.fork(id, need(a.step_id, "step_id"), forkId));
    }
    case "flag": return cmd(false, id, p.flag(id, note));
    case "archive": return cmd(false, id, p.archive(id, true));
    case "unarchive": return cmd(false, id, p.archive(id, false));
    case "accept": {
      const findings = need(a.findings, "findings");
      if (!findings.length) throw new Error("findings required");
      return cmd(true, id, d.accept(id, findings, { note }));
    }
    case "auto": return cmd(true, id, d.autoRounds(id, { note: note || undefined }));
    // a dismissal answers with the finding, and leaves the pane where it stands
    case "dismiss": return cmd(false, null, d.dismiss(id, need(a.finding, "finding"), note));
    case "hold": return cmd(false, id, d.hold(id));
    case "keep": return cmd(false, id, d.keep(id, note));
    // a patch is a text substitution, so it costs no model call and answers on the spot
    case "patch": return cmd(false, id, d.patch(id, a.findings ?? (a.finding ? [a.finding] : undefined), note));
    case "rewrite": return cmd(true, id, d.rewrite(id, Number(need(a.beat, "beat")), a.finding));
  }
  throw new Error(`action must be ${GATE_ACTIONS.join(" | ")}`);
}
