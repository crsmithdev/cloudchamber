/**
 * The generation draw:
 *
 *   draw → premises → execute ×5 → gate → outline → jobs → { context ×2, ending } → brief
 *
 * Every model step is a row in `steps` with its prompt, model, system prompt,
 * raw response and parsed output, recorded before the next step starts. The
 * gate is the one human point; in auto mode it takes the lowest stated
 * probability, never a judgement.
 */
import { randomBytes } from "node:crypto";
import { BANDS, DEFAULT_SAMPLING, RUN, isSampling, loadStages, type Sampling, type StageConfig, type StageName } from "./config.ts";
import { TEMPLATES, compose, fill } from "./prompts.ts";
import { sections, tag, tags, words, type ModelAdapter } from "./model.ts";
import { eligiblePassages, eligibleThemes, type Segment } from "./bank.ts";
import { hardRules, loadChecked, pickDomains, slice, type Domain, type GenStage, type Setting } from "./settings.ts";
import { SETTINGS } from "./paths.ts";
import { now } from "./paths.ts";
import { pipelineVersion } from "./version.ts";
import { nextName } from "./names.ts";
import type { Db } from "./store/db.ts";
import { writeBrief } from "./brief.ts";

export type SeedChoice = { mode: "drawn" } | { mode: "picked"; themeId: string } | { mode: "typed"; text: string };
export type DrawOpts = {
  mode: "auto" | "manual";
  setting?: string;
  genre?: string;
  segment?: Segment;
  seed?: SeedChoice;
  sampling?: Sampling;   // where in the stated distribution the premises are asked for
  seedRng?: () => number;
  domains?: string[];    // pin the setting's domains by slug; drawn by rng when absent
};

export type DrawRow = {
  id: string; name: string; setting: string | null; genre: string; mode: "auto" | "manual"; segment: string | null;
  seed_mode: string; seed_text: string; seed_theme_id: string | null; example_ids: string; domains: string | null; sampling: string; status: string;
  gate_method: string | null; chosen_step: string | null; flagged: number; flag_note: string;
  superseded_by: string | null; repaired_from: string | null; forked_from: string | null; draft_config: string | null; archived_at: string | null; created_at: string; ended_at: string | null;
};
export type StepRow = {
  id: string; draw_id: string | null; parent_id: string | null; stage: string; model: string; system_prompt: string;
  prompt: string; raw_response: string | null; parsed: string | null; status: string; fail_reason: string | null;
  attempt: number; tools: string; started_at: string; ended_at: string | null; error: string | null;
};

export class StepFailure extends Error {
  constructor(public reason: "shape" | "refusal" | "error", message: string, public step: StepRow) {
    super(message);
  }
}

const id = (n = 6) => randomBytes(n).toString("hex");

export class Pipeline {
  stages: Record<StageName, StageConfig>;
  briefsDir: string | undefined;
  settingsDir: string;
  constructor(public db: Db, public model: ModelAdapter, opts: { stages?: Record<StageName, StageConfig>; rng?: () => number; briefsDir?: string; settingsDir?: string } = {}) {
    this.stages = opts.stages ?? loadStages();
    this.rng = opts.rng ?? Math.random;
    this.briefsDir = opts.briefsDir;
    this.settingsDir = opts.settingsDir ?? SETTINGS;
  }

  /** The setting's text for one stage, or undefined when unrestricted. */
  settingFor(stage: GenStage, setting?: Setting, domains: Domain[] = []): { slice: string; hardRules: string } | undefined {
    return setting ? { slice: slice(setting, domains, stage), hardRules: hardRules(setting) } : undefined;
  }

  /** The draw's setting and pinned domains, linted; unrestricted draws get no setting and no domains. */
  loadDrawSetting(draw: { setting: string | null; domains: string | null }): { setting?: Setting; domains: Domain[] } {
    if (!draw.setting) return { domains: [] };
    const setting = loadChecked(draw.setting, this.settingsDir);
    return { setting, domains: pickDomains(setting, this.rng, JSON.parse(draw.domains ?? "[]")) };
  }
  rng: () => number;

  // --- steps -----------------------------------------------------------------

  private insertStep(draw: string | null, parent: string | null, stage: string, model: string, system: string, prompt: string, attempt: number, storyId: string | null = null, tools = ""): StepRow {
    const row: StepRow = {
      id: `${stage}-${id(4)}`, draw_id: draw, parent_id: parent, stage, model, system_prompt: system, prompt,
      raw_response: null, parsed: null, status: "running", fail_reason: null, attempt, tools, started_at: now(), ended_at: null, error: null,
    };
    this.db.query(`INSERT INTO steps (id, draw_id, story_id, parent_id, stage, model, system_prompt, prompt, status, attempt, tools, started_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`)
      .run(row.id, draw, storyId, parent, stage, model, system, prompt, attempt, tools, row.started_at);
    return row;
  }

  /**
   * A step that made no model call: a brief piece carried over by a repair, or
   * a deterministic screen. `model` names what stood in for the call.
   */
  recordStep(draw: string, parent: string | null, stage: StageName | "screen-slop", model: "copied" | "deterministic", parsed: unknown = null): StepRow {
    const row = this.insertStep(draw, parent, stage, model, "", "", 1);
    this.finishStep(row, { status: "done", parsed: parsed === null ? null : JSON.stringify(parsed) });
    return row;
  }

  private finishStep(step: StepRow, patch: Partial<StepRow>) {
    Object.assign(step, patch, { ended_at: now() });
    this.db.query(`UPDATE steps SET raw_response = ?, parsed = ?, status = ?, fail_reason = ?, error = ?, model = ?, ended_at = ? WHERE id = ?`)
      .run(step.raw_response, step.parsed, step.status, step.fail_reason, step.error, step.model, step.ended_at, step.id);
  }

  /**
   * One stage call with the spec's retry table. Returns the successful step and
   * its parsed value. `tools` overrides the stage's declared tool list; the
   * claims verifier passes "" under `claims: reference`.
   */
  async invoke<T>(draw: string | null, parent: string | null, stage: StageName, prompt: string, parse: (text: string) => T, storyId: string | null = null, tools?: string): Promise<{ step: StepRow; value: T }> {
    const cfg = this.stages[stage];
    const allowed = tools ?? cfg.tools ?? "";
    const attempt = async (model: string, n: number): Promise<{ step: StepRow; value?: T; outcome: "ok" | "shape" | "refusal" | "error" }> => {
      const step = this.insertStep(draw, parent, stage, model, cfg.system, prompt, n, storyId, allowed);
      const r = await this.model.call(stage, cfg.system, prompt, model, allowed);
      step.raw_response = r.raw;
      step.model = r.model || model;
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
    let r = await attempt(cfg.model, 1);
    if (r.outcome === "shape") r = await attempt(cfg.model, 2);
    if (r.outcome === "refusal") r = await attempt(cfg.fallback, 2);
    if (r.outcome === "ok") return { step: r.step, value: r.value as T };
    throw new StepFailure(r.outcome, `${stage} failed: ${r.outcome}${r.step.error ? ` (${r.step.error.slice(0, 200)})` : ""}`, r.step);
  }

  artifact(step: StepRow, kind: string, content: string, meta: Record<string, unknown> = {}): string {
    const aid = `${kind}-${id(4)}`;
    this.db.query("INSERT INTO artifacts (id, step_id, kind, content, meta) VALUES (?, ?, ?, ?, ?)").run(aid, step.id, kind, content, JSON.stringify(meta));
    return aid;
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
    if (!themes.length) throw new Error("seed: no eligible themes to draw from; run `fogbelt themes` or pass --seed");
    const t = this.pick(themes);
    return { mode: "drawn", text: t.text, themeId: t.id };
  }

  /** The name a new draw takes, free of every name already written. */
  private nameFor(seed: string): string {
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

  async start(opts: DrawOpts): Promise<DrawRow> {
    if (opts.domains?.length && !opts.setting) throw new Error("draw: --domains needs --setting");
    const sampling = opts.sampling ?? DEFAULT_SAMPLING;
    if (!isSampling(sampling)) throw new Error(`draw: sampling ${sampling} is not tail | off-centre | standard`);
    const setting = opts.setting ? loadChecked(opts.setting, this.settingsDir) : undefined;
    const domains = setting ? pickDomains(setting, this.rng, opts.domains) : [];
    const examples = this.drawExamples(opts.segment);
    const seed = this.drawSeed(opts.seed, setting);
    const genre = this.inferGenre(opts, examples);
    const drawId = `${now().replace(/[-:TZ]/g, "").slice(0, 15)}-${id(2)}`;
    this.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, domains, sampling, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`)
      .run(drawId, this.nameFor(seed.text), setting?.id ?? null, genre, opts.mode, opts.segment ? JSON.stringify(opts.segment) : null,
        seed.mode, seed.text, seed.themeId, JSON.stringify(examples.map((e) => e.id)), setting ? JSON.stringify(domains.map((d) => d.slug)) : null, sampling, now());
    try {
      await this.premisesAndExecute(drawId, examples.map((e) => e.text), seed.text, genre, sampling, setting, domains);
    } catch (e) {
      this.fail(drawId, e);
      throw e;
    }
    const draw = this.draw(drawId);
    if (draw.mode === "auto") return this.autoGate(drawId);
    return draw;
  }

  private async premisesAndExecute(drawId: string, examples: string[], seed: string, genre: string, sampling: Sampling, setting?: Setting, domains: Domain[] = []) {
    const band = BANDS[sampling];
    const ask = fill("premisesAsk", { genre, seed, sampling: TEMPLATES.samplingAsk[sampling] });
    const head = examples.join("\n\n");
    const prompt = compose(head, ask, this.settingFor("premises", setting, domains));
    const { step, value: premises } = await this.invoke(drawId, null, "premises", prompt, (text) => {
      const ps = tags(text, "premise").map((p) => ({ text: tag(p, "text"), probability: Number(tag(p, "probability")) }));
      if (ps.length !== RUN.k) throw new Error(`expected ${RUN.k} premises, got ${ps.length}`);
      for (const p of ps) {
        if (!p.text) throw new Error("premise without <text>");
        if (!Number.isFinite(p.probability)) throw new Error("premise without a numeric <probability>");
        if (p.probability < band.floor || p.probability >= band.ceiling) throw new Error(`probability ${p.probability} is outside the ${sampling} band ${band.floor}–${band.ceiling}`);
      }
      return ps as { text: string; probability: number }[];
    }).catch((e) => {
      if (e instanceof StepFailure && e.reason === "shape") this.db.query("UPDATE draws SET flagged = 1, flag_note = ? WHERE id = ?").run(`premise call failed shape: ${e.message}`, drawId);
      throw e;
    });
    // Number the premises from the tail: #1 is the lowest stated probability. Ties keep the model's order.
    premises.sort((a, b) => a.probability - b.probability);
    premises.forEach((p, i) => this.artifact(step, "premise", p.text, { index: i + 1, probability: p.probability, warnings: words(p.text) > 120 ? ["length"] : [] }));
    await Promise.all(premises.map((p, i) => {
      const ask = fill("executeAsk", { seed, premise: p.text });
      return this.invoke(drawId, step.id, "execute", compose(head, ask, this.settingFor("execute", setting, domains)), (text) => {
        const v = tag(text, "vignette");
        if (!v) throw new Error("no <vignette> tag");
        return v;
      }).then((r) => this.artifact(r.step, "vignette", r.value, {
        index: i + 1, probability: p.probability, premise: p.text,
        warnings: words(r.value) < 300 || words(r.value) > 500 ? ["length"] : [],
      }));
    }));
    this.db.query("UPDATE draws SET status = 'awaiting_gate' WHERE id = ?").run(drawId);
  }

  /** The five executed candidates, sorted by stated probability ascending. */
  candidates(drawId: string): { step_id: string; index: number; probability: number; premise: string; vignette: string; warnings: string[] }[] {
    const rows = this.db.query(`SELECT a.step_id, a.content, a.meta FROM artifacts a JOIN steps s ON s.id = a.step_id
                                WHERE s.draw_id = ? AND a.kind = 'vignette' AND s.stage = 'execute'`).all(drawId) as any[];
    // Numbered from the tail on read too, so draws recorded before this numbering read the same way.
    return rows.map((r) => { const m = JSON.parse(r.meta); return { step_id: r.step_id, index: m.index as number, probability: m.probability, premise: m.premise, vignette: r.content, warnings: m.warnings ?? [] }; })
      .sort((a, b) => a.probability - b.probability || a.index - b.index)
      .map((c, i) => ({ ...c, index: i + 1 }));
  }

  private async autoGate(drawId: string): Promise<DrawRow> {
    const cs = this.candidates(drawId);
    const lo = cs[0].probability;
    const ties = cs.filter((c) => c.probability === lo);
    const chosen = this.pick(ties);
    this.db.query("UPDATE draws SET gate_method = 'auto' WHERE id = ?").run(drawId);
    return this.choose(drawId, chosen.step_id);
  }

  // --- gate actions ----------------------------------------------------------

  async choose(drawId: string, executeStepId: string): Promise<DrawRow> {
    const draw = this.draw(drawId);
    if (draw.status !== "awaiting_gate") throw new Error(`draw ${drawId} is ${draw.status}, not awaiting_gate`);
    const c = this.candidates(drawId).find((c) => c.step_id === executeStepId);
    if (!c) throw new Error(`draw ${drawId}: no execute step ${executeStepId}`);
    this.db.query("UPDATE draws SET status = 'running', chosen_step = ?, gate_method = coalesce(gate_method, 'manual') WHERE id = ?").run(executeStepId, drawId);
    try {
      await this.develop(drawId, c);
    } catch (e) {
      this.fail(drawId, e);
      throw e;
    }
    return this.draw(drawId);
  }

  async reject(drawId: string, how: "redraw" | "keep-seed", note = ""): Promise<DrawRow> {
    const draw = this.draw(drawId);
    if (draw.status !== "awaiting_gate") throw new Error(`draw ${drawId} is ${draw.status}, not awaiting_gate`);
    const opts: DrawOpts = {
      mode: draw.mode, setting: draw.setting ?? undefined, genre: draw.genre, sampling: draw.sampling as Sampling,
      segment: draw.segment ? JSON.parse(draw.segment) : undefined,
      seed: how === "keep-seed"
        ? (draw.seed_theme_id ? { mode: "picked", themeId: draw.seed_theme_id } : { mode: "typed", text: draw.seed_text })
        : { mode: "drawn" },
    };
    this.db.query("UPDATE draws SET status = 'rejected', flag_note = ?, ended_at = ? WHERE id = ?").run(note, now(), drawId);
    const next = await this.start({ ...opts, mode: "manual" });
    this.db.query("UPDATE draws SET superseded_by = ? WHERE id = ?").run(next.id, drawId);
    if (how === "keep-seed") this.db.query("UPDATE draws SET seed_mode = ? WHERE id = ?").run(draw.seed_mode, next.id);
    return this.draw(next.id);
  }

  /**
   * Develop a second candidate of a draw that already chose one. The fork is a
   * draw of its own — the same seed, examples, setting and domains — carrying
   * the candidate's premise and vignette across as a copied step, so every
   * later stage reads it the way it reads any other draw.
   */
  async fork(drawId: string, executeStepId: string): Promise<DrawRow> {
    const src = this.draw(drawId);
    if (src.status === "awaiting_gate") throw new Error(`draw ${drawId} is awaiting the gate; choose a candidate instead of forking`);
    if (!src.chosen_step) throw new Error(`draw ${drawId} chose no candidate; there is nothing to fork from`);
    if (executeStepId === src.chosen_step) throw new Error(`draw ${drawId} was itself developed from that candidate`);
    const c = this.candidates(drawId).find((x) => x.step_id === executeStepId);
    if (!c) throw new Error(`draw ${drawId}: no execute step ${executeStepId}`);
    const already = this.forks(drawId).find((f) => f.step_id === executeStepId);
    if (already) throw new Error(`draw ${drawId}: candidate #${c.index} is already developed as ${already.id}`);
    const newId = `${now().replace(/[-:TZ]/g, "").slice(0, 15)}-${id(2)}`;
    this.db.query(`INSERT INTO draws (id, name, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, domains, sampling, status, gate_method, forked_from, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', 'manual', ?, ?)`)
      .run(newId, this.nameFor(src.seed_text), src.setting, src.genre, src.mode, src.segment, src.seed_mode, src.seed_text, src.seed_theme_id, src.example_ids, src.domains, src.sampling, drawId, now());
    const step = this.recordStep(newId, null, "execute", "copied", c.premise);
    this.artifact(step, "vignette", c.vignette, { index: c.index, probability: c.probability, premise: c.premise, warnings: c.warnings, forked_from: executeStepId });
    this.db.query("UPDATE draws SET chosen_step = ? WHERE id = ?").run(step.id, newId);
    try {
      await this.develop(newId, { step_id: step.id, premise: c.premise, vignette: c.vignette });
    } catch (e) {
      this.fail(newId, e);
      throw e;
    }
    return this.draw(newId);
  }

  /** The draws forked off this one, each with the execute step of the candidate it develops. */
  forks(drawId: string): { id: string; status: string; step_id: string; index: number }[] {
    const rows = this.db.query(`SELECT d.id, d.status, a.meta FROM draws d
                                JOIN steps s ON s.draw_id = d.id AND s.stage = 'execute'
                                JOIN artifacts a ON a.step_id = s.id AND a.kind = 'vignette'
                                WHERE d.forked_from = ? ORDER BY d.created_at`).all(drawId) as any[];
    return rows.map((r) => { const m = JSON.parse(r.meta); return { id: r.id, status: r.status, step_id: m.forked_from as string, index: m.index as number }; });
  }

  /** Hide a draw from the lists, or put it back. Nothing else about it changes, and it stays reachable by id. */
  archive(drawId: string, archived = true): DrawRow {
    this.draw(drawId);
    this.db.query("UPDATE draws SET archived_at = ? WHERE id = ?").run(archived ? now() : null, drawId);
    return this.draw(drawId);
  }

  flag(drawId: string, note: string): DrawRow {
    this.db.query("UPDATE draws SET flagged = 1, flag_note = ? WHERE id = ?").run(note, drawId);
    return this.draw(drawId);
  }

  // --- development -----------------------------------------------------------

  private async develop(drawId: string, c: { step_id: string; premise: string; vignette: string }) {
    const draw = this.draw(drawId);
    const { setting, domains } = this.loadDrawSetting(draw);
    const settingJobs = (setting?.jobs ?? []).map((j) => fill("settingJob", { name: j.name, description: j.description })).join("");
    const jobNames = [...RUN.coreJobs, ...(setting?.jobs ?? []).map((j) => j.name.toLowerCase())];
    const outlineHead = fill("outlineHead", { seed: draw.seed_text, premise: c.premise, vignette: c.vignette });
    const outlineSetting = this.settingFor("outline", setting, domains);   // the Jobs section reaches the outline as its <section> asks
    const { step: outlineStep, value: outline } = await this.invoke(drawId, c.step_id, "outline",
      compose(outlineHead, fill("outlineAsk", { settingJobs }), outlineSetting), (text) => {
        const secs = sections(text);
        for (const j of jobNames) if (!secs[j]) throw new Error(`missing <section name="${j}">`);
        return secs;
      });
    const outlineText = Object.entries(outline).map(([n, body]) => `## ${n}\n\n${body}`).join("\n\n");
    this.artifact(outlineStep, "outline", outlineText, { jobs: jobNames, words: Object.fromEntries(Object.entries(outline).map(([n, b]) => [n, words(b)])) });
    const head = fill("head", { outline: outlineText, vignette: c.vignette });
    const after = (stage: GenStage, ask: string) => compose(head, ask, this.settingFor(stage, setting, domains), "");
    const { step: jobsStep, value: jobs } = await this.invoke(drawId, outlineStep.id, "jobs", after("jobs", fill("jobs", {})), (text) => {
      const js = tags(text, "job");
      if (js.length !== RUN.contextVignettes) throw new Error(`expected ${RUN.contextVignettes} jobs, got ${js.length}`);
      if (new Set(js.map((j) => j.toLowerCase())).size !== js.length) throw new Error("identical jobs");
      return js;
    });
    jobs.forEach((j, i) => this.artifact(jobsStep, "job", j, { index: i + 1 }));
    await Promise.all([
      ...jobs.map((job, i) => this.invoke(drawId, outlineStep.id, "context", after("context", fill("context", { job })), (text) => {
        const v = tag(text, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
      }).then((r) => this.artifact(r.step, "vignette", r.value, { index: i + 1, job, warnings: words(r.value) > 500 ? ["length"] : [] }))),
      this.invoke(drawId, outlineStep.id, "ending", after("ending", fill("ending", {})), (text) => {
        const e = tag(text, "ending"); if (!e) throw new Error("no <ending> tag"); return e;
      }).then((r) => this.artifact(r.step, "ending", r.value, { warnings: words(r.value) > 650 ? ["length"] : [] })),
    ]);
    const dir = writeBrief(this.db, drawId, this.stages, this.briefsDir, this.settingsDir);
    this.db.query("UPDATE draws SET status = 'done', ended_at = ? WHERE id = ?").run(now(), drawId);
    this.artifact(outlineStep, "brief", dir, {});
  }

  fail(drawId: string, e: unknown) {
    this.db.query("UPDATE draws SET status = 'failed', flag_note = coalesce(nullif(flag_note, ''), ?), ended_at = ? WHERE id = ?")
      .run(String((e as any)?.message ?? e).slice(0, 500), now(), drawId);
  }

  // --- reads -----------------------------------------------------------------

  draw(drawId: string): DrawRow {
    const r = this.db.query("SELECT * FROM draws WHERE id = ?").get(drawId) as DrawRow | null;
    if (!r) throw new Error(`no draw ${drawId}`);
    return r;
  }
  // created_at is second-resolution, so two draws started in one second need the insertion order to break the tie
  draws(archived = false): DrawRow[] {
    return this.db.query(`SELECT * FROM draws ${archived ? "" : "WHERE archived_at IS NULL "}ORDER BY created_at DESC, rowid DESC`).all() as DrawRow[];
  }
  steps(drawId: string): StepRow[] { return this.db.query("SELECT * FROM steps WHERE draw_id = ? ORDER BY started_at, rowid").all(drawId) as StepRow[]; }
  artifacts(drawId: string) {
    return this.db.query("SELECT a.* FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.draw_id = ? ORDER BY s.started_at, a.rowid").all(drawId) as { id: string; step_id: string; kind: string; content: string; meta: string }[];
  }
}

export { pipelineVersion };
