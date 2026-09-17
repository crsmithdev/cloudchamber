/**
 * The pieces of a finished draw's brief as artifacts, with the six example
 * passages: what the checking and drafting stages read a brief as. The findings
 * recorded against a chain are chain.ts.
 */
import { RUN, CONTEXT_STAGES } from "./config.ts";
import type { DrawRow, Pipeline } from "./draw.ts";
import { fill } from "./prompts.ts";

export type Artifact = { id: string; step_id: string; kind: string; content: string; meta: string };

let passCounter = 0;
/** A check or screen pass id: millisecond time plus a counter, so two passes never share one and sort in order. */
export function passId(): string { return `${new Date().toISOString()}-${(passCounter++).toString(36).padStart(3, "0")}`; }

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

export function briefParts(p: Pipeline, drawId: string): BriefParts {
  const draw = p.draw(drawId);
  const arts = p.artifacts(drawId);
  const steps = new Map(p.steps(drawId).map((s) => [s.id, s]));
  const stageOf = (a: Artifact) => steps.get(a.step_id)?.stage ?? "";
  const chosen = arts.find((a) => a.kind === "vignette" && a.step_id === draw.chosen_step);
  if (!chosen) throw new Error(`draw ${drawId}: no chosen vignette; the draw has not produced a brief`);
  const outline = [...arts].reverse().find((a) => a.kind === "outline");
  const ending = [...arts].reverse().find((a) => a.kind === "ending");
  if (!outline || !ending) throw new Error(`draw ${drawId}: brief incomplete (outline or ending missing)`);
  // by the job's index, so context-1 is the same job in every round whichever step wrote it
  const contexts = arts.filter((a) => a.kind === "vignette" && CONTEXT_STAGES.has(stageOf(a)))
    .sort((a, b) => (JSON.parse(a.meta).index ?? 0) - (JSON.parse(b.meta).index ?? 0)).map((a) => a.content);
  const jobs = (JSON.parse(outline.meta).jobs as string[] | undefined) ?? [];
  const examples = (JSON.parse(draw.example_ids) as string[]).map((pid) => (p.db.query("SELECT text FROM passages WHERE id = ?").get(pid) as any)?.text).filter(Boolean);
  return {
    draw, seed: draw.seed_text, premise: JSON.parse(chosen.meta).premise ?? "", outline: outline.content, outlineStepId: outline.step_id,
    vignette: chosen.content, chosenStepId: chosen.step_id, contexts, ending: ending.content, examples,
    settingJobs: jobs.filter((j) => !(RUN.coreJobs as readonly string[]).includes(j)),
  };
}

export function briefBlock(b: BriefParts): string {
  return fill("briefBlock", { seed: b.seed, premise: b.premise, outline: b.outline, vignette: b.vignette, context1: b.contexts[0] ?? "", context2: b.contexts[1] ?? "", ending: b.ending });
}
