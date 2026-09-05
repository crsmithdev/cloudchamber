/**
 * The generation run:
 *
 *   draw → premises → execute ×5 → gate → outline → jobs → { context ×2, ending } → packet
 *
 * Every model step is a row in `steps` with its prompt, model, system prompt,
 * raw response and parsed output, recorded before the next step starts. The
 * gate is the one human point; in auto mode it takes the lowest stated
 * probability, never a judgement.
 */
import { randomBytes } from "node:crypto";
import { RUN, loadStages, type StageConfig, type StageName } from "./config.ts";
import { compose, fill } from "./prompts.ts";
import { sections, tag, tags, words, type ModelAdapter } from "./model.ts";
import { eligiblePassages, eligibleThemes, type Segment } from "./bank.ts";
import { loadSetting, type Setting } from "./settings.ts";
import { now } from "./paths.ts";
import { pipelineVersion } from "./version.ts";
import type { Db } from "./store/db.ts";
import { writePacket } from "./packet.ts";

export type SeedChoice = { mode: "drawn" } | { mode: "picked"; themeId: string } | { mode: "typed"; text: string };
export type RunOpts = {
  mode: "auto" | "manual";
  setting?: string;
  genre?: string;
  segment?: Segment;
  seed?: SeedChoice;
  seedRng?: () => number;
};

export type RunRow = {
  id: string; setting: string | null; genre: string; mode: "auto" | "manual"; segment: string | null;
  seed_mode: string; seed_text: string; seed_theme_id: string | null; example_ids: string; status: string;
  gate_method: string | null; chosen_step: string | null; flagged: number; flag_note: string;
  superseded_by: string | null; created_at: string; ended_at: string | null;
};
export type StepRow = {
  id: string; run_id: string | null; parent_id: string | null; stage: string; model: string; system_prompt: string;
  prompt: string; raw_response: string | null; parsed: string | null; status: string; fail_reason: string | null;
  attempt: number; started_at: string; ended_at: string | null; error: string | null;
};

export class StepFailure extends Error {
  constructor(public reason: "shape" | "refusal" | "error", message: string, public step: StepRow) {
    super(message);
  }
}

const id = (n = 6) => randomBytes(n).toString("hex");

export class Pipeline {
  stages: Record<StageName, StageConfig>;
  packetsDir: string | undefined;
  constructor(public db: Db, public model: ModelAdapter, opts: { stages?: Record<StageName, StageConfig>; rng?: () => number; packetsDir?: string } = {}) {
    this.stages = opts.stages ?? loadStages();
    this.rng = opts.rng ?? Math.random;
    this.packetsDir = opts.packetsDir;
  }
  rng: () => number;

  // --- steps -----------------------------------------------------------------

  private insertStep(run: string | null, parent: string | null, stage: StageName, model: string, system: string, prompt: string, attempt: number, storyId: string | null = null): StepRow {
    const row: StepRow = {
      id: `${stage}-${id(4)}`, run_id: run, parent_id: parent, stage, model, system_prompt: system, prompt,
      raw_response: null, parsed: null, status: "running", fail_reason: null, attempt, started_at: now(), ended_at: null, error: null,
    };
    this.db.query(`INSERT INTO steps (id, run_id, story_id, parent_id, stage, model, system_prompt, prompt, status, attempt, started_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`)
      .run(row.id, run, storyId, parent, stage, model, system, prompt, attempt, row.started_at);
    return row;
  }

  private finishStep(step: StepRow, patch: Partial<StepRow>) {
    Object.assign(step, patch, { ended_at: now() });
    this.db.query(`UPDATE steps SET raw_response = ?, parsed = ?, status = ?, fail_reason = ?, error = ?, model = ?, ended_at = ? WHERE id = ?`)
      .run(step.raw_response, step.parsed, step.status, step.fail_reason, step.error, step.model, step.ended_at, step.id);
  }

  /** One stage call with the spec's retry table. Returns the successful step and its parsed value. */
  async invoke<T>(run: string | null, parent: string | null, stage: StageName, prompt: string, parse: (text: string) => T, storyId: string | null = null): Promise<{ step: StepRow; value: T }> {
    const cfg = this.stages[stage];
    const attempt = async (model: string, n: number): Promise<{ step: StepRow; value?: T; outcome: "ok" | "shape" | "refusal" | "error" }> => {
      const step = this.insertStep(run, parent, stage, model, cfg.system, prompt, n, storyId);
      const r = await this.model.call(stage, cfg.system, prompt, model);
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

  private artifact(step: StepRow, kind: string, content: string, meta: Record<string, unknown> = {}): string {
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

  private pick<T>(xs: T[]): T { return xs[Math.floor(this.rng() * xs.length)]; }
  private shuffle<T>(xs: T[]): T[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  private inferGenre(opts: RunOpts, examples: { genre: string }[]): string {
    if (opts.genre) return opts.genre;
    if (opts.segment?.genre) return opts.segment.genre;
    const genres = new Set(examples.map((e) => e.genre));
    if (genres.size === 1) return [...genres][0];
    throw new Error(`run: examples span genres ${[...genres].join(", ")}; pass --genre`);
  }

  // --- the run ---------------------------------------------------------------

  async start(opts: RunOpts): Promise<RunRow> {
    const setting = opts.setting ? loadSetting(opts.setting) : undefined;
    const examples = this.drawExamples(opts.segment);
    const seed = this.drawSeed(opts.seed, setting);
    const genre = this.inferGenre(opts, examples);
    const runId = `${now().replace(/[-:TZ]/g, "").slice(0, 15)}-${id(2)}`;
    this.db.query(`INSERT INTO runs (id, setting, genre, mode, segment, seed_mode, seed_text, seed_theme_id, example_ids, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`)
      .run(runId, setting?.id ?? null, genre, opts.mode, opts.segment ? JSON.stringify(opts.segment) : null,
        seed.mode, seed.text, seed.themeId, JSON.stringify(examples.map((e) => e.id)), now());
    try {
      await this.premisesAndExecute(runId, examples.map((e) => e.text), seed.text, genre, setting);
    } catch (e) {
      this.fail(runId, e);
      throw e;
    }
    const run = this.run(runId);
    if (run.mode === "auto") return this.autoGate(runId);
    return run;
  }

  private async premisesAndExecute(runId: string, examples: string[], seed: string, genre: string, setting?: Setting) {
    const ask = fill("premisesAsk", { genre, seed });
    const prompt = compose(examples, ask, setting);
    const { step, value: premises } = await this.invoke(runId, null, "premises", prompt, (text) => {
      const ps = tags(text, "premise").map((p) => ({ text: tag(p, "text"), probability: Number(tag(p, "probability")) }));
      if (ps.length !== RUN.k) throw new Error(`expected ${RUN.k} premises, got ${ps.length}`);
      for (const p of ps) {
        if (!p.text) throw new Error("premise without <text>");
        if (!Number.isFinite(p.probability)) throw new Error("premise without a numeric <probability>");
        if (p.probability >= RUN.ceiling) throw new Error(`probability ${p.probability} is not under ${RUN.ceiling}`);
      }
      return ps as { text: string; probability: number }[];
    }).catch((e) => {
      if (e instanceof StepFailure && e.reason === "shape") this.db.query("UPDATE runs SET flagged = 1, flag_note = ? WHERE id = ?").run(`premise call failed shape: ${e.message}`, runId);
      throw e;
    });
    // Number the premises from the tail: #1 is the lowest stated probability. Ties keep the model's order.
    premises.sort((a, b) => a.probability - b.probability);
    premises.forEach((p, i) => this.artifact(step, "premise", p.text, { index: i + 1, probability: p.probability, warnings: words(p.text) > 120 ? ["length"] : [] }));
    await Promise.all(premises.map((p, i) => {
      const ask = fill("executeAsk", { seed, premise: p.text });
      return this.invoke(runId, step.id, "execute", compose(examples, ask, setting), (text) => {
        const v = tag(text, "vignette");
        if (!v) throw new Error("no <vignette> tag");
        return v;
      }).then((r) => this.artifact(r.step, "vignette", r.value, {
        index: i + 1, probability: p.probability, premise: p.text,
        warnings: words(r.value) < 300 || words(r.value) > 500 ? ["length"] : [],
      }));
    }));
    this.db.query("UPDATE runs SET status = 'awaiting_gate' WHERE id = ?").run(runId);
  }

  /** The five executed candidates, sorted by stated probability ascending. */
  candidates(runId: string): { step_id: string; index: number; probability: number; premise: string; vignette: string; warnings: string[] }[] {
    const rows = this.db.query(`SELECT a.step_id, a.content, a.meta FROM artifacts a JOIN steps s ON s.id = a.step_id
                                WHERE s.run_id = ? AND a.kind = 'vignette' AND s.stage = 'execute'`).all(runId) as any[];
    // Numbered from the tail on read too, so runs recorded before this numbering read the same way.
    return rows.map((r) => { const m = JSON.parse(r.meta); return { step_id: r.step_id, index: m.index as number, probability: m.probability, premise: m.premise, vignette: r.content, warnings: m.warnings ?? [] }; })
      .sort((a, b) => a.probability - b.probability || a.index - b.index)
      .map((c, i) => ({ ...c, index: i + 1 }));
  }

  private async autoGate(runId: string): Promise<RunRow> {
    const cs = this.candidates(runId);
    const lo = cs[0].probability;
    const ties = cs.filter((c) => c.probability === lo);
    const chosen = this.pick(ties);
    this.db.query("UPDATE runs SET gate_method = 'auto' WHERE id = ?").run(runId);
    return this.choose(runId, chosen.step_id);
  }

  // --- gate actions ----------------------------------------------------------

  async choose(runId: string, executeStepId: string): Promise<RunRow> {
    const run = this.run(runId);
    if (run.status !== "awaiting_gate") throw new Error(`run ${runId} is ${run.status}, not awaiting_gate`);
    const c = this.candidates(runId).find((c) => c.step_id === executeStepId);
    if (!c) throw new Error(`run ${runId}: no execute step ${executeStepId}`);
    this.db.query("UPDATE runs SET status = 'running', chosen_step = ?, gate_method = coalesce(gate_method, 'manual') WHERE id = ?").run(executeStepId, runId);
    try {
      await this.develop(runId, c);
    } catch (e) {
      this.fail(runId, e);
      throw e;
    }
    return this.run(runId);
  }

  async reject(runId: string, how: "redraw" | "keep-seed", note = ""): Promise<RunRow> {
    const run = this.run(runId);
    if (run.status !== "awaiting_gate") throw new Error(`run ${runId} is ${run.status}, not awaiting_gate`);
    const opts: RunOpts = {
      mode: run.mode, setting: run.setting ?? undefined, genre: run.genre,
      segment: run.segment ? JSON.parse(run.segment) : undefined,
      seed: how === "keep-seed"
        ? (run.seed_theme_id ? { mode: "picked", themeId: run.seed_theme_id } : { mode: "typed", text: run.seed_text })
        : { mode: "drawn" },
    };
    this.db.query("UPDATE runs SET status = 'rejected', flag_note = ?, ended_at = ? WHERE id = ?").run(note, now(), runId);
    const next = await this.start({ ...opts, mode: "manual" });
    this.db.query("UPDATE runs SET superseded_by = ? WHERE id = ?").run(next.id, runId);
    if (how === "keep-seed") this.db.query("UPDATE runs SET seed_mode = ? WHERE id = ?").run(run.seed_mode, next.id);
    return this.run(next.id);
  }

  flag(runId: string, note: string): RunRow {
    this.db.query("UPDATE runs SET flagged = 1, flag_note = ? WHERE id = ?").run(note, runId);
    return this.run(runId);
  }

  // --- development -----------------------------------------------------------

  private async develop(runId: string, c: { step_id: string; premise: string; vignette: string }) {
    const run = this.run(runId);
    const setting = run.setting ? loadSetting(run.setting) : undefined;
    const settingJobs = (setting?.jobs ?? []).map((j) => fill("settingJob", { name: j.name, description: j.description })).join("");
    const jobNames = [...RUN.coreJobs, ...(setting?.jobs ?? []).map((j) => j.name.toLowerCase())];
    const { step: outlineStep, value: outline } = await this.invoke(runId, c.step_id, "outline",
      fill("outline", { seed: run.seed_text, premise: c.premise, vignette: c.vignette, settingJobs }), (text) => {
        const secs = sections(text);
        for (const j of jobNames) if (!secs[j]) throw new Error(`missing <section name="${j}">`);
        return secs;
      });
    const outlineText = Object.entries(outline).map(([n, body]) => `## ${n}\n\n${body}`).join("\n\n");
    this.artifact(outlineStep, "outline", outlineText, { jobs: jobNames, words: Object.fromEntries(Object.entries(outline).map(([n, b]) => [n, words(b)])) });
    const head = fill("head", { outline: outlineText, vignette: c.vignette });
    const { step: jobsStep, value: jobs } = await this.invoke(runId, outlineStep.id, "jobs", head + fill("jobs", {}), (text) => {
      const js = tags(text, "job");
      if (js.length !== RUN.contextVignettes) throw new Error(`expected ${RUN.contextVignettes} jobs, got ${js.length}`);
      if (new Set(js.map((j) => j.toLowerCase())).size !== js.length) throw new Error("identical jobs");
      return js;
    });
    jobs.forEach((j, i) => this.artifact(jobsStep, "job", j, { index: i + 1 }));
    await Promise.all([
      ...jobs.map((job, i) => this.invoke(runId, outlineStep.id, "context", head + fill("context", { job }), (text) => {
        const v = tag(text, "vignette"); if (!v) throw new Error("no <vignette> tag"); return v;
      }).then((r) => this.artifact(r.step, "vignette", r.value, { index: i + 1, job, warnings: words(r.value) > 500 ? ["length"] : [] }))),
      this.invoke(runId, outlineStep.id, "ending", head + fill("ending", {}), (text) => {
        const e = tag(text, "ending"); if (!e) throw new Error("no <ending> tag"); return e;
      }).then((r) => this.artifact(r.step, "ending", r.value, { warnings: words(r.value) > 650 ? ["length"] : [] })),
    ]);
    const dir = writePacket(this.db, runId, this.stages, this.packetsDir);
    this.db.query("UPDATE runs SET status = 'done', ended_at = ? WHERE id = ?").run(now(), runId);
    this.artifact(outlineStep, "packet", dir, {});
  }

  private fail(runId: string, e: unknown) {
    this.db.query("UPDATE runs SET status = 'failed', flag_note = coalesce(nullif(flag_note, ''), ?), ended_at = ? WHERE id = ?")
      .run(String((e as any)?.message ?? e).slice(0, 500), now(), runId);
  }

  // --- reads -----------------------------------------------------------------

  run(runId: string): RunRow {
    const r = this.db.query("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | null;
    if (!r) throw new Error(`no run ${runId}`);
    return r;
  }
  runs(): RunRow[] { return this.db.query("SELECT * FROM runs ORDER BY created_at DESC").all() as RunRow[]; }
  steps(runId: string): StepRow[] { return this.db.query("SELECT * FROM steps WHERE run_id = ? ORDER BY started_at, rowid").all(runId) as StepRow[]; }
  artifacts(runId: string) {
    return this.db.query("SELECT a.* FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.run_id = ? ORDER BY s.started_at, a.rowid").all(runId) as { id: string; step_id: string; kind: string; content: string; meta: string }[];
  }
}

export { pipelineVersion };
