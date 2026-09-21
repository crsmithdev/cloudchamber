/**
 * The HTTP API the UI drives. Every route calls the same pipeline functions
 * the CLI does. Draws started here continue in-process; the gate blocks a
 * manual draw until POST /api/draws/:id/gate.
 */
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import type { Db } from "../pipeline/store/db.ts";
import { newDrawId, Pipeline, seedAndSegment, type DrawOpts } from "../pipeline/draw.ts";
import { KINDS, latest, latestAll, passedStories, record, type Kind, type Method } from "../pipeline/verdicts.ts";
import { renderStory } from "../pipeline/drafts.ts";
import { status } from "../pipeline/status.ts";
import { originOf } from "../pipeline/stage.ts";
import { gateCommand, type GateArgs, type GateResult } from "../pipeline/gate.ts";
import { MODEL_GROUPS, MODELS } from "../pipeline/config.ts";
import { chainOf } from "../pipeline/chain.ts";
import { checkersNext } from "../pipeline/check.ts";
import { partsView } from "../pipeline/briefparts.ts";
import { lifecycleView, stageTab, type DrawFacts } from "../pipeline/lifecycle.ts";
import { BANDS, DARKNESS, GENRES, SAMPLING } from "../pipeline/config.ts";
import { exportBank, sourceLabel } from "../pipeline/bank.ts";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { BRIEFS } from "../pipeline/paths.ts";
import { Drafting, type FindingsSummary } from "../pipeline/drafting.ts";
import { loadSetting } from "../pipeline/settings.ts";
import { loadDraftConfig, profileNames, type DraftConfig } from "../pipeline/draftconfig.ts";

export type ItemOrder = "source" | "suspects" | "shuffle";
export type ItemFilter = { kind: Kind; source?: string; author?: string; genre?: string; cell?: string; verdict?: "unreviewed" | "keep" | "pass"; artifact?: boolean; suspect?: boolean; order?: ItemOrder; seed?: number; limit?: number; offset?: number };

/** A stable pseudo-random key per id, so a shuffled listing pages consistently under one seed. */
function shuffleKey(id: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Passages of a passed story are hidden everywhere; the story row is where they come back. */
export function listItems(db: Db, f: ItemFilter) {
  const passed = f.kind === "example" ? passedStories(db) : new Set<string>();
  const rows = f.kind === "example"
    ? (db.query(`SELECT p.id, p.text, p.words, p.voice, p.mode, p.voice || '/' || p.mode AS cell, p.suspect, s.title, s.author, s.genre, s.source_id AS source, s.id AS story_id
                FROM passages p JOIN stories s ON s.id = p.story_id ORDER BY s.source_id, s.ord, p.position`).all() as any[])
        .filter((r) => !passed.has(r.story_id)).map((r) => ({ ...r, suspect: r.suspect ? JSON.parse(r.suspect) : [] }))
    : f.kind === "story"
      ? db.query(`SELECT s.id, s.title AS text, s.title, s.author, s.genre, s.words, s.source_id AS source, count(p.story_id) AS passages
                  FROM stories s LEFT JOIN passages p ON p.story_id = s.id GROUP BY s.id ORDER BY s.source_id, s.ord`).all() as any[]
    : f.kind === "theme"
      ? db.query(`SELECT id, text, attestation, stories, drafted_at, duplicate_of FROM themes WHERE duplicate_of IS NULL ORDER BY drafted_at`).all() as any[]
      : db.query(`SELECT id, seed_text AS text, setting, genre, status, created_at FROM draws WHERE status = 'done' AND archived_at IS NULL ORDER BY created_at DESC, rowid DESC`).all() as any[];
  const verdicts = latestAll(db, f.kind);
  const withVerdict = rows.map((r) => ({ ...r, latest: verdicts.get(r.id) ?? null }));
  const out = withVerdict.filter((r) => {
    if (f.source && r.source !== f.source) return false;
    if (f.author && (r.author ?? "").toLowerCase() !== f.author.toLowerCase()) return false;
    if (f.genre && r.genre !== f.genre) return false;
    if (f.cell && r.cell !== f.cell) return false;
    if (f.verdict === "unreviewed" && r.latest) return false;
    if ((f.verdict === "keep" || f.verdict === "pass") && r.latest?.verdict !== f.verdict) return false;
    if (f.artifact !== undefined && !!r.latest?.artifact !== f.artifact) return false;
    if (f.suspect !== undefined && (r.suspect?.length > 0) !== f.suspect) return false;
    return true;
  });
  // Source order is the query's own. Suspects-first keeps that order within each half; shuffle is stable per seed.
  const ordered = f.order === "suspects" ? [...out].sort((a, b) => (b.suspect?.length ? 1 : 0) - (a.suspect?.length ? 1 : 0))
    : f.order === "shuffle" ? [...out].sort((a, b) => shuffleKey(a.id, f.seed ?? 0) - shuffleKey(b.id, f.seed ?? 0))
    : out;
  const offset = f.offset ?? 0, limit = f.limit ?? 50;
  return { total: ordered.length, items: ordered.slice(offset, offset + limit) };
}

/** The six passages a draw drew, with their latest verdicts; a passage gone from the pool keeps its id only. */
export function drawExamples(db: Db, exampleIds: string) {
  return (JSON.parse(exampleIds) as string[]).map((id) => {
    const p = db.query(`SELECT p.id, p.text, p.words, p.voice || '/' || p.mode AS cell, s.title, s.author, s.genre, s.source_id AS source, s.id AS story_id
                        FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?`).get(id) as any;
    return { ...(p ?? { id, text: null }), latest: latest(db, "example", id) };
  });
}

/**
 * The long work a request starts and the reply does not wait for. Its failure
 * is on the draw row, so the rejection is dropped here. `idle` lets a restart
 * wait for the work instead of killing it.
 */
export class Jobs {
  private n = 0;
  private waiters: (() => void)[] = [];
  get count(): number { return this.n; }
  run(work: Promise<unknown>): void {
    this.n++;
    work.catch(() => undefined).finally(() => { if (--this.n === 0) for (const w of this.waiters.splice(0)) w(); });
  }
  idle(): Promise<void> {
    return this.n ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }
}

export function buildApi(db: Db, pipeline: Pipeline, opts: { logger?: boolean; drafting?: Drafting; jobs?: Jobs } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });
  const jobs = opts.jobs ?? new Jobs();
  const background = (work: Promise<unknown>) => jobs.run(work);
  /**
   * Start long work in the background, and return the error when it fails
   * before its first model call. A status or id check throws inside the async
   * method, so without this the reply was a 202 for work that never ran.
   */
  const launch = (work: Promise<unknown>): Promise<Error | null> => {
    background(work);
    return Promise.race([work.then(() => null, (e: Error) => e), new Promise<null>((r) => setImmediate(() => r(null)))]);
  };
  const drafting = opts.drafting ?? new Drafting(pipeline);

  app.get("/api/status", async () => status(db));

  app.post<{ Body: { kind: Kind; target_id: string; verdict: "keep" | "pass"; artifact?: boolean; note?: string; method?: Method } }>("/api/verdicts", async (req, reply) => {
    const b = req.body;
    if (!KINDS.has(b?.kind) || !b?.target_id || !["keep", "pass"].includes(b?.verdict)) return reply.code(400).send({ error: "kind, target_id and verdict (keep|pass) are required" });
    return record(db, { kind: b.kind, target_id: b.target_id, verdict: b.verdict, artifact: !!b.artifact, note: b.note ?? "", method: b.method ?? "queue" });
  });

  app.get<{ Querystring: Record<string, string> }>("/api/items", async (req) => {
    const q = req.query;
    return listItems(db, {
      kind: (q.kind ?? "example") as Kind, source: q.source, author: q.author, genre: q.genre, cell: q.cell,
      verdict: q.verdict as any, artifact: q.artifact === undefined ? undefined : q.artifact === "true",
      suspect: q.suspect === undefined ? undefined : q.suspect === "true",
      order: q.order as ItemOrder | undefined, seed: q.seed ? Number(q.seed) : undefined,
      limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get("/api/facets", async () => ({
    sources: (db.query("SELECT id, genre, path FROM sources ORDER BY id").all() as { id: string; genre: string; path: string }[])
      .map((s) => ({ id: s.id, genre: s.genre, ...sourceLabel(s.id, s.path) })),
    authors: db.query("SELECT DISTINCT author FROM stories WHERE author <> '' ORDER BY author").all().map((r: any) => r.author),
    cells: db.query("SELECT voice || '/' || mode AS cell, count(*) AS n FROM passages GROUP BY cell").all(),
    // each setting by its front matter name, not by its id
    settings: (existsSync(pipeline.settingsDir) ? readdirSync(pipeline.settingsDir) : []).filter((f) => f.endsWith(".md")).map((f) => {
      const id = f.replace(/\.md$/, "");
      return { id, name: loadSetting(id, pipeline.settingsDir).name };
    }),
    genres: GENRES,
    sampling: SAMPLING.map((mode) => ({ mode, ...BANDS[mode] })),
    darkness: DARKNESS,
  }));

  /**
   * The check summary a list row shows for each round of a repair chain. It is
   * computed during the request and memoised on what can change it: the draw's
   * status and the number of finding verdicts. A read of one chain is about 4 ms
   * with the store on the Linux filesystem and 45 ms on the Windows mount, and a
   * list holds every round of every chain.
   */
  const summaries = new Map<string, FindingsSummary | null>();
  const findingVerdicts = () => (db.query("SELECT count(*) AS n FROM verdicts WHERE kind = 'finding'").get() as { n: number }).n;
  const checkSummary = (r: { id: string; status: string }, stage: string, verdicts: number): FindingsSummary | null => {
    if (stage === "ideate" || r.status === "done") return null;
    const key = `${r.id}|${r.status}|${verdicts}`;
    if (summaries.has(key)) return summaries.get(key)!;
    const out = drafting.findings(r.id).summary;
    // one entry per draw: the key carries what invalidates it, so the old ones are dead
    for (const k of summaries.keys()) if (k.startsWith(`${r.id}|`)) summaries.delete(k);
    summaries.set(key, out);
    return out;
  };

  app.get<{ Querystring: { archived?: string } }>("/api/draws", async (req) => {
    const verdicts = findingVerdicts();
    const all = pipeline.draws(true);
    const refs = new Map<string, string[]>();
    for (const r of all) for (const to of [r.superseded_by, r.repaired_from, r.forked_from]) if (to) refs.set(to, [...(refs.get(to) ?? []), r.id]);
    // the chain each draw stands in, read by chain.ts from the rows already here: a draw nothing repairs heads its chain
    const rows = new Map(all.map((r) => [r.id, r]));
    const repaired = new Set(all.map((r) => r.repaired_from));
    return all.filter((r) => req.query.archived === "true" || !r.archived_at).map((r) => {
      const view = lifecycleView({ ...r, referenced_by: refs.get(r.id) ?? [] } as DrawFacts);
      const stage = view.stage;
      // the candidate is what tells two briefs of one batch apart, so the list needs it too
      return { ...r, ...view, origin: stage === "ideate" ? null : originOf(pipeline, r.id), check: checkSummary(r, stage, verdicts), rounds: chainOf(pipeline, r.id, rows).rounds, head: !repaired.has(r.id) };
    });
  });

  app.post<{ Body: { mode?: "auto" | "manual"; setting?: string; domains?: string; genre?: string; sampling?: string; darkness?: string; shape?: string; source?: string; author?: string; seed?: string; seed_id?: string; models?: Record<string, string> } }>("/api/draws", async (req, reply) => {
    const b = req.body ?? {};
    if (b.domains !== undefined) return reply.code(400).send({ error: "domains are gone; a setting loads whole lists" });
    const opts: DrawOpts = { mode: b.mode ?? "manual", setting: b.setting || undefined, genre: b.genre || undefined,
      sampling: (b.sampling || undefined) as DrawOpts["sampling"], darkness: (b.darkness || undefined) as DrawOpts["darkness"], shape: (b.shape || undefined) as DrawOpts["shape"], models: b.models || undefined,
      ...seedAndSegment({ seed: b.seed, seedId: b.seed_id, source: b.source, author: b.author }) };
    try {
      // validation fails before the first model call; the model steps continue after the reply
      const drawId = newDrawId();
      const failed = await launch(pipeline.start(opts, drawId));
      if (failed) return reply.code(400).send({ error: failed.message });
      return reply.code(202).send({ id: drawId });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  /** The options one draw was made with, for a form that starts another like it. */
  app.get<{ Params: { id: string } }>("/api/draws/:id/like", async (req, reply) => {
    try { return { ...pipeline.like(req.params.id), seed_text: pipeline.draw(req.params.id).seed_text }; } catch (e: any) { return reply.code(404).send({ error: e.message }); }
  });

  app.get<{ Params: { id: string } }>("/api/draws/:id", async (req, reply) => {
    try {
      const row = pipeline.draw(req.params.id);
      const draw = { ...row, ...lifecycleView({ ...row, referenced_by: pipeline.referencedBy(row.id) }) };
      // the pane polls this every few seconds; a step's prompt and response are read from /api/steps/:id when one is opened
      const steps = pipeline.steps(draw.id).map(({ prompt, raw_response, parsed, ...s }) =>
        ({ ...s, tab: stageTab(s.stage), prompt_chars: prompt.length, raw_chars: raw_response?.length ?? 0, parsed_chars: parsed?.length ?? 0 }));
      // what a check would run on this draw now, and the repair settings it would run under: the page states neither itself
      const cfg = row.draft_config ? (JSON.parse(row.draft_config).config as DraftConfig) : loadDraftConfig().config;
      const checks_next = row.chosen_step ? checkersNext(pipeline, row.id, cfg.checks.enabled) : [];
      // what the pane used to read off the artifact list itself: whether a check pass exists, and the auto run that ended here
      const chain = chainOf(pipeline, row.id);
      return { draw, origin: originOf(pipeline, row.id), steps, parts: partsView(pipeline, draw.id), checks_next, repair: cfg.repair, checked: !!chain.pass(), auto: chain.auto(),
               artifacts: pipeline.artifacts(draw.id), candidates: pipeline.candidates(draw.id), examples: drawExamples(db, draw.example_ids), forks: pipeline.forks(draw.id) };
    } catch (e: any) { return reply.code(404).send({ error: e.message }); }
  });

  /** One step in full, with its artifacts: the prompt, the raw response and the parsed value. */
  app.get<{ Params: { id: string } }>("/api/steps/:id", async (req, reply) => {
    const step = db.query("SELECT * FROM steps WHERE id = ?").get(req.params.id) as any;
    if (!step) return reply.code(404).send({ error: `no step ${req.params.id}` });
    const artifacts = db.query("SELECT id, step_id, kind, content, meta FROM artifacts WHERE step_id = ? ORDER BY rowid").all(req.params.id);
    return { step, artifacts };
  });

  // every decision on a draw is one command (pipeline/gate.ts); the routes differ only in which action they name.
  // A running command answers 202 now and finishes in the background; only a failure it reaches at once is an error
  const decide = async (id: string, action: string, args: GateArgs, reply: FastifyReply) => {
    try {
      const c = gateCommand(pipeline, drafting, id, action, args);
      if (!c.running) return { draw: c.draw, running: false, payload: await c.done } satisfies GateResult;
      const failed = await launch(c.done);
      if (failed) return reply.code(400).send({ error: failed.message });
      return reply.code(202).send({ draw: c.draw, running: true, payload: null } satisfies GateResult);
    } catch (e: any) { return reply.code(400).send({ error: e.message }); }
  };
  app.post<{ Params: { id: string }; Body: GateArgs & { action: string } }>("/api/draws/:id/gate", async (req, reply) => {
    const { action, ...args } = req.body ?? ({} as any);
    return decide(req.params.id, action, args, reply);
  });
  app.post<{ Params: { id: string }; Body: GateArgs }>("/api/draws/:id/check", (req, reply) => decide(req.params.id, "check", req.body ?? {}, reply));
  app.post<{ Params: { id: string }; Body: GateArgs }>("/api/draws/:id/draft", (req, reply) => decide(req.params.id, "draft", req.body ?? {}, reply));
  app.delete<{ Params: { id: string } }>("/api/draws/:id", (req, reply) => decide(req.params.id, "delete", {}, reply));

  /** The drafting defaults and what each profile resolves to, so the settings form can show a profile's own values. */
  app.get("/api/draft-config", async () => ({
    defaults: loadDraftConfig().config,
    profiles: profileNames(),
    byProfile: Object.fromEntries(profileNames().map((p) => [p, loadDraftConfig(p).config])),
    // the model each stage runs on by default, the groups a form can set at once, and the models it can offer
    stages: Object.fromEntries(Object.entries(pipeline.stages).map(([s, c]) => [s, c.model])),
    groups: MODEL_GROUPS,
    models: MODELS,
  }));

  app.get<{ Params: { id: string }; Querystring: { all?: string } }>("/api/draws/:id/findings", async (req, reply) => {
    const all = req.query.all === "true" || req.query.all === "1";
    try { return drafting.findings(req.params.id, { all }); } catch (e: any) { return reply.code(404).send({ error: e.message }); }
  });

  // ?flags=0 renders the scenes alone: a judge reads the draft as a listener would, without the screen notes the gate-2 reader wants
  app.get<{ Params: { id: string }; Querystring: { flags?: string } }>("/api/draws/:id/story", async (req, reply) => {
    const withFlags = !(req.query.flags === "0" || req.query.flags === "false");
    try { const v = drafting.view(req.params.id); return { ...v, text: renderStory(v, withFlags) }; } catch (e: any) { return reply.code(404).send({ error: e.message }); }
  });

  // a route parameter is decoded, so `..%2F` arrives as `../`: a path must resolve inside briefs/
  const underBriefs = (...parts: string[]) => {
    const path = resolve(BRIEFS, ...parts);
    return path.startsWith(resolve(BRIEFS) + sep) && existsSync(path) ? path : null;
  };

  app.get<{ Params: { id: string } }>("/api/briefs/:id", async (req, reply) => {
    const dir = underBriefs(req.params.id);
    if (!dir || !statSync(dir).isDirectory()) return reply.code(404).send({ error: "no brief" });
    const files: Record<string, string> = {};
    for (const f of readdirSync(dir)) if (statSync(join(dir, f)).isFile()) files[f] = readFileSync(join(dir, f), "utf8");
    return files;
  });

  app.get<{ Params: { id: string; file: string } }>("/api/briefs/:id/:file", async (req, reply) => {
    const path = underBriefs(req.params.id, req.params.file);
    if (!path || !statSync(path).isFile()) return reply.code(404).send({ error: "no such brief file" });
    return reply.type("text/plain; charset=utf-8").send(readFileSync(path, "utf8"));
  });

  app.post("/api/export", async () => exportBank(db));

  return app;
}
