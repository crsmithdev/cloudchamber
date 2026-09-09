/**
 * Stage 2: repair. A repair is a new draw linked to the one it repairs. The
 * chosen vignette and the ending survive as material and are rewritten from
 * themselves only when an accepted finding lands in them; the outline is
 * re-derived under the accepted replacements; the context vignettes are
 * regenerated. Nothing is regenerated from the premise.
 */
import { randomBytes } from "node:crypto";
import { RUN } from "./config.ts";
import type { DrawRow, Pipeline } from "./draw.ts";
import { compose, fill } from "./prompts.ts";
import { sections, tag, tags, words } from "./model.ts";
import { now } from "./paths.ts";
import { writeBrief } from "./brief.ts";
import { briefParts } from "./briefparts.ts";
import { normalise } from "./recur.ts";
import { nextName } from "./names.ts";
import type { FindingView } from "./briefparts.ts";

export type Accepted = Pick<FindingView, "id" | "span" | "invalidates" | "replacement">;

const inside = (span: string, text: string) => normalise(text).includes(normalise(span));
const ENDING_SECTIONS = new Set(["arithmetic", "custody"]);

/** Which pieces the accepted findings touch. */
export function repairPlan(accepted: Accepted[], vignette: string, ending: string): { vignette: boolean; ending: boolean } {
  return {
    vignette: accepted.some((f) => inside(f.span, vignette)),
    ending: accepted.some((f) => inside(f.span, ending) || ENDING_SECTIONS.has(f.invalidates.toLowerCase())),
  };
}

export const constraintsBlock = (accepted: Accepted[]) => fill("constraints", { constraints: accepted.map((f) => `- ${f.replacement}`).join("\n") });

/**
 * Create the repaired draw and write its brief. Returns the new draw. The
 * source is marked repaired and superseded; the caller runs the check.
 */
export async function repair(p: Pipeline, drawId: string, accepted: Accepted[]): Promise<DrawRow> {
  const parts = briefParts(p, drawId);
  const src = parts.draw;
  const newId = `${now().replace(/[-:TZ]/g, "").slice(0, 15)}-${randomBytes(2).toString("hex")}`;
  const name = nextName((p.db.query("SELECT name FROM draws WHERE name IS NOT NULL").all() as { name: string }[]).map((r) => r.name), src.seed_text);
  p.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, domains, sampling, status, gate_method, repaired_from, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`)
    .run(newId, name, src.setting, src.genre, src.mode, src.segment, src.seed_mode, src.seed_text, src.seed_theme_id, src.example_ids, src.domains, src.sampling, src.gate_method, drawId, now());
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
  const plan = repairPlan(accepted, parts.vignette, parts.ending);
  const constraints = constraintsBlock(accepted);
  const head = parts.examples.join("\n\n");
  const { setting, domains } = p.loadDrawSetting(parts.draw);
  const chosenMeta = JSON.parse(p.artifacts(parts.draw.id).find((a) => a.step_id === parts.chosenStepId && a.kind === "vignette")!.meta);

  // the chosen vignette: rewritten from itself, or carried over
  let vignette = parts.vignette;
  let vStep;
  if (plan.vignette) {
    const r = await p.invoke(newId, null, "repair-vignette", compose(head, fill("repairVignette", { vignette: parts.vignette, constraints }), p.settingFor("execute", setting, domains)), (t) => {
      const v = tag(t, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
    });
    vignette = r.value; vStep = r.step;
    p.artifact(vStep, "vignette", vignette, { ...chosenMeta, rewritten_from: parts.chosenStepId, warnings: words(vignette) < 300 || words(vignette) > 500 ? ["length"] : [] });
  } else {
    vStep = p.recordStep(newId, null, "repair-vignette", "copied");
    p.artifact(vStep, "vignette", vignette, { ...chosenMeta, copied_from: parts.chosenStepId });
  }
  p.db.query("UPDATE draws SET chosen_step = ? WHERE id = ?").run(vStep.id, newId);

  // the outline, re-derived under the constraints
  const settingJobs = (setting?.jobs ?? []).map((j) => fill("settingJob", { name: j.name, description: j.description })).join("");
  const jobNames = [...RUN.coreJobs, ...(setting?.jobs ?? []).map((j) => j.name.toLowerCase())];
  const outlineHead = fill("repairOutlineHead", { seed: parts.seed, premise: parts.premise, vignette, constraints });
  const { step: outlineStep, value: outline } = await p.invoke(newId, vStep.id, "repair-outline", compose(outlineHead, fill("outlineAsk", { settingJobs }), p.settingFor("outline", setting, domains)), (text) => {
    const secs = sections(text);
    for (const j of jobNames) if (!secs[j]) throw new Error(`missing <section name="${j}">`);
    return secs;
  });
  const outlineText = Object.entries(outline).map(([n, body]) => `## ${n}\n\n${body}`).join("\n\n");
  p.artifact(outlineStep, "outline", outlineText, { jobs: jobNames, constraints: accepted.map((f) => f.replacement), accepted: accepted.map((f) => f.id), words: Object.fromEntries(Object.entries(outline).map(([n, b]) => [n, words(b)])) });

  // jobs and the two context vignettes, as the draw does
  const briefHead = fill("head", { outline: outlineText, vignette });
  const after = (stage: "jobs" | "context" | "ending", ask: string) => compose(briefHead, ask, p.settingFor(stage, setting, domains), "");
  const { step: jobsStep, value: jobs } = await p.invoke(newId, outlineStep.id, "jobs", after("jobs", fill("jobs", {})), (text) => {
    const js = tags(text, "job");
    if (js.length !== RUN.contextVignettes) throw new Error(`expected ${RUN.contextVignettes} jobs, got ${js.length}`);
    if (new Set(js.map((j) => j.toLowerCase())).size !== js.length) throw new Error("identical jobs");
    return js;
  });
  jobs.forEach((j, i) => p.artifact(jobsStep, "job", j, { index: i + 1 }));
  const contextRuns = jobs.map((job, i) => p.invoke(newId, outlineStep.id, "context", after("context", fill("context", { job })), (text) => {
    const v = tag(text, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
  }).then((r) => p.artifact(r.step, "vignette", r.value, { index: i + 1, job, warnings: words(r.value) > 500 ? ["length"] : [] })));

  // the ending: rewritten from itself under the constraints, or carried over
  const endingRun = plan.ending
    ? p.invoke(newId, outlineStep.id, "repair-ending", compose(head, fill("repairEnding", { outline: outlineText, ending: parts.ending, constraints }), p.settingFor("ending", setting, domains)), (t) => {
        const e = tag(t, "ending"); if (!e) throw new Error("no <ending> tag"); return e;
      }).then((r) => p.artifact(r.step, "ending", r.value, { previous: parts.ending, warnings: words(r.value) > 650 ? ["length"] : [] }))
    : Promise.resolve(p.artifact(p.recordStep(newId, outlineStep.id, "repair-ending", "copied"), "ending", parts.ending, { copied: true }));
  await Promise.all([...contextRuns, endingRun]);

  const dir = writeBrief(p.db, newId, p.stages, p.briefsDir, p.settingsDir);
  p.artifact(outlineStep, "brief", dir, { repaired_from: parts.draw.id });
}
