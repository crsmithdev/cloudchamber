/**
 * What the checking and drafting stages read from a finished draw: the brief's
 * pieces as artifacts, the six example passages, and the findings recorded
 * against it. Shared by check, repair, schedule, scenes, screens and export.
 */
import { RUN } from "./config.ts";
import type { DrawRow, Pipeline } from "./draw.ts";
import { fill } from "./prompts.ts";
import { latest } from "./verdicts.ts";
import type { Cluster } from "./recur.ts";

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
  const contexts = arts.filter((a) => a.kind === "vignette" && stageOf(a) === "context").map((a) => a.content);
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

// --- findings as artifacts -----------------------------------------------------

export type FindingMeta = Omit<Cluster, "reported"> & { pass: string; source: "check" | "screen"; screen?: string; beat?: number };
export type FindingView = FindingMeta & { artifact_id: string; decision: "accepted" | "dismissed" | "open"; note: string };

export function findingArtifacts(p: Pipeline, drawId: string): (FindingMeta & { artifact_id: string })[] {
  return p.artifacts(drawId).filter((a) => a.kind === "finding").map((a) => ({ ...(JSON.parse(a.meta) as FindingMeta), artifact_id: a.id }));
}

/** The latest check pass id on a draw, or null when none has run. Pass ids sort as strings in time order. */
export function latestCheckPass(p: Pipeline, drawId: string): string | null {
  const passes = p.artifacts(drawId).filter((a) => a.kind === "ledger" || (a.kind === "finding" && JSON.parse(a.meta).source === "check") || a.kind === "profile" && JSON.parse(a.meta).source === "check")
    .map((a) => JSON.parse(a.meta).pass as string).filter(Boolean);
  return passes.length ? passes.sort().at(-1)! : null;
}

export function decision(p: Pipeline, findingId: string): { decision: "accepted" | "dismissed" | "open"; note: string } {
  const l = latest(p.db, "finding", findingId);
  return l ? { decision: l.verdict === "keep" ? "accepted" : "dismissed", note: l.note } : { decision: "open", note: "" };
}

/** The reported check findings of the latest pass, with their gate decisions, in stored order. */
export function checkFindings(p: Pipeline, drawId: string): FindingView[] {
  const pass = latestCheckPass(p, drawId);
  if (!pass) return [];
  return findingArtifacts(p, drawId).filter((f) => f.source === "check" && f.pass === pass).map((f) => ({ ...f, ...decision(p, f.id) }));
}

/** Findings dismissed on this draw or any brief it repairs; a re-check does not raise them again. */
export function dismissedFindings(p: Pipeline, drawId: string): { span: string; statement: string }[] {
  const out: { span: string; statement: string }[] = [];
  const seen = new Set<string>();
  let id: string | null = drawId;
  while (id && !seen.has(id)) {
    seen.add(id);
    for (const f of findingArtifacts(p, id)) if (f.source === "check" && decision(p, f.id).decision === "dismissed") out.push({ span: f.span, statement: f.statement });
    id = p.draw(id).repaired_from;
  }
  return out;
}

/** The ledger the latest check extracted, or null. */
export function latestLedger(p: Pipeline, drawId: string): string | null {
  const ls = p.artifacts(drawId).filter((a) => a.kind === "ledger");
  if (!ls.length) return null;
  return ls.sort((a, b) => (JSON.parse(a.meta).pass as string).localeCompare(JSON.parse(b.meta).pass))[ls.length - 1].content;
}

/** The model family of a model id: the second token of claude-<family>-... */
export const family = (model: string) => model.split("-")[1] ?? model;

/**
 * The line every findings view carries when judge and generator share a
 * family, or null when at least one check ran on another family.
 */
export function judgeNote(p: Pipeline, drawId: string): string | null {
  const steps = p.steps(drawId).filter((s) => s.status === "done" && s.model !== "copied" && s.model !== "deterministic");
  const gen = new Set(steps.filter((s) => !/^(check|screen)-/.test(s.stage)).map((s) => family(s.model)));
  const judges = steps.filter((s) => /^(check|screen)-/.test(s.stage)).map((s) => family(s.model));
  if (!judges.length) return null;
  let genFamilies = gen;
  if (!genFamilies.size) {
    // a repaired draw's generation may be copied; look at the brief it repairs
    const from = p.draw(drawId).repaired_from;
    if (from) genFamilies = new Set(p.steps(from).filter((s) => s.status === "done" && !/^(check|screen)-/.test(s.stage) && s.model !== "copied").map((s) => family(s.model)));
  }
  const shared = judges.every((j) => genFamilies.has(j));
  return shared ? `checked on ${[...new Set(judges)].join(", ")}; judge and generator share a family` : null;
}
