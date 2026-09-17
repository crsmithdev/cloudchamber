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
import { RUN } from "./config.ts";
import { newDrawId, outlineJobs, parseJobs, parseOutline, renderOutline, type DrawRow, type Pipeline } from "./draw.ts";
import { compose, fill } from "./prompts.ts";
import { now } from "./paths.ts";
import { writeBrief } from "./brief.ts";
import { settle, under } from "./lifecycle.ts";
import { briefParts, partOf, partsIn, partsOf, revisePart } from "./briefparts.ts";
import { chainOf, type Settled } from "./chain.ts";
import { quoted } from "./recur.ts";
import type { FindingView } from "./chain.ts";

export type Accepted = Pick<FindingView, "id" | "span" | "invalidates" | "replacement"> & { patch?: string; result?: string };

// as loose as the checker that quoted it, so a span the verify pass kept is found here too
const inside = (span: string, text: string) => !span.trim() || quoted(text, span, 1);

/**
 * Whether a finding lands in a passage: its span is there, or, for a finding with
 * no patch, the second quote its result names is. A patch settles the conflict on
 * the span's side; without one the fix can need the other side, and on the fresh
 * draw of 2026-09-17 a constraint given only to the span's passage was met by
 * restating the span there while the conflicting half stayed in the ending.
 * Quotes in the evidence do not count: on the pit chain one of those carried a
 * registry row's fix into a notebook entry.
 */
export function landsIn(f: Accepted, text: string): boolean {
  if (inside(f.span, text)) return true;
  if (f.patch?.trim()) return false;
  const second = /^contradicts:\s*([\s\S]+)$/i.exec((f.result ?? "").trim())?.[1];
  return !!second && quoted(text, second);
}
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
  // a patch whose span matches no text exactly is a rewrite: the checker's quote matching is looser than the substitution
  const landed = new Set([vignette, ending, ...contexts].flatMap((t) => applyPatches(t, accepted).applied.map((f) => f.id)));
  const unpatchable = accepted.filter((f) => !f.patch?.trim() || !landed.has(f.id));
  return {
    vignette: unpatchable.some((f) => landsIn(f, vignette)),
    // an arithmetic or custody finding moves the mechanism, so the ending is re-derived even when patched elsewhere
    ending: unpatchable.some((f) => landsIn(f, ending)) || unpatchable.some((f) => ENDING_SECTIONS.has(f.invalidates.toLowerCase())),
    context: contexts.map((c) => unpatchable.some((f) => landsIn(f, c))),
  };
}

export const constraintsBlock = (accepted: Accepted[]) => fill("constraints", { constraints: accepted.map((f) => `- ${f.replacement}`).join("\n") });

/** The fixes accepted in earlier rounds, which the repair must keep true rather than trade away. */
export const settledBlock = (settled: Settled[]) =>
  settled.length ? fill("settled", { settled: settled.map((sc) => `- ${sc.replacement}`).join("\n") }) : "";

/**
 * Create the repaired draw and write its brief. Returns the new draw, a brief
 * nobody has checked yet. The source is marked repaired and superseded; the
 * caller runs the check. A repair that fails leaves the source at its gate.
 */
export async function repair(p: Pipeline, drawId: string, accepted: Accepted[]): Promise<DrawRow> {
  const parts = briefParts(p, drawId);
  const src = parts.draw;
  const newId = newDrawId();
  const name = p.nameFor(src.seed_text);
  p.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, sampling, darkness, status, gate_method, repaired_from, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`)
    .run(newId, name, src.setting, src.genre, src.mode, src.segment, src.seed_mode, src.seed_text, src.seed_theme_id, src.example_ids, src.sampling, src.darkness, src.gate_method, drawId, now());
  await under(p.db, drawId, "repairing", "awaiting_check_gate", () => under(p.db, newId, "running", "failed", () => develop(p, newId, parts, accepted)));
  settle(p.db, newId, "done", { ended: true });
  settle(p.db, drawId, "repaired", { ended: true });
  p.db.query("UPDATE draws SET superseded_by = ? WHERE id = ?").run(newId, drawId);
  return p.draw(newId);
}

const NAME = /\b\p{Lu}[\p{L}'’.-]{2,}/gu;
// case is folded: a header's BRIGHTWELL and a line's Brightwell are one name
const namesIn = (t: string) => new Set((t.match(NAME) ?? []).map((n) => n.toLowerCase()));

/**
 * A patch renames one mention. When it takes out a name that the rest of its
 * passage still uses and puts another in, the passage ends up with both: on a
 * fresh draw "Clearwater held the contract" became "Brightwell held the
 * contract" beside "the Clearwater cart". Such a patch is not applied, and the
 * finding repairs its passage as a whole.
 */
export function localPatch(f: Accepted, passages: string[]): boolean {
  if (!f.patch?.trim()) return false;
  const passage = passages.find((t) => inside(f.span, t));
  if (!passage) return true;
  const before = namesIn(f.span), after = namesIn(f.patch);
  const added = [...after].filter((n) => !before.has(n));
  if (!added.length) return true;
  const rest = namesIn(passage.replace(f.span, " "));
  return ![...before].some((n) => !after.has(n) && rest.has(n));
}

async function develop(p: Pipeline, newId: string, parts: ReturnType<typeof briefParts>, given: Accepted[]) {
  // a patch that would leave its passage with two names for one thing repairs the passage instead
  const passages = [parts.vignette, ...parts.contexts, parts.ending];
  const accepted = given.map((f) => (f.patch?.trim() && !localPatch(f, passages) ? { ...f, patch: "" } : f));
  const src = partsOf(p, parts.draw.id);
  const srcContexts = partsIn(src, "context");
  // a context vignette can only be carried over when its job line came with it
  const carryable = srcContexts.length === RUN.contextVignettes && srcContexts.every((c) => c.meta.job);

  // the patched findings land first, in place, with no model call; the plan then covers what is left
  const patchedVignette = applyPatches(parts.vignette, accepted);
  const patchedEnding = applyPatches(parts.ending, accepted);
  const patchedContexts = srcContexts.map((c) => applyPatches(c.text, accepted));

  const plan = repairPlan(accepted, parts.vignette, parts.ending, carryable ? srcContexts.map((c) => c.text) : []);
  if (!carryable) plan.context = Array.from({ length: RUN.contextVignettes }, () => true);
  // the outline takes every constraint; a passage takes only those that land in it. On the pit chain a vignette
  // rewrite given a registry row's constraint ("every haul, including number 219's") made Ruth number 219.
  const constraints = constraintsBlock(accepted);
  const within = (text: string, extra: Accepted[] = []) =>
    constraintsBlock([...accepted.filter((f) => landsIn(f, text)), ...extra.filter((f) => !landsIn(f, text))]);
  const landed = new Set([patchedVignette, patchedEnding, ...patchedContexts].flatMap((x) => x.applied.map((f) => f.id)));
  const endingExtra = accepted.filter((f) => ENDING_SECTIONS.has(f.invalidates.toLowerCase()) && (!f.patch?.trim() || !landed.has(f.id)));
  // the accepted set of this round is not the whole record: every earlier round's fix still holds
  const chain = chainOf(p, parts.draw.id);
  const settledLines = chain.settled().filter((sc) => !accepted.some((a) => a.id === sc.finding));
  const settled = settledBlock(settledLines);
  // the repair writes against the same pinned contract the check will hold it to
  const pinned = chain.ledger();
  const ledger = pinned ? fill("pinnedLedger", { ledger: pinned }) : "";
  const { setting } = p.loadDrawSetting(parts.draw);
  // a repair rewrites one passage against constraints it is given; the six example passages set
  // voice for a first draft and buy nothing here. repair-ending was the pipeline's largest prompt.
  const rewriteAsk = (stage: "execute" | "ending", ask: string) => {
    const slice = p.settingFor(stage, setting)?.slice;
    return slice ? `${slice}\n\n${ask}` : ask;
  };
  // the chosen vignette: rewritten from itself, or carried over
  const { step: vStep, text: vignette } = await revisePart(p, {
    drawId: newId, parent: null, role: "vignette", from: parts.chosenStepId,
    text: patchedVignette.text, applied: patchedVignette.applied.map((f) => f.id), meta: partOf(src, "vignette")!.meta,
    rewrite: plan.vignette
      ? { stage: "repair-vignette", prompt: rewriteAsk("execute", fill("repairVignette", { ledger, settled, vignette: patchedVignette.text, constraints: within(parts.vignette) })) }
      : undefined,
    carry: { stage: "repair-vignette" },
  });
  p.db.query("UPDATE draws SET chosen_step = ? WHERE id = ?").run(vStep.id, newId);

  // the outline, re-derived under the constraints
  const { settingJobs, jobNames } = outlineJobs(setting);
  // the structure as it stands goes in: re-deriving it from the vignette each round gave every round new numbers and names to find
  const outlineHead = fill("repairOutlineHead", { ledger, settled, seed: parts.seed, premise: parts.premise, vignette, outline: `<outline>\n${parts.outline}\n</outline>`, constraints });
  const { step: outlineStep, value: outline } = await p.invoke(newId, vStep.id, "repair-outline", compose(outlineHead, fill("outlineAsk", { settingJobs }), p.settingFor("outline", setting)), parseOutline(jobNames));
  const { text: outlineText, words: outlineWords } = renderOutline(outline);
  p.artifact(outlineStep, "outline", outlineText, { jobs: jobNames, constraints: accepted.map((f) => f.replacement), accepted: accepted.map((f) => f.id), words: outlineWords });

  // the context vignettes: each rewritten from itself when a finding lands in it, carried over otherwise;
  // only a brief whose contexts came without their jobs is written afresh under new jobs
  const briefHead = fill("head", { outline: outlineText, vignette });
  const after = (stage: "jobs" | "context" | "ending", ask: string) => compose(briefHead, ask, p.settingFor(stage, setting), "");
  let fresh: string[] = [];
  let jobsStep;
  if (!carryable) {
    const r = await p.invoke(newId, outlineStep.id, "jobs", after("jobs", fill("jobs", {})), parseJobs);
    fresh = r.value; jobsStep = r.step;
  } else {
    jobsStep = p.recordStep(newId, outlineStep.id, "jobs", "copied");
  }
  const jobs = plan.context.map((_, i) => (carryable ? (srcContexts[i].meta.job as string) : fresh[i]));
  jobs.forEach((j, i) => p.artifact(jobsStep, "job", j, { index: i + 1, copied: carryable }));
  const contextRuns = jobs.map((job, i) => revisePart(p, {
    drawId: newId, parent: outlineStep.id, role: "context", meta: { index: i + 1, job },
    from: carryable ? srcContexts[i].stepId : undefined,
    text: patchedContexts[i]?.text, applied: patchedContexts[i]?.applied.map((f) => f.id),
    rewrite: !carryable
      ? { stage: "context", prompt: after("context", fill("context", { job })) }
      : plan.context[i]
      ? { stage: "repair-context", prompt: rewriteAsk("execute", fill("repairVignette", { ledger, settled, vignette: patchedContexts[i].text, constraints: within(srcContexts[i].text) })) }
      : undefined,
    carry: { stage: "context" },
  }));

  // the ending: rewritten from itself under the constraints, or carried over
  const endingRun = revisePart(p, {
    drawId: newId, parent: outlineStep.id, role: "ending", from: partOf(src, "ending")!.stepId,
    text: patchedEnding.text, applied: patchedEnding.applied.map((f) => f.id), previous: parts.ending,
    rewrite: plan.ending
      ? { stage: "repair-ending", prompt: rewriteAsk("ending", fill("repairEnding", { ledger, settled, outline: outlineText, ending: patchedEnding.text, constraints: within(parts.ending, endingExtra) })) }
      : undefined,
    carry: { stage: "repair-ending" },
  });
  await Promise.all([...contextRuns, endingRun]);

  // this round's accepted findings are already listed under ## repaired_from
  const dir = writeBrief(p.db, newId, p.briefsDir, settledLines);
  p.artifact(outlineStep, "brief", dir, { repaired_from: parts.draw.id });
}
