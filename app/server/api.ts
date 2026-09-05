/**
 * The HTTP API the UI drives. Every route calls the same pipeline functions
 * the CLI does. Runs started here continue in-process; the gate blocks a
 * manual run until POST /api/runs/:id/gate.
 */
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "../pipeline/store/db.ts";
import { Pipeline, type RunOpts, type SeedChoice } from "../pipeline/run.ts";
import { latest, record, type Kind, type Method } from "../pipeline/verdicts.ts";
import { status } from "../pipeline/status.ts";
import { exportBank } from "../pipeline/bank.ts";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKETS } from "../pipeline/paths.ts";

export type ItemFilter = { kind: Kind; source?: string; author?: string; genre?: string; cell?: string; verdict?: "unreviewed" | "keep" | "pass"; artifact?: boolean; limit?: number; offset?: number };

export function listItems(db: Db, f: ItemFilter) {
  const rows = f.kind === "example"
    ? db.query(`SELECT p.id, p.text, p.words, p.voice, p.mode, p.voice || '/' || p.mode AS cell, s.title, s.author, s.genre, s.source_id AS source, s.id AS story_id
                FROM passages p JOIN stories s ON s.id = p.story_id ORDER BY s.source_id, s.ord, p.position`).all() as any[]
    : f.kind === "theme"
      ? db.query(`SELECT id, text, attestation, stories, drafted_at, duplicate_of FROM themes WHERE duplicate_of IS NULL ORDER BY drafted_at`).all() as any[]
      : db.query(`SELECT id, seed_text AS text, setting, genre, status, created_at FROM runs WHERE status = 'done' ORDER BY created_at DESC`).all() as any[];
  const withVerdict = rows.map((r) => ({ ...r, latest: latest(db, f.kind, r.id) }));
  const out = withVerdict.filter((r) => {
    if (f.source && r.source !== f.source) return false;
    if (f.author && (r.author ?? "").toLowerCase() !== f.author.toLowerCase()) return false;
    if (f.genre && r.genre !== f.genre) return false;
    if (f.cell && r.cell !== f.cell) return false;
    if (f.verdict === "unreviewed" && r.latest) return false;
    if ((f.verdict === "keep" || f.verdict === "pass") && r.latest?.verdict !== f.verdict) return false;
    if (f.artifact !== undefined && !!r.latest?.artifact !== f.artifact) return false;
    return true;
  });
  const offset = f.offset ?? 0, limit = f.limit ?? 50;
  return { total: out.length, items: out.slice(offset, offset + limit) };
}

/** Next unreviewed items: sources round-robin, random within a source. */
export function queue(db: Db, kind: Kind, n = 1, source?: string) {
  const { items } = listItems(db, { kind, verdict: "unreviewed", source, limit: 100000 });
  const bySource = new Map<string, any[]>();
  for (const it of items) { const k = it.source ?? "themes"; if (!bySource.has(k)) bySource.set(k, []); bySource.get(k)!.push(it); }
  const out: any[] = [];
  const keys = [...bySource.keys()];
  let i = 0;
  while (out.length < n && keys.some((k) => bySource.get(k)!.length)) {
    const k = keys[i++ % keys.length]; const arr = bySource.get(k)!;
    if (arr.length) out.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
  }
  return { remaining: items.length, items: out };
}

export function buildApi(db: Db, pipeline: Pipeline, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });
  const running = new Map<string, Promise<unknown>>();

  app.get("/api/status", async () => status(db));

  app.get<{ Querystring: { kind?: Kind; n?: string; source?: string } }>("/api/queue", async (req) =>
    queue(db, (req.query.kind ?? "example") as Kind, Number(req.query.n ?? 1), req.query.source));

  app.post<{ Body: { kind: Kind; target_id: string; verdict: "keep" | "pass"; artifact?: boolean; note?: string; method?: Method } }>("/api/verdicts", async (req, reply) => {
    const b = req.body;
    if (!["example", "theme", "packet"].includes(b?.kind) || !b?.target_id || !["keep", "pass"].includes(b?.verdict)) return reply.code(400).send({ error: "kind, target_id and verdict (keep|pass) are required" });
    return record(db, { kind: b.kind, target_id: b.target_id, verdict: b.verdict, artifact: !!b.artifact, note: b.note ?? "", method: b.method ?? "queue" });
  });

  app.get<{ Querystring: Record<string, string> }>("/api/items", async (req) => {
    const q = req.query;
    return listItems(db, {
      kind: (q.kind ?? "example") as Kind, source: q.source, author: q.author, genre: q.genre, cell: q.cell,
      verdict: q.verdict as any, artifact: q.artifact === undefined ? undefined : q.artifact === "true",
      limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get("/api/facets", async () => ({
    sources: db.query("SELECT id, genre FROM sources").all(),
    authors: db.query("SELECT DISTINCT author FROM stories WHERE author <> '' ORDER BY author").all().map((r: any) => r.author),
    cells: db.query("SELECT voice || '/' || mode AS cell, count(*) AS n FROM passages GROUP BY cell").all(),
    settings: readdirSync(join(PACKETS, "..", "sources", "settings")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")),
  }));

  app.get("/api/runs", async () => pipeline.runs());

  app.post<{ Body: { mode?: "auto" | "manual"; setting?: string; genre?: string; source?: string; author?: string; seed?: string; seed_id?: string } }>("/api/runs", async (req, reply) => {
    const b = req.body ?? {};
    const seed: SeedChoice = b.seed ? { mode: "typed", text: b.seed } : b.seed_id ? { mode: "picked", themeId: b.seed_id } : { mode: "drawn" };
    const opts: RunOpts = { mode: b.mode ?? "manual", setting: b.setting || undefined, genre: b.genre || undefined, seed,
      segment: b.source || b.author ? { source: b.source || undefined, author: b.author || undefined } : undefined };
    try {
      // The draw and validation are synchronous-ish and fail fast; the model steps continue after we reply.
      const started = pipeline.start(opts);
      const runId = await Promise.race([started.then((r) => r.id), new Promise<string>((res) => setTimeout(() => res(pipeline.runs()[0]?.id ?? ""), 300))]);
      running.set(runId, started.catch(() => undefined));
      return reply.code(202).send({ id: runId });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    try {
      const run = pipeline.run(req.params.id);
      return { run, steps: pipeline.steps(run.id), artifacts: pipeline.artifacts(run.id), candidates: pipeline.candidates(run.id) };
    } catch (e: any) { return reply.code(404).send({ error: e.message }); }
  });

  app.post<{ Params: { id: string }; Body: { action: "choose" | "redraw" | "keep-seed" | "flag"; step_id?: string; note?: string } }>("/api/runs/:id/gate", async (req, reply) => {
    const { action, step_id, note = "" } = req.body ?? ({} as any);
    const id = req.params.id;
    try {
      if (action === "flag") return pipeline.flag(id, note);
      if (action === "choose") {
        if (!step_id) return reply.code(400).send({ error: "step_id required" });
        const run = pipeline.run(id);
        if (run.status !== "awaiting_gate") return reply.code(400).send({ error: `run ${id} is ${run.status}, not awaiting_gate` });
        if (!pipeline.candidates(id).some((c) => c.step_id === step_id)) return reply.code(400).send({ error: `no execute step ${step_id} on run ${id}` });
        const p = pipeline.choose(id, step_id);
        running.set(id, p.catch(() => undefined));
        return reply.code(202).send({ id, status: "running" });
      }
      if (action === "redraw" || action === "keep-seed") { const next = await pipeline.reject(id, action, note); return reply.code(202).send({ id: next.id, superseded: id }); }
      return reply.code(400).send({ error: "action must be choose | redraw | keep-seed | flag" });
    } catch (e: any) { return reply.code(400).send({ error: e.message }); }
  });

  app.get<{ Params: { id: string } }>("/api/packets/:id", async (req, reply) => {
    const dir = join(PACKETS, req.params.id);
    if (!existsSync(dir)) return reply.code(404).send({ error: "no packet" });
    const files: Record<string, string> = {};
    for (const f of readdirSync(dir)) files[f] = readFileSync(join(dir, f), "utf8");
    return files;
  });

  app.post("/api/export", async () => exportBank(db));

  (app as any).running = running;
  return app;
}
