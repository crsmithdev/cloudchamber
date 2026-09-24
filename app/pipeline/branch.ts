/**
 * Branch a draft at a beat. A branch is a new draw that develops an existing
 * draft from a chosen point: it carries the brief, the pinned ledger, the
 * schedule and the scenes before that beat over word for word, and writes the
 * beats from there on itself.
 *
 * Nothing here calls a model. Every step it records is `copied`, so the branch
 * reads back as a draft whose front was written once — the story so far of
 * beat K is the same text the source's beat K read.
 *
 * It exists to hold a comparison still. Two arms of one experiment that each
 * derive their own schedule differ by the schedule as much as by the change
 * under test: the head-to-head run of 22 September found the only real
 * difference between two arms was the schedule's chronology choice, and the
 * replication run needed three drafts a side to see past it. A branch at beat 1
 * pins the schedule; a branch at beat K pins the story up to K as well.
 *
 * A branch is a new draw, so ADR-0009's rule holds: nothing is edited in place,
 * and the brief the branch drafts from is the brief the source drafted from.
 */
import { partOf, partsIn, partsOf, passId } from "./briefparts.ts";
import { chainOf } from "./chain.ts";
import { commit } from "./lifecycle.ts";
import type { DrawRow, Pipeline } from "./draw.ts";
import { ofKind, type SceneMeta } from "./artifacts.ts";
import { writeBrief } from "./brief.ts";
import type { StageName } from "./config.ts";
import type { Beat } from "./write.ts";

/** The provenance the source's own copy carries; the branch stamps its own. */
const carry = (meta: Record<string, any>, from: string) => {
  const { copied_from: _c, rewritten_from: _r, patched: _p, ...rest } = meta;
  return { ...rest, copied_from: from };
};

/** Where a branch starts writing, and the step of the source draft it carries last. */
export type BranchPoint = { from: number; at: string };

/**
 * Copy `src`'s brief and the front of its draft onto a new draw. Returns the
 * beat the caller writes from and the source step the branch carries last,
 * which is `draws.branch_at`.
 *
 * The ledger copied is the chain's, amended: `chain.ledger()` on a branch of one
 * draw reads back the same string the source's own scenes were held to, and the
 * branch heads a chain of its own so nothing re-extracts it.
 */
export function copyDraft(p: Pipeline, src: DrawRow, newId: string, atBeat: number): BranchPoint {
  const chain = chainOf(p, src.id);
  const sched = chain.latest("schedule");
  if (!sched) throw new Error(`draw ${src.id} has no schedule: there is no draft to branch`);
  const beats = sched.meta.beats as Beat[];
  if (!Number.isInteger(atBeat) || atBeat < 1 || atBeat > beats.length) {
    throw new Error(`draw ${src.id}: --at-beat is 1..${beats.length}, not ${atBeat}`);
  }
  const carried = chain.scenes().filter((s) => s.beat < atBeat);
  if (carried.length !== atBeat - 1) {
    const have = new Set(carried.map((s) => s.beat));
    const missing = Array.from({ length: atBeat - 1 }, (_, i) => i + 1).filter((k) => !have.has(k));
    throw new Error(`draw ${src.id}: a branch at beat ${atBeat} carries beats 1..${atBeat - 1}, and ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not written`);
  }

  const parts = partsOf(p, src.id);
  const chosen = partOf(parts, "vignette"), outline = partOf(parts, "outline"), ending = partOf(parts, "ending");
  if (!chosen || !outline || !ending) throw new Error(`draw ${src.id}: brief incomplete (vignette, outline or ending missing)`);
  const at = carried.at(-1)?.step_id ?? sched.step_id;

  p.copyDraw(src, newId, { branched_from: src.id, branch_at: at }, src.gate_method);

  // the brief, part by part, under the stage that wrote it in the source: a copied part reads as the part it copies
  const vStep = p.recordStep(newId, null, chosen.stage as StageName, "copied");
  p.artifact(vStep, "vignette", chosen.text, carry(chosen.meta, chosen.stepId));
  commit(p.db, { id: newId, links: { chosen_step: vStep.id } });

  const oStep = p.recordStep(newId, vStep.id, outline.stage as StageName, "copied");
  p.artifact(oStep, "outline", outline.text, carry(outline.meta, outline.stepId));
  // the jobs hang off the outline step, as they do wherever an outline is written
  ofKind(p.artifacts(src.id), "job").forEach((j, i) => p.artifact(oStep, "job", j.content, { index: i + 1, copied: true }));

  for (const c of partsIn(parts, "context")) {
    const step = p.recordStep(newId, oStep.id, c.stage as StageName, "copied");
    p.artifact(step, "vignette", c.text, carry(c.meta, c.stepId));
  }
  const eStep = p.recordStep(newId, oStep.id, ending.stage as StageName, "copied");
  p.artifact(eStep, "ending", ending.text, carry(ending.meta, ending.stepId));

  // the pinned ledger as the source was held to it, amendments folded in; `ledger_only` keeps it out of `passes()`,
  // because a branch has had no check of its own
  const ledger = chain.ledger();
  if (ledger) {
    const lStep = p.recordStep(newId, oStep.id, "ledger-extract", "copied");
    p.artifact(lStep, "ledger", ledger, { pass: passId(), sample: 1, ledger_only: true });
  }

  const sStep = p.recordStep(newId, oStep.id, "schedule", "copied");
  p.artifact(sStep, "schedule", sched.content, sched.meta);

  for (const sc of carried) {
    const meta = chain.artifact(sc.artifact_id)!.meta as SceneMeta;
    const step = p.recordStep(newId, sStep.id, "scene", "copied");
    // a scene keeps its beat, its cap and its length; the source's gate-2 record of it is the source's
    const { rewrite: _rw, rewrite_finding: _rf, ...rest } = meta;
    p.artifact(step, "scene", sc.text, carry(rest, sc.artifact_id) as SceneMeta);
  }

  p.artifact(oStep, "brief", writeBrief(p.db, newId, p.briefsDir), {});
  return { from: atBeat, at };
}

