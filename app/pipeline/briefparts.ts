/**
 * The parts of a draw's brief: which artifact plays which role, how long each
 * part is allowed to be, and how a repair carries or rewrites one. A part's
 * role is the stage that wrote it (config.ts `STAGE_ROLE`), not its artifact
 * kind: the chosen vignette and the two context vignettes are all `vignette`
 * artifacts. The findings recorded against a chain are chain.ts.
 */
import { RUN, STAGE_ROLE, type PartRole, type StageName } from "./config.ts";
import type { DrawRow, Pipeline, StepRow } from "./draw.ts";
import { fill } from "./prompts.ts";
import { need, words } from "./model.ts";

export type Artifact = { id: string; step_id: string; kind: string; content: string; meta: string };

let passCounter = 0;
/** A check or screen pass id: millisecond time plus a counter, so two passes never share one and sort in order. */
export function passId(): string { return `${new Date().toISOString()}-${(passCounter++).toString(36).padStart(3, "0")}`; }

/** The role a stage writes, or none when the stage writes no part of a brief. */
export const roleOf = (stage: string): PartRole | undefined => STAGE_ROLE[stage];

/** The artifact kind each role is stored as. A context vignette is a `vignette` like the chosen one. */
const ROLE_KIND: Readonly<Record<PartRole, string>> = {
  vignette: "vignette", context: "vignette", outline: "outline", ending: "ending", job: "job",
};

/** The parser each written role is held to. A role with no entry is not written by a model call. */
const ROLE_PARSE: Readonly<Partial<Record<PartRole, (text: string) => string>>> = {
  vignette: (t) => need(t, "vignette"), context: (t) => need(t, "vignette"), ending: (t) => need(t, "ending"),
};

/** The keys `revisePart` stamps, and so takes off the meta a part carries over from the round before. */
const PROVENANCE = ["rewritten_from", "copied_from", "patched", "previous", "warnings"];

/** One part of a brief, with the step that wrote it and that step's stage. */
export type Part = {
  role: PartRole;
  stage: string;
  stepId: string;
  text: string;
  meta: Record<string, any>;
  index: number;      // the job's index for a context or a job, 0 otherwise
};

/**
 * The parts among artifacts that already know their stage, oldest first. An
 * `execute` vignette the gate did not choose is a candidate, not a part, so
 * only the chosen one is here.
 */
export function partsFrom(rows: (Artifact & { stage: string })[], chosenStep: string | null): Part[] {
  const out: Part[] = [];
  for (const a of rows) {
    const role = roleOf(a.stage);
    if (!role || a.kind !== ROLE_KIND[role]) continue;
    if (a.stage === "execute" && a.step_id !== chosenStep) continue;
    const meta = JSON.parse(a.meta);
    out.push({ role, stage: a.stage, stepId: a.step_id, text: a.content, meta, index: meta.index ?? 0 });
  }
  return out;
}

/** Every part of a draw, oldest first. */
export function partsOf(p: Pipeline, drawId: string): Part[] {
  const stages = new Map(p.steps(drawId).map((s) => [s.id, s.stage]));
  return partsFrom(p.artifacts(drawId).map((a) => ({ ...a, stage: stages.get(a.step_id) ?? "" })), p.draw(drawId).chosen_step);
}

/** Every part in a role, by the job's index, so context-1 is the same job in every round whichever step wrote it. */
export const partsIn = (parts: Part[], role: PartRole): Part[] =>
  parts.filter((x) => x.role === role).sort((a, b) => a.index - b.index);

/** The part that stands in a role now: the last one written. */
export const partOf = (parts: Part[], role: PartRole): Part | undefined =>
  parts.filter((x) => x.role === role).at(-1);

/** The `length` warning a part carries when it falls outside its role's band. */
export function lengthWarnings(role: PartRole, text: string): string[] {
  const band = RUN.partWords[role];
  if (!band) return [];
  const n = words(text);
  return (band.min !== undefined && n < band.min) || (band.max !== undefined && n > band.max) ? ["length"] : [];
}

/** The part standing in each role of a draw's brief now, contexts in job order. What a reader shows or drafts from. */
export function partsView(p: Pipeline, drawId: string): { vignette: Part | null; outline: Part | null; contexts: Part[]; ending: Part | null } {
  const parts = partsOf(p, drawId);
  return {
    vignette: partOf(parts, "vignette") ?? null,
    outline: partOf(parts, "outline") ?? null,
    contexts: partsIn(parts, "context"),
    ending: partOf(parts, "ending") ?? null,
  };
}

export type BriefParts = {
  draw: DrawRow;
  seed: string;
  premise: string;
  outline: string;
  outlineStepId: string;
  vignette: string;
  chosenStepId: string;
  contexts: string[];
  ending: string;
  examples: string[];
  settingJobs: string[];   // outline sections beyond the three core jobs
};

/** The outline sections a setting adds beyond the three core jobs. */
export const settingJobsOf = (jobs: string[]): string[] => jobs.filter((j) => !(RUN.coreJobs as readonly string[]).includes(j));

export function briefParts(p: Pipeline, drawId: string): BriefParts {
  const draw = p.draw(drawId);
  const parts = partsOf(p, drawId);
  const chosen = partOf(parts, "vignette");
  if (!chosen) throw new Error(`draw ${drawId}: no chosen vignette; the draw has not produced a brief`);
  const outline = partOf(parts, "outline"), ending = partOf(parts, "ending");
  if (!outline || !ending) throw new Error(`draw ${drawId}: brief incomplete (outline or ending missing)`);
  const jobs = (outline.meta.jobs as string[] | undefined) ?? [];
  const examples = (JSON.parse(draw.example_ids) as string[]).map((pid) => (p.db.query("SELECT text FROM passages WHERE id = ?").get(pid) as any)?.text).filter(Boolean);
  return {
    draw, seed: draw.seed_text, premise: chosen.meta.premise ?? "", outline: outline.text, outlineStepId: outline.stepId,
    vignette: chosen.text, chosenStepId: chosen.stepId, contexts: partsIn(parts, "context").map((c) => c.text), ending: ending.text, examples,
    settingJobs: settingJobsOf(jobs),
  };
}

/** The prose a reader of the story sees, in reading order: what a finding's span must be in, and what a score reads. */
export const prose = (b: Pick<BriefParts, "vignette" | "contexts" | "ending">): string => [b.vignette, ...b.contexts, b.ending].join("\n\n");

export function briefBlock(b: BriefParts): string {
  return fill("briefBlock", { seed: b.seed, premise: b.premise, outline: b.outline, vignette: b.vignette, context1: b.contexts[0] ?? "", context2: b.contexts[1] ?? "", ending: b.ending });
}

/**
 * Write one part of a repair's brief: rewritten from itself when `rewrite` is
 * given, carried over otherwise. Either way the part records where it came
 * from, which patches landed in it and whether its length is off, so a repair's
 * plan decides what to rewrite and nothing else.
 *
 * A carry costs no model call: the step is recorded as `patched` when a patch
 * landed in the text and `copied` when the part is untouched.
 */
export async function revisePart(p: Pipeline, o: {
  drawId: string;
  parent: string | null;
  role: PartRole;
  from?: string;                    // the step the part comes from; absent when it is written afresh
  text?: string;                    // the text as the patches left it, carried when there is no rewrite
  applied?: string[];               // the findings whose patch landed in that text
  meta?: Record<string, unknown>;   // what the part carries whichever way it goes
  previous?: string;                // kept on the part when this round changed it
  rewrite?: { stage: StageName; prompt: string };
  carry?: { stage: StageName };
}): Promise<{ step: StepRow; text: string }> {
  const kind = ROLE_KIND[o.role];
  const applied = o.applied ?? [];
  const meta = { ...o.meta };
  for (const k of PROVENANCE) delete meta[k];   // the round before wrote its own; this part's is stamped below
  const from = o.from ? { [o.rewrite ? "rewritten_from" : "copied_from"]: o.from } : {};
  if (o.rewrite) {
    const parse = ROLE_PARSE[o.role] ?? ((t: string) => t);
    const { step, value } = await p.invoke(o.drawId, o.parent, o.rewrite.stage, o.rewrite.prompt, parse);
    p.artifact(step, kind, value, { ...meta, ...from, ...(o.previous ? { previous: o.previous } : {}), warnings: lengthWarnings(o.role, value) });
    return { step, text: value };
  }
  if (!o.carry) throw new Error(`part ${o.role}: neither rewritten nor carried`);
  const step = p.recordStep(o.drawId, o.parent, o.carry.stage, applied.length ? "patched" : "copied");
  const text = o.text ?? "";
  // a carry that a patch landed in is a changed part, so it keeps what it replaced; an untouched one has nothing to show
  p.artifact(step, kind, text, { ...meta, ...from, ...(applied.length ? { patched: applied, ...(o.previous ? { previous: o.previous } : {}) } : {}) });
  return { step, text };
}
