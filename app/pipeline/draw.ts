/**
 * The generation draw:
 *
 *   draw → premises → execute ×5 → gate → outline (with the two jobs) → { context ×2, ending } → brief
 *
 * Every model step is a row in `steps` with its prompt, model, system prompt,
 * raw response and parsed output, recorded before the next step starts. The
 * gate is the one human point; in auto mode it takes the lowest stated
 * probability, never a judgement.
 */
import { randomBytes } from "node:crypto";
import { BANDS, DEFAULT_SAMPLING, RUN, isDarkness, isSampling, type Darkness, loadStages, resolveModels, type Sampling, type StageConfig, type StageName } from "./config.ts";
import { TEMPLATES, compose, fill } from "./prompts.ts";
import { need, sections, tag, tags, words, type ModelAdapter, type ModelResult } from "./model.ts";
import { eligiblePassages, eligibleThemes, type Segment } from "./bank.ts";
import { loadChecked, slice, type GenStage, type Setting } from "./settings.ts";
import { SETTINGS } from "./paths.ts";
import { now } from "./paths.ts";
import { pipelineVersion, treeVersion } from "./version.ts";
import { nextName } from "./names.ts";
import type { Db } from "./store/db.ts";
import { writeBrief } from "./brief.ts";
import { act, must } from "./lifecycle.ts";
import { Lineage } from "./lineage.ts";
import { lengthWarnings } from "./briefparts.ts";
import { ofKind, readArtifacts, writeArtifact, type Artifact, type Kind, type MetaByKind } from "./artifacts.ts";
import { chainOf } from "./chain.ts";

export type SeedChoice = { mode: "drawn" } | { mode: "picked"; themeId: string } | { mode: "typed"; text: string };
/** The seed and the segment a request names in flat fields, as the CLI and the API take them; unnamed, the draw draws them. */
export function seedAndSegment(f: { seed?: string; seedId?: string; source?: string; author?: string }): { seed?: SeedChoice; segment?: Segment } {
  const seed: SeedChoice | undefined = f.seed ? { mode: "typed", text: f.seed } : f.seedId ? { mode: "picked", themeId: f.seedId } : undefined;
  const sources = f.source ? f.source.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const segment = sources.length || f.author ? { source: sources.length ? sources : undefined, author: f.author || undefined } : undefined;
  return { seed, segment };
}

export type DrawOpts = {
  mode: "auto" | "manual";
  setting?: string;
  genre?: string;
  segment?: Segment;
  seed?: SeedChoice;
  sampling?: Sampling;   // where in the stated distribution the premises are asked for
  darkness?: Darkness;   // how much the story takes; unset asks for nothing
  shape?: "listen";      // the premises are asked for a story told aloud: a hook, an arrival, a cost, an aftermath
  models?: Record<string, string>;   // {stage or group: model}, over stages.toml, for this draw and the draws made from it
  seedRng?: () => number;
};

export type DrawRow = {
  id: string; name: string; setting: string | null; genre: string; mode: "auto" | "manual"; segment: string | null;
  seed_mode: string; seed_text: string; seed_theme_id: string | null; example_ids: string; sampling: string; darkness: string | null; status: string;
  gate_method: string | null; chosen_step: string | null; flagged: number; flag_note: string; error: string | null;
  superseded_by: string | null; repaired_from: string | null; forked_from: string | null; branched_from: string | null; branch_at: string | null;
  draft_config: string | null; models: string | null; archived_at: string | null; created_at: string; ended_at: string | null;
};
export type StepRow = {
  id: string; draw_id: string | null; parent_id: string | null; stage: string; model: string; system_prompt: string;
  prompt: string; raw_response: string | null; parsed: string | null; status: string; fail_reason: string | null;
  attempt: number; tools: string; usage: string | null; version: string; pid: number | null; started_at: string; ended_at: string | null; error: string | null;
};

export class StepFailure extends Error {
  constructor(public reason: "shape" | "refusal" | "error", message: string, public step: StepRow) {
    super(message);
  }
}

/** An error the API reports on its own side, as the CLI words it: `API Error: 529 Overloaded`, `API Error: 500 Internal server error`. */
const TRANSIENT = /API Error: (5\d\d|529)\b/;
const id = (n = 6) => randomBytes(n).toString("hex");
/** A draw id: the UTC second it was made, and four hex digits. */
export const newDrawId = () => `${now().replace(/[-:TZ]/g, "").slice(0, 15)}-${id(2)}`;

/** Parse an outline response, requiring every job's section. */
export const parseOutline = (jobNames: string[]) => (text: string) => {
  const secs = sections(text);
  for (const j of jobNames) if (!secs[j]) throw new Error(`missing <section name="${j}">`);
  return { sections: secs, jobs: parseJobs(text) };
};

/** An outline as stored: its text, and the words of each section. */
export function renderOutline(secs: Record<string, string>): { text: string; words: Record<string, number> } {
  return {
    text: Object.entries(secs).map(([n, body]) => `## ${n}\n\n${body}`).join("\n\n"),
    words: Object.fromEntries(Object.entries(secs).map(([n, b]) => [n, words(b)])),
  };
}

/** Parse a jobs response: exactly the context vignette count, all distinct. */
export function parseJobs(text: string): string[] {
  const js = tags(text, "job");
  if (js.length !== RUN.contextVignettes) throw new Error(`expected ${RUN.contextVignettes} jobs, got ${js.length}`);
  if (new Set(js.map((j) => j.toLowerCase())).size !== js.length) throw new Error("identical jobs");
  return js;
}
/** The darkness sentence as a template slot: empty when unset, so the prompt reads as it did before the knob. */
const darknessLine = (d?: Darkness) => (d ? ` ${TEMPLATES.darknessAsk[d]}` : "");

/**
 * What a call needs beyond its prompt: the story a theme is drafted from, the
 * tools it may use, and the text that leads its system prompt so a run of calls
 * reads it from the cache (ADR-0010).
 */
export type InvokeOpts = { storyId?: string | null; tools?: string; context?: string };

export class Pipeline {
  stages: Record<StageName, StageConfig>;
  backoffMs: readonly number[];
  cacheLeadMs: number;
  briefsDir: string | undefined;
  settingsDir: string;
  constructor(public db: Db, public model: ModelAdapter, opts: { stages?: Record<StageName, StageConfig>; rng?: () => number; briefsDir?: string; settingsDir?: string; backoffMs?: readonly number[]; cacheLeadMs?: number } = {}) {
    this.stages = opts.stages ?? loadStages();
    this.backoffMs = opts.backoffMs ?? RUN.errorBackoffMs;
    this.cacheLeadMs = opts.cacheLeadMs ?? RUN.cacheLeadMs;
    this.rng = opts.rng ?? Math.random;
    this.briefsDir = opts.briefsDir;
    this.settingsDir = opts.settingsDir ?? SETTINGS;
  }

  /** The setting's text for one stage, or undefined when unrestricted. */
  settingFor(stage: GenStage, setting?: Setting): { slice: string } | undefined {
    return setting ? { slice: slice(setting, stage) } : undefined;
  }

  /** The draw's setting, linted; an unrestricted draw has none. */
  loadDrawSetting(draw: { setting: string | null }): { setting?: Setting } {
    return draw.setting ? { setting: loadChecked(draw.setting, this.settingsDir) } : {};
  }
  rng: () => number;

  // --- steps -----------------------------------------------------------------

  private insertStep(draw: string | null, parent: string | null, stage: string, model: string, system: string, prompt: string, attempt: number, storyId: string | null = null, tools = ""): StepRow {
    const row: StepRow = {
      id: `${stage}-${id(4)}`, draw_id: draw, parent_id: parent, stage, model, system_prompt: system, prompt,
      raw_response: null, parsed: null, status: "running", fail_reason: null, attempt, tools, usage: null, version: treeVersion(), pid: process.pid, started_at: now(), ended_at: null, error: null,
    };
    this.db.query(`INSERT INTO steps (id, draw_id, story_id, parent_id, stage, model, system_prompt, prompt, status, attempt, tools, version, pid, started_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`)
      .run(row.id, draw, storyId, parent, stage, model, system, prompt, attempt, tools, row.version, row.pid, row.started_at);
    return row;
  }

  /**
   * A step that made no model call: a brief piece carried over by a repair, or
   * a deterministic screen. `model` names what stood in for the call.
   */
  recordStep(draw: string, parent: string | null, stage: StageName | "screen-slop" | "screen-restated" | "screen-listen", model: "copied" | "deterministic" | "patched", parsed: unknown = null): StepRow {
    const row = this.insertStep(draw, parent, stage, model, "", "", 1);
    this.finishStep(row, { status: "done", parsed: parsed === null ? null : JSON.stringify(parsed) });
    return row;
  }

  private finishStep(step: StepRow, patch: Partial<StepRow>) {
    Object.assign(step, patch, { ended_at: now() });
    this.db.query(`UPDATE steps SET raw_response = ?, parsed = ?, status = ?, fail_reason = ?, error = ?, model = ?, usage = ?, ended_at = ? WHERE id = ?`)
      .run(step.raw_response, step.parsed, step.status, step.fail_reason, step.error, step.model, step.usage, step.ended_at, step.id);
  }

  /**
   * One stage call with the spec's retry table. Returns the successful step and
   * its parsed value. `tools` overrides the stage's declared tool list; the
   * claims verifier passes "" under `claims: reference`. `context` goes ahead of
   * the stage's system line: text that stays the same across a run of calls.
   * The CLI caches the system prompt, and a later call whose system prompt
   * opens with the same text reads it back, whatever stage line follows.
   */
  async invoke<T>(draw: string | null, parent: string | null, stage: StageName, prompt: string, parse: (text: string) => T, opts: InvokeOpts = {}): Promise<{ step: StepRow; value: T }> {
    const { storyId = null, tools, context } = opts;
    const cfg = this.stageFor(stage, draw);
    const allowed = tools ?? cfg.tools ?? "";
    const system = context ? `${context}\n\n${cfg.system}` : cfg.system;
    const attempt = async (model: string, n: number): Promise<{ step: StepRow; value?: T; outcome: "ok" | "shape" | "refusal" | "error" }> => {
      const step = this.insertStep(draw, parent, stage, model, system, prompt, n, storyId, allowed);
      // a call that throws (no claude on PATH, a spawn that fails) is an error result, so the step does not stay running
      const r = await this.model.call(stage, system, prompt, model, allowed, cfg.effort)
        .catch((e: unknown): ModelResult => ({ text: "", stop: "error", raw: "", model, durationMs: 0, error: String((e as Error)?.message ?? e) }));
      step.raw_response = r.raw;
      step.model = r.model || model;
      step.usage = r.usage ? JSON.stringify(r.usage) : null;
      if (r.stop === "refusal") { this.finishStep(step, { status: "failed", fail_reason: "refusal", error: r.text.slice(0, 500) }); return { step, outcome: "refusal" }; }
      if (r.stop === "error" || r.error) { this.finishStep(step, { status: "failed", fail_reason: "error", error: r.error ?? r.text.slice(0, 500) }); return { step, outcome: "error" }; }
      try {
        const value = parse(r.text);
        this.finishStep(step, { status: "done", parsed: JSON.stringify(value) });
        return { step, value, outcome: "ok" };
      } catch (e: any) {
        this.finishStep(step, { status: "failed", fail_reason: "shape", error: String(e?.message ?? e) });
        return { step, outcome: "shape" };
      }
    };
    // an error the API reports on its own side is tried again after a wait; every attempt keeps its step row
    const tried = async (model: string, n: number) => {
      let r = await attempt(model, n);
      for (const ms of this.backoffMs) {
        if (r.outcome !== "error" || !TRANSIENT.test(r.step.error ?? "")) break;
        await Bun.sleep(ms);
        r = await attempt(model, n);
      }
      return r;
    };
    let r = await tried(cfg.model, 1);
    if (r.outcome === "shape") r = await tried(cfg.model, 2);
    if (r.outcome === "refusal") r = await tried(cfg.fallback, 2);
    if (r.outcome === "ok") return { step: r.step, value: r.value as T };
    throw new StepFailure(r.outcome, `${stage} failed: ${r.outcome}${r.step.error ? ` (${r.step.error.slice(0, 200)})` : ""}`, r.step);
  }

  artifact<K extends Kind>(step: StepRow, kind: K, content: string, meta: MetaByKind[K]): string {
    return writeArtifact(this.db, step.id, kind, content, meta);
  }

  // --- draw ------------------------------------------------------------------

  drawExamples(segment: Segment = {}): ReturnType<typeof eligiblePassages> {
    const pool = eligiblePassages(this.db, segment);
    if (pool.length < RUN.examples) throw new Error(`draw: only ${pool.length} eligible passages in segment ${JSON.stringify(segment)}; ${RUN.examples} needed`);
    const cells = new Map<string, typeof pool>();
    for (const p of pool) {
      const c = `${p.voice ?? "?"}/${p.mode ?? "?"}`;
      if (!cells.has(c)) cells.set(c, []);
      cells.get(c)!.push(p);
    }
    const order = this.shuffle([...cells.keys()]);
    const picked: typeof pool = [];
    for (const c of order) {
      if (picked.length === RUN.examples) break;
      picked.push(this.pick(cells.get(c)!));
    }
    const have = new Set(picked.map((p) => p.id));
    while (picked.length < RUN.examples) {
      const p = this.pick(pool);
      if (!have.has(p.id)) { picked.push(p); have.add(p.id); }
    }
    return picked;
  }

  drawSeed(choice: SeedChoice = { mode: "drawn" }, setting?: Setting): { mode: string; text: string; themeId: string | null } {
    if (choice.mode === "typed") return { mode: "typed", text: choice.text.trim(), themeId: null };
    if (choice.mode === "picked") {
      const t = this.db.query("SELECT id, text FROM themes WHERE id = ?").get(choice.themeId) as any;
      if (!t) throw new Error(`seed: no theme ${choice.themeId}`);
      return { mode: "picked", text: t.text, themeId: t.id };
    }
    let themes = eligibleThemes(this.db);
    if (setting?.seedSegments.length) {
      const segs = setting.seedSegments;
      themes = themes.filter((t) => (JSON.parse(t.stories) as string[]).some((s) => segs.some((g) => s.startsWith(g + "/"))));
    }
    if (!themes.length) throw new Error("seed: no eligible themes to draw from; run `cloudchamber themes` or pass --seed");
    const t = this.pick(themes);
    return { mode: "drawn", text: t.text, themeId: t.id };
  }

  /** The name a new draw takes, free of every name already written. */
  nameFor(seed: string): string {
    const rows = this.db.query("SELECT name FROM draws WHERE name IS NOT NULL").all() as { name: string }[];
    return nextName(rows.map((r) => r.name), seed);
  }

  private pick<T>(xs: T[]): T { return xs[Math.floor(this.rng() * xs.length)]; }
  private shuffle<T>(xs: T[]): T[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /** The genre asked for, or, with none asked for, the one most of the drawn examples carry. */
  private inferGenre(opts: DrawOpts, examples: { genre: string }[]): string {
    if (opts.genre) return opts.genre;
    if (opts.segment?.genre) return opts.segment.genre;
    const counts = new Map<string, number>();
    for (const e of examples) counts.set(e.genre, (counts.get(e.genre) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  // --- the draw ---------------------------------------------------------------

  /** `drawId` is chosen by a caller that must answer with it before the draw finishes. */
  async start(opts: DrawOpts, drawId: string = newDrawId()): Promise<DrawRow> {
    const sampling = opts.sampling ?? DEFAULT_SAMPLING;
    if (!isSampling(sampling)) throw new Error(`draw: sampling ${sampling} is not tail | off-centre | standard`);
    if (opts.darkness && !isDarkness(opts.darkness)) throw new Error(`draw: darkness ${opts.darkness} is not light | grey | dark | black`);
    if (opts.shape && opts.shape !== "listen") throw new Error(`draw: shape ${opts.shape} is not listen`);
    const setting = opts.setting ? loadChecked(opts.setting, this.settingsDir) : undefined;
    const examples = this.drawExamples(opts.segment);
    const seed = this.drawSeed(opts.seed, setting);
    const genre = this.inferGenre(opts, examples);
    const models = opts.models && Object.keys(opts.models).length ? JSON.stringify(resolveModels(opts.models)) : null;
    this.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, sampling, darkness, models, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`)
      .run(drawId, this.nameFor(seed.text), setting?.id ?? null, genre, opts.mode, opts.segment ? JSON.stringify(opts.segment) : null,
        seed.mode, seed.text, seed.themeId, JSON.stringify(examples.map((e) => e.id)), sampling, opts.darkness ?? null, models, now());
    await act(this.db, { id: drawId, during: "running", back: "failed" },
      () => this.premisesAndExecute(drawId, examples.map((e) => e.text), seed.text, genre, sampling, opts.darkness, setting, opts.shape, opts.mode === "auto"),
      () => ({ id: drawId, status: "awaiting_gate" }));
    const draw = this.draw(drawId);
    if (draw.mode === "auto") return this.autoGate(drawId);
    return draw;
  }

  /**
   * The premises, then their executes. An auto draw executes only the premise
   * its gate will take, the lowest stated probability: the rule reads the
   * probability, which the premises step states, and never a vignette, so the
   * other four executes were paid for and never read.
   */
  private async premisesAndExecute(drawId: string, examples: string[], seed: string, genre: string, sampling: Sampling, darkness: Darkness | undefined, setting?: Setting, shape?: "listen", auto = false) {
    const band = BANDS[sampling];
    const dark = darknessLine(darkness);
    // the shape is not a column: the premises step stores its prompt, which is where a shaped draw shows it
    const ask = fill("premisesAsk", { genre, seed, sampling: TEMPLATES.samplingAsk[sampling], darkness: dark, shape: shape === "listen" ? " " + fill("premisesShape", {}) : "" });
    const head = examples.join("\n\n");
    const prompt = compose(head, ask, this.settingFor("premises", setting));
    const { step, value: premises } = await this.invoke(drawId, null, "premises", prompt, (text) => {
      const ps = tags(text, "premise").map((p) => ({ text: tag(p, "text"), probability: Number(tag(p, "probability")) }));
      if (ps.length !== RUN.k) throw new Error(`expected ${RUN.k} premises, got ${ps.length}`);
      for (const p of ps) {
        if (!p.text) throw new Error("premise without <text>");
        if (!Number.isFinite(p.probability)) throw new Error("premise without a numeric <probability>");
        if (p.probability < band.floor || p.probability >= band.ceiling) throw new Error(`probability ${p.probability} is outside the ${sampling} band ${band.floor}–${band.ceiling}`);
      }
      return ps as { text: string; probability: number }[];
    });
    // Number the premises from the tail: #1 is the lowest stated probability. Ties keep the model's order.
    premises.sort((a, b) => a.probability - b.probability);
    premises.forEach((p, i) => this.artifact(step, "premise", p.text, { index: i + 1, probability: p.probability, warnings: words(p.text) > RUN.premiseWarnWords ? ["length"] : [] }));
    const numbered = premises.map((p, i) => ({ ...p, index: i + 1 }));
    await this.executeAll(drawId, step.id, auto ? [this.lowest(numbered)] : numbered, head, seed, dark, setting);
  }

  /** The candidate the auto gate takes: the lowest stated probability, a tie broken by the draw's own random pick. */
  private lowest<T extends { probability: number }>(xs: T[]): T {
    const lo = Math.min(...xs.map((x) => x.probability));
    return this.pick(xs.filter((x) => x.probability === lo));
  }

  /** One execute call per premise, each stored as a vignette under the premises step. */
  private executeAll(drawId: string, premisesStep: string, premises: { index: number; text: string; probability: number }[], head: string, seed: string, dark: string, setting?: Setting) {
    return Promise.all(premises.map((p) => {
      const ask = fill("executeAsk", { seed, premise: p.text, darkness: dark });
      return this.invoke(drawId, premisesStep, "execute", compose(head, ask, this.settingFor("execute", setting)), (text) => need(text, "vignette")).then((r) => this.artifact(r.step, "vignette", r.value, {
        index: p.index, probability: p.probability, premise: p.text,
        warnings: lengthWarnings("vignette", r.value),
      }));
    }));
  }

  /**
   * Carry a draw on from where it stopped, reusing every call that finished. A
   * draw that failed before the gate keeps its examples, seed and premises, and
   * runs only the executes that have no vignette; one that failed before its
   * premises runs them again from the same examples and seed. An auto draw left
   * at the gate, where a failed outline puts it, takes its candidate again.
   */
  async resume(drawId: string): Promise<DrawRow> {
    const draw = this.draw(drawId);
    if (draw.status === "awaiting_gate" && draw.mode === "auto") return this.autoGate(drawId);
    if (draw.status !== "failed") throw new Error(`draw ${drawId} is ${draw.status}; only a failed draw, or an auto draw at the gate, resumes`);
    const steps = this.steps(drawId).filter((s) => s.stage === "premises");
    const setting = draw.setting ? loadChecked(draw.setting, this.settingsDir) : undefined;
    const ids = JSON.parse(draw.example_ids) as string[];
    const texts = new Map((this.db.query(`SELECT id, text FROM passages WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as { id: string; text: string }[]).map((r) => [r.id, r.text]));
    const examples = ids.map((id) => texts.get(id)!);
    const dark = darknessLine((draw.darkness ?? undefined) as Darkness | undefined);
    const done = steps.find((s) => s.status === "done");
    await act(this.db, { id: drawId, during: "running", back: "failed" }, async () => {
      if (!done) {
        // the shape is not a column; a premises step that ran under it carries it in its prompt
        const shaped = steps.some((s) => s.prompt.includes(fill("premisesShape", {})));
        return this.premisesAndExecute(drawId, examples, draw.seed_text, draw.genre, draw.sampling as Sampling, (draw.darkness ?? undefined) as Darkness | undefined, setting, shaped ? "listen" : undefined, draw.mode === "auto");
      }
      const arts = this.artifacts(drawId);
      const have = new Set(ofKind(arts, "vignette").filter((a) => a.stage === "execute").map((a) => a.meta.index));
      const all = ofKind(arts, "premise").filter((a) => a.step_id === done.id)
        .map((a) => ({ index: a.meta.index, probability: a.meta.probability, text: a.content }));
      // an auto draw needs one vignette, the gate's pick; a manual one needs all five
      const missing = draw.mode === "auto" ? (have.size ? [] : [this.lowest(all)]) : all.filter((p) => !have.has(p.index));
      await this.executeAll(drawId, done.id, missing, examples.join("\n\n"), draw.seed_text, dark, setting);
    }, () => ({ id: drawId, status: "awaiting_gate" }));
    return draw.mode === "auto" ? this.autoGate(drawId) : this.draw(drawId);
  }

  /** The five executed candidates, sorted by stated probability ascending. */
  candidates(drawId: string): { step_id: string; index: number; probability: number; premise: string; vignette: string; warnings: string[] }[] {
    const rows = ofKind(this.artifacts(drawId), "vignette").filter((a) => a.stage === "execute");
    // Numbered from the tail on read too, so draws recorded before this numbering read the same way.
    return rows.map((a) => ({ step_id: a.step_id, index: a.meta.index!, probability: a.meta.probability!, premise: a.meta.premise!, vignette: a.content, warnings: a.meta.warnings ?? [] }))
      .sort((a, b) => a.probability - b.probability || a.index - b.index)
      .map((c, i) => ({ ...c, index: i + 1 }));
  }

  private async autoGate(drawId: string): Promise<DrawRow> {
    const cs = this.candidates(drawId);
    const lo = cs[0].probability;
    const ties = cs.filter((c) => c.probability === lo);
    const chosen = this.pick(ties);
    return this.choose(drawId, chosen.step_id, "auto");
  }

  // --- gate actions ----------------------------------------------------------

  /** `method` is how the candidate was chosen; a draw already chosen once keeps its first method unless the gate is auto. */
  async choose(drawId: string, executeStepId: string, method?: "auto"): Promise<DrawRow> {
    const draw = this.draw(drawId);
    must(draw, "choose");
    const c = this.candidates(drawId).find((c) => c.step_id === executeStepId);
    if (!c) throw new Error(`draw ${drawId}: no execute step ${executeStepId}`);
    // a failed development leaves the draw at the gate, where a candidate can be chosen again
    await act(this.db,
      { id: drawId, during: "running", back: "awaiting_gate", set: { chosen_step: executeStepId, gate_method: method ?? draw.gate_method ?? "manual" }, undo: { chosen_step: null } },
      () => this.develop(drawId, c),
      () => ({ id: drawId, status: "done", ended: true }));
    return this.draw(drawId);
  }

  /**
   * The options a draw was made with, for starting another like it. The seed
   * comes back as the theme it was drawn from where there was one, so a redraw
   * of a drawn seed is still recorded as drawn.
   */
  like(drawId: string): DrawOpts {
    const draw = this.draw(drawId);
    return {
      mode: draw.mode, setting: draw.setting ?? undefined, genre: draw.genre, sampling: draw.sampling as Sampling,
      darkness: (draw.darkness ?? undefined) as Darkness | undefined,
      segment: draw.segment ? JSON.parse(draw.segment) : undefined,
      seed: draw.seed_theme_id ? { mode: "picked", themeId: draw.seed_theme_id } : { mode: "typed", text: draw.seed_text },
      ...(draw.models ? { models: JSON.parse(draw.models) } : {}),
    };
  }

  /** The draw's stage models: stages.toml under its own overrides. */
  modelsOf(drawId: string | null): Record<string, string> {
    if (!drawId) return {};
    const row = this.db.query("SELECT models FROM draws WHERE id = ?").get(drawId) as { models: string | null } | null;
    return row?.models ? JSON.parse(row.models) : {};
  }
  stageFor(stage: StageName, drawId: string | null): StageConfig {
    const base = this.stages[stage];
    const m = this.modelsOf(drawId)[stage];
    return m ? { ...base, model: m } : base;
  }
  /** Set or change a draw's stage models before an action; a group or a stage, merged over what it has. */
  setModels(drawId: string, models: Record<string, string>): Record<string, string> {
    const merged = { ...this.modelsOf(drawId), ...resolveModels(models) };
    this.db.query("UPDATE draws SET models = ? WHERE id = ?").run(Object.keys(merged).length ? JSON.stringify(merged) : null, drawId);
    return merged;
  }

  /**
   * Remove a draw and everything recorded under it. Only for draws that never
   * became a brief: one that did is part of the record on disk and is archived
   * instead. A draw another draw points at is refused, so no link is orphaned.
   */
  delete(drawId: string): void {
    must({ ...this.draw(drawId), referenced_by: this.referencedBy(drawId) }, "delete");
    this.db.query("DELETE FROM artifacts WHERE step_id IN (SELECT id FROM steps WHERE draw_id = ?)").run(drawId);
    this.db.query("DELETE FROM steps WHERE draw_id = ?").run(drawId);
    this.db.query("DELETE FROM draws WHERE id = ?").run(drawId);
  }

  /**
   * Develop a second candidate of a draw that already chose one. The fork is a
   * draw of its own — the same seed, examples and setting — carrying
   * the candidate's premise and vignette across as a copied step, so every
   * later stage reads it the way it reads any other draw.
   */
  /** A draw made from another, `running`: the same seed, examples and options, linked to its source by the columns `link` names. */
  copyDraw(src: DrawRow, newId: string, link: { repaired_from: string } | { forked_from: string } | { branched_from: string; branch_at: string }, gateMethod: string | null): void {
    const cols = Object.keys(link), vals = Object.values(link);
    this.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, sampling, darkness, models, status, gate_method, ${cols.join(", ")}, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ${cols.map(() => "?").join(", ")}, ?)`)
      .run(newId, this.nameFor(src.seed_text), src.setting, src.genre, src.mode, src.segment, src.seed_mode, src.seed_text, src.seed_theme_id, src.example_ids, src.sampling, src.darkness, src.models, gateMethod, ...vals, now());
  }

  async fork(drawId: string, executeStepId: string, newId: string = newDrawId()): Promise<DrawRow> {
    const src = this.draw(drawId);
    must(src, "fork");
    if (executeStepId === src.chosen_step) throw new Error(`draw ${drawId} was itself developed from that candidate`);
    const c = this.candidates(drawId).find((x) => x.step_id === executeStepId);
    if (!c) throw new Error(`draw ${drawId}: no execute step ${executeStepId}`);
    const already = this.forks(drawId).find((f) => f.step_id === executeStepId);
    if (already) throw new Error(`draw ${drawId}: candidate #${c.index} is already developed as ${already.id}`);
    this.copyDraw(src, newId, { forked_from: drawId }, "manual");
    const step = this.recordStep(newId, null, "execute", "copied", c.premise);
    this.artifact(step, "vignette", c.vignette, { index: c.index, probability: c.probability, premise: c.premise, warnings: c.warnings, forked_from: executeStepId });
    await act(this.db, { id: newId, during: "running", back: "failed", set: { chosen_step: step.id } },
      () => this.develop(newId, { step_id: step.id, premise: c.premise, vignette: c.vignette }),
      () => ({ id: newId, status: "done", ended: true }));
    return this.draw(newId);
  }

  /** The draws forked off this one, each with the execute step of the candidate it develops. */
  forks(drawId: string): { id: string; status: string; step_id: string; index: number }[] {
    const forks = this.db.query("SELECT id, status FROM draws WHERE forked_from = ? ORDER BY created_at").all(drawId) as { id: string; status: string }[];
    return forks.flatMap((d) => ofKind(this.artifacts(d.id), "vignette").filter((a) => a.stage === "execute")
      .map((a) => ({ id: d.id, status: d.status, step_id: a.meta.forked_from!, index: a.meta.index! })));
  }

  /** Hide a draw from the lists, or put it back. Nothing else about it changes, and it stays reachable by id. */
  /**
   * Archive a draw and every round of the repair chain behind it, so the list
   * never shows part of a chain; a draw with no repairs is a chain of one. A
   * round that was also repaired into a draw outside this chain belongs to that
   * chain too, and stays as it is. Unarchive is the same walk back.
   */
  archive(drawId: string, archived = true): DrawRow {
    const lineage = Lineage.all(this.db);
    const ids = lineage.chain(drawId);
    // a round another chain also grew from stays in the list while that chain does
    const shared = (id: string) => lineage.repairs(id).some((r) => !ids.includes(r));
    for (const id of ids) {
      if (id !== drawId && shared(id)) continue;
      this.db.query("UPDATE draws SET archived_at = ? WHERE id = ?").run(archived ? now() : null, id);
    }
    return this.draw(drawId);
  }

  flag(drawId: string, note: string): DrawRow {
    this.db.query("UPDATE draws SET flagged = 1, flag_note = ? WHERE id = ?").run(note, drawId);
    return this.draw(drawId);
  }

  // --- development -----------------------------------------------------------

  private async develop(drawId: string, c: { step_id: string; premise: string; vignette: string }) {
    const draw = this.draw(drawId);
    const { setting } = this.loadDrawSetting(draw);
    const jobNames = [...RUN.coreJobs];
    const outlineHead = fill("outlineHead", { seed: draw.seed_text, premise: c.premise, vignette: c.vignette });
    const { step: outlineStep, value: outline } = await this.invoke(drawId, c.step_id, "outline",
      compose(outlineHead, fill("outlineAsk", {}), this.settingFor("outline", setting)), parseOutline(jobNames));
    const { text: outlineText, words: outlineWords } = renderOutline(outline.sections);
    this.artifact(outlineStep, "outline", outlineText, { jobs: jobNames, words: outlineWords });
    const head = fill("head", { outline: outlineText, vignette: c.vignette });
    const after = (stage: GenStage, ask: string) => compose(head, ask, this.settingFor(stage, setting), "");
    // the outline names the jobs in the same reply: a context reads them off the sections it was written with
    const jobs = outline.jobs;
    jobs.forEach((j, i) => this.artifact(outlineStep, "job", j, { index: i + 1 }));
    await Promise.all([
      ...jobs.map((job, i) => this.invoke(drawId, outlineStep.id, "context", after("context", fill("context", { job })), (text) => need(text, "vignette")).then((r) => this.artifact(r.step, "vignette", r.value, { index: i + 1, job, warnings: lengthWarnings("context", r.value) }))),
      this.invoke(drawId, outlineStep.id, "ending", after("ending", fill("ending", { darkness: darknessLine((draw.darkness ?? undefined) as Darkness | undefined) })), (text) => need(text, "ending")).then((r) => this.artifact(r.step, "ending", r.value, { warnings: lengthWarnings("ending", r.value) })),
    ]);
    const dir = writeBrief(this.db, drawId, this.briefsDir);
    this.artifact(outlineStep, "brief", dir, {});
  }

  // --- reads -----------------------------------------------------------------

  draw(drawId: string): DrawRow {
    const r = this.db.query("SELECT * FROM draws WHERE id = ?").get(drawId) as DrawRow | null;
    if (!r) throw new Error(`no draw ${drawId}`);
    return r;
  }
  // created_at is second-resolution, so two draws started in one second need the insertion order to break the tie
  /** The draws that point at this one: its repair, its fork, what superseded it. */
  referencedBy(drawId: string): string[] { return Lineage.all(this.db).referencedBy(drawId); }
  draws(archived = false): DrawRow[] {
    return this.db.query(`SELECT * FROM draws ${archived ? "" : "WHERE archived_at IS NULL "}ORDER BY created_at DESC, rowid DESC`).all() as DrawRow[];
  }
  steps(drawId: string): StepRow[] { return this.db.query("SELECT * FROM steps WHERE draw_id = ? ORDER BY started_at, rowid").all(drawId) as StepRow[]; }
  /** Every artifact of a draw, oldest first, its meta parsed once. */
  artifacts(drawId: string): Artifact[] { return readArtifacts(this.db, { draw: drawId }); }
}

export { pipelineVersion };
