/**
 * Stage 2: repair. A repair is a new draw linked to the one it repairs. The
 * chosen vignette, the ending and each context vignette survive as material
 * and are rewritten from themselves only when an accepted finding lands in
 * them; the outline is re-derived under the accepted replacements. Nothing is
 * regenerated from the premise.
 *
 * Every regenerated word is a new surface for the next check to find a
 * contradiction in, so a repair rewrites as little as the findings allow.
 */
import { randomBytes } from "node:crypto";
import { RUN } from "./config.ts";
import type { DrawRow, Pipeline } from "./draw.ts";
import { compose, fill } from "./prompts.ts";
import { sections, tag, tags, words } from "./model.ts";
import { now } from "./paths.ts";
import { writeBrief } from "./brief.ts";
import { briefParts, pinnedLedger, settledConstraints, type Settled } from "./briefparts.ts";
import { normalise } from "./recur.ts";
import { nextName } from "./names.ts";
import type { FindingView } from "./briefparts.ts";

export type Accepted = Pick<FindingView, "id" | "span" | "invalidates" | "replacement"> & { patch?: string };

const inside = (span: string, text: string) => normalise(text).includes(normalise(span));
const ENDING_SECTIONS = new Set(["arithmetic", "custody"]);

/**
 * Apply the findings that carry a patch straight to the text, and report which
 * ones landed. A patch is the span rewritten to stand in its place, so this is
 * a substitution and costs no model call. Every word a repair regenerates is a
 * new surface for the next check to find a contradiction in, and a whole-brief
 * rewrite to fix a date is what kept a chain at 7 to 10 findings for eleven
 * rounds.
 *
 * The match is on the raw text first, then on a whitespace-normalised form, so
 * a span quoted across a line break still lands.
 */
export function applyPatches(text: string, accepted: Accepted[]): { text: string; applied: Accepted[] } {
  let out = text;
  const applied: Accepted[] = [];
  for (const f of accepted) {
    if (!f.patch?.trim() || !f.span.trim()) continue;
    if (out.includes(f.span)) { out = out.replace(f.span, f.patch); applied.push(f); continue; }
    const loose = looseIndex(out, f.span);
    if (loose) { out = out.slice(0, loose.from) + f.patch + out.slice(loose.to); applied.push(f); }
  }
  return { text: out, applied };
}

/** Where a span sits in a text, ignoring how its whitespace was broken, or null. */
function looseIndex(text: string, span: string): { from: number; to: number } | null {
  const words = span.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return null;
  const m = new RegExp(words.join("\\s+"), "i").exec(text);
  return m ? { from: m.index, to: m.index + m[0].length } : null;
}

/**
 * Which pieces still need a model to rewrite them. A finding carrying a patch
 * is applied in place first, so a part is only regenerated when a finding
 * lands in it that a substitution cannot express.
 */
export function repairPlan(accepted: Accepted[], vignette: string, ending: string, contexts: string[] = []): { vignette: boolean; ending: boolean; context: boolean[] } {
  const unpatchable = accepted.filter((f) => !f.patch?.trim());
  return {
    vignette: unpatchable.some((f) => inside(f.span, vignette)),
    // an arithmetic or custody finding moves the mechanism, so the ending is re-derived even when patched elsewhere
    ending: unpatchable.some((f) => inside(f.span, ending)) || accepted.some((f) => ENDING_SECTIONS.has(f.invalidates.toLowerCase()) && !f.patch?.trim()),
    context: contexts.map((c) => unpatchable.some((f) => inside(f.span, c))),
  };
}

export const constraintsBlock = (accepted: Accepted[]) => fill("constraints", { constraints: accepted.map((f) => `- ${f.replacement}`).join("\n") });

/** The fixes accepted in earlier rounds, which the repair must keep true rather than trade away. */
export const settledBlock = (settled: Settled[]) =>
  settled.length ? fill("settled", { settled: settled.map((sc) => `- ${sc.replacement}`).join("\n") }) : "";

/**
 * Create the repaired draw and write its brief. Returns the new draw. The
 * source is marked repaired and superseded; the caller runs the check.
 */
export async function repair(p: Pipeline, drawId: string, accepted: Accepted[]): Promise<DrawRow> {
  const parts = briefParts(p, drawId);
  const src = parts.draw;
  const newId = `${now().replace(/[-:TZ]/g, "").slice(0, 15)}-${randomBytes(2).toString("hex")}`;
  const name = nextName((p.db.query("SELECT name FROM draws WHERE name IS NOT NULL").all() as { name: string }[]).map((r) => r.name), src.seed_text);
  p.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, sampling, darkness, status, gate_method, repaired_from, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`)
    .run(newId, name, src.setting, src.genre, src.mode, src.segment, src.seed_mode, src.seed_text, src.seed_theme_id, src.example_ids, src.sampling, src.darkness, src.gate_method, drawId, now());
  p.db.query("UPDATE draws SET status = 'repairing' WHERE id = ?").run(drawId);
  try {
    await develop(p, newId, parts, accepted);
  } catch (e) {
    p.fail(newId, e);
    p.db.query("UPDATE draws SET status = 'awaiting_check_gate' WHERE id = ?").run(drawId);
    throw e;
  }
  p.db.query("UPDATE draws SET status = 'repaired', superseded_by = ?, ended_at = ? WHERE id = ?").run(newId, now(), drawId);
  return p.draw(newId);
}

async function develop(p: Pipeline, newId: string, parts: ReturnType<typeof briefParts>, accepted: Accepted[]) {
  const srcArts = p.artifacts(parts.draw.id);
  const srcStages = new Map(p.steps(parts.draw.id).map((s) => [s.id, s.stage]));
  const srcContexts = srcArts.filter((a) => a.kind === "vignette" && srcStages.get(a.step_id) === "context")
    .map((a) => ({ content: a.content, meta: JSON.parse(a.meta) as { index?: number; job?: string } }))
    .sort((a, b) => (a.meta.index ?? 0) - (b.meta.index ?? 0));
  // a context vignette can only be carried over when its job line came with it
  const carryable = srcContexts.length === RUN.contextVignettes && srcContexts.every((c) => c.meta.job);

  // the patched findings land first, in place, with no model call; the plan then covers what is left
  const patchedVignette = applyPatches(parts.vignette, accepted);
  const patchedEnding = applyPatches(parts.ending, accepted);
  const patchedContexts = srcContexts.map((c) => applyPatches(c.content, accepted));
  const landed = [patchedVignette, patchedEnding, ...patchedContexts].flatMap((x) => x.applied.map((f) => f.id));

  const plan = repairPlan(accepted, parts.vignette, parts.ending, carryable ? srcContexts.map((c) => c.content) : []);
  if (!carryable) plan.context = Array.from({ length: RUN.contextVignettes }, () => true);
  // the outline takes every constraint; a passage takes only those that land in it. On the pit chain a vignette
  // rewrite given a registry row's constraint ("every haul, including number 219's") made Ruth number 219.
  const constraints = constraintsBlock(accepted);
  const within = (text: string, extra: Accepted[] = []) =>
    constraintsBlock([...accepted.filter((f) => inside(f.span, text)), ...extra.filter((f) => !inside(f.span, text))]);
  const endingExtra = accepted.filter((f) => ENDING_SECTIONS.has(f.invalidates.toLowerCase()) && !f.patch?.trim());
  // the accepted set of this round is not the whole record: every earlier round's fix still holds
  const settledLines = settledConstraints(p, parts.draw.id).filter((sc) => !accepted.some((a) => a.id === sc.finding));
  const settled = settledBlock(settledLines);
  // the repair writes against the same pinned contract the check will hold it to
  const pinned = pinnedLedger(p, parts.draw.id);
  const ledger = pinned ? fill("pinnedLedger", { ledger: pinned }) : "";
  const { setting } = p.loadDrawSetting(parts.draw);
  // a repair rewrites one passage against constraints it is given; the six example passages set
  // voice for a first draft and buy nothing here. repair-ending was the pipeline's largest prompt.
  const rewriteAsk = (stage: "execute" | "ending", ask: string) => {
    const slice = p.settingFor(stage, setting)?.slice;
    return slice ? `${slice}\n\n${ask}` : ask;
  };
  const chosenMeta = JSON.parse(srcArts.find((a) => a.step_id === parts.chosenStepId && a.kind === "vignette")!.meta);

  // the chosen vignette: rewritten from itself, or carried over
  let vignette = patchedVignette.text;
  let vStep;
  if (plan.vignette) {
    const r = await p.invoke(newId, null, "repair-vignette", rewriteAsk("execute", fill("repairVignette", { ledger, settled, vignette: patchedVignette.text, constraints: within(parts.vignette) })), (t) => {
      const v = tag(t, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
    });
    vignette = r.value; vStep = r.step;
    p.artifact(vStep, "vignette", vignette, { ...chosenMeta, rewritten_from: parts.chosenStepId, warnings: words(vignette) < 300 || words(vignette) > 500 ? ["length"] : [] });
  } else {
    vStep = p.recordStep(newId, null, "repair-vignette", patchedVignette.applied.length ? "patched" : "copied");
    p.artifact(vStep, "vignette", vignette, { ...chosenMeta, copied_from: parts.chosenStepId, ...(patchedVignette.applied.length ? { patched: patchedVignette.applied.map((f) => f.id) } : {}) });
  }
  p.db.query("UPDATE draws SET chosen_step = ? WHERE id = ?").run(vStep.id, newId);

  // the outline, re-derived under the constraints
  const settingJobs = (setting?.jobs ?? []).map((j) => fill("settingJob", { name: j.name, description: j.description })).join("");
  const jobNames = [...RUN.coreJobs, ...(setting?.jobs ?? []).map((j) => j.name.toLowerCase())];
  // the structure as it stands goes in: re-deriving it from the vignette each round gave every round new numbers and names to find
  const outlineHead = fill("repairOutlineHead", { ledger, settled, seed: parts.seed, premise: parts.premise, vignette, outline: `<outline>\n${parts.outline}\n</outline>`, constraints });
  const { step: outlineStep, value: outline } = await p.invoke(newId, vStep.id, "repair-outline", compose(outlineHead, fill("outlineAsk", { settingJobs }), p.settingFor("outline", setting)), (text) => {
    const secs = sections(text);
    for (const j of jobNames) if (!secs[j]) throw new Error(`missing <section name="${j}">`);
    return secs;
  });
  const outlineText = Object.entries(outline).map(([n, body]) => `## ${n}\n\n${body}`).join("\n\n");
  p.artifact(outlineStep, "outline", outlineText, { jobs: jobNames, constraints: accepted.map((f) => f.replacement), accepted: accepted.map((f) => f.id), words: Object.fromEntries(Object.entries(outline).map(([n, b]) => [n, words(b)])) });

  // the context vignettes: each rewritten from itself when a finding lands in it, carried over otherwise;
  // only a brief whose contexts came without their jobs is written afresh under new jobs
  const briefHead = fill("head", { outline: outlineText, vignette });
  const after = (stage: "jobs" | "context" | "ending", ask: string) => compose(briefHead, ask, p.settingFor(stage, setting), "");
  let fresh: string[] = [];
  let jobsStep;
  if (!carryable) {
    const r = await p.invoke(newId, outlineStep.id, "jobs", after("jobs", fill("jobs", {})), (text) => {
      const js = tags(text, "job");
      if (js.length !== RUN.contextVignettes) throw new Error(`expected ${RUN.contextVignettes} jobs, got ${js.length}`);
      if (new Set(js.map((j) => j.toLowerCase())).size !== js.length) throw new Error("identical jobs");
      return js;
    });
    fresh = r.value; jobsStep = r.step;
  } else {
    jobsStep = p.recordStep(newId, outlineStep.id, "jobs", "copied");
  }
  const jobs = plan.context.map((_, i) => (carryable ? srcContexts[i].meta.job! : fresh[i]));
  jobs.forEach((j, i) => p.artifact(jobsStep, "job", j, { index: i + 1, copied: carryable }));
  const contextRuns = jobs.map((job, i) => !carryable
    ? p.invoke(newId, outlineStep.id, "context", after("context", fill("context", { job })), (text) => {
        const v = tag(text, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
      }).then((r) => p.artifact(r.step, "vignette", r.value, { index: i + 1, job, warnings: words(r.value) > 500 ? ["length"] : [] }))
    : plan.context[i]
    ? p.invoke(newId, outlineStep.id, "repair-context", rewriteAsk("execute", fill("repairVignette", { ledger, settled, vignette: patchedContexts[i].text, constraints: within(srcContexts[i].content) })), (text) => {
        const v = tag(text, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
      }).then((r) => p.artifact(r.step, "vignette", r.value, { index: i + 1, job, rewritten_from: parts.draw.id, warnings: words(r.value) > 500 ? ["length"] : [] }))
    : Promise.resolve(p.artifact(p.recordStep(newId, outlineStep.id, "context", patchedContexts[i].applied.length ? "patched" : "copied"), "vignette", patchedContexts[i].text, { index: i + 1, job, copied_from: parts.draw.id, ...(patchedContexts[i].applied.length ? { patched: patchedContexts[i].applied.map((f) => f.id) } : {}) })));

  // the ending: rewritten from itself under the constraints, or carried over
  const endingRun = plan.ending
    ? p.invoke(newId, outlineStep.id, "repair-ending", rewriteAsk("ending", fill("repairEnding", { ledger, settled, outline: outlineText, ending: patchedEnding.text, constraints: within(parts.ending, endingExtra) })), (t) => {
        const e = tag(t, "ending"); if (!e) throw new Error("no <ending> tag"); return e;
      }).then((r) => p.artifact(r.step, "ending", r.value, { previous: parts.ending, warnings: words(r.value) > 650 ? ["length"] : [] }))
    : Promise.resolve(p.artifact(p.recordStep(newId, outlineStep.id, "repair-ending", patchedEnding.applied.length ? "patched" : "copied"), "ending", patchedEnding.text,
        patchedEnding.applied.length ? { previous: parts.ending, patched: patchedEnding.applied.map((f) => f.id) } : { copied: true }));
  await Promise.all([...contextRuns, endingRun]);

  // this round's accepted findings are already listed under ## repaired_from
  const dir = writeBrief(p.db, newId, p.stages, p.briefsDir, p.settingsDir, settledLines);
  p.artifact(outlineStep, "brief", dir, { repaired_from: parts.draw.id });
}
