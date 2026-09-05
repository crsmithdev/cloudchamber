/**
 * The verdict log: bank/verdicts.jsonl, append-only, tracked in git. The
 * `verdicts` table is a replay of it. Latest line per (kind, target) wins.
 * Eligible = latest verdict absent, or keep with the artifact flag unset.
 *
 * Every example verdict carries a snapshot of the passage (story and text) so
 * that inheritance can run from the log alone after a re-extraction.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { VERDICT_LOG, now } from "./paths.ts";
import type { Db } from "./store/db.ts";
import { pipelineVersion } from "./version.ts";

export type Kind = "example" | "theme" | "packet";
export type Method = "queue" | "browse" | "gate" | "cli";

export type Verdict = {
  id: string;
  kind: Kind;
  target_id: string;
  verdict: "keep" | "pass";
  artifact: boolean;
  note: string;
  method: Method;
  at: string;
  by: string;
  pipeline_version: string;
  inherited_from?: string;
  snapshot?: { story_id: string; text: string };
};

export type VerdictInput = Pick<Verdict, "kind" | "target_id" | "verdict" | "method"> &
  Partial<Pick<Verdict, "artifact" | "note" | "by" | "inherited_from" | "snapshot">>;

const KINDS = new Set(["example", "theme", "packet"]);
const METHODS = new Set(["queue", "browse", "gate", "cli"]);

export function validateLine(raw: string, lineNo: number): Verdict {
  let v: any;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error(`verdicts.jsonl line ${lineNo}: not JSON`);
  }
  const bad = (what: string) => new Error(`verdicts.jsonl line ${lineNo}: ${what}`);
  if (typeof v.id !== "string") throw bad("missing id");
  if (!KINDS.has(v.kind)) throw bad(`bad kind ${JSON.stringify(v.kind)}`);
  if (typeof v.target_id !== "string") throw bad("missing target_id");
  if (v.verdict !== "keep" && v.verdict !== "pass") throw bad(`bad verdict ${JSON.stringify(v.verdict)}`);
  if (typeof v.artifact !== "boolean") throw bad("artifact must be boolean");
  if (typeof v.note !== "string") throw bad("note must be a string");
  if (!METHODS.has(v.method)) throw bad(`bad method ${JSON.stringify(v.method)}`);
  for (const k of ["at", "by", "pipeline_version"]) if (typeof v[k] !== "string") throw bad(`missing ${k}`);
  return v as Verdict;
}

function insert(db: Db, v: Verdict) {
  db.query(
    `INSERT OR REPLACE INTO verdicts (id, kind, target_id, verdict, artifact, note, method, at, by, pipeline_version, inherited_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(v.id, v.kind, v.target_id, v.verdict, v.artifact ? 1 : 0, v.note, v.method, v.at, v.by, v.pipeline_version, v.inherited_from ?? null);
}

/** Append one verdict to the log and the table. Never modifies an existing line. */
export function record(db: Db, input: VerdictInput, log: string = VERDICT_LOG): Verdict {
  let snapshot = input.snapshot;
  if (input.kind === "example" && !snapshot) {
    const p = db.query("SELECT story_id, text FROM passages WHERE id = ?").get(input.target_id) as any;
    if (p) snapshot = { story_id: p.story_id, text: p.text };
  }
  const v: Verdict = {
    id: createHash("sha1").update(`${input.kind}|${input.target_id}|${now()}|${Math.random()}`).digest("hex").slice(0, 16),
    kind: input.kind,
    target_id: input.target_id,
    verdict: input.verdict,
    artifact: input.artifact ?? false,
    note: input.note ?? "",
    method: input.method,
    at: now(),
    by: input.by ?? process.env.USER ?? "chris",
    pipeline_version: pipelineVersion(),
    ...(input.inherited_from ? { inherited_from: input.inherited_from } : {}),
    ...(snapshot ? { snapshot } : {}),
  };
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, JSON.stringify(v) + "\n");
  insert(db, v);
  return v;
}

export function readLog(log: string = VERDICT_LOG): Verdict[] {
  if (!existsSync(log)) return [];
  const out: Verdict[] = [];
  const lines = readFileSync(log, "utf8").split("\n");
  lines.forEach((raw, i) => {
    if (raw.trim()) out.push(validateLine(raw, i + 1));
  });
  return out;
}

/** Rebuild the verdicts table from the log. Fails naming the bad line. */
export function replay(db: Db, log: string = VERDICT_LOG): number {
  const all = readLog(log);
  db.exec("DELETE FROM verdicts");
  const tx = db.transaction((rows: Verdict[]) => rows.forEach((v) => insert(db, v)));
  tx(all);
  return all.length;
}

export type Latest = { verdict: "keep" | "pass"; artifact: boolean; note: string; at: string; inherited_from: string | null } | null;

export function latest(db: Db, kind: Kind, target: string): Latest {
  const r = db.query("SELECT verdict, artifact, note, at, inherited_from FROM verdicts WHERE kind = ? AND target_id = ? ORDER BY at DESC, rowid DESC LIMIT 1").get(kind, target) as any;
  return r ? { ...r, artifact: !!r.artifact } : null;
}

export function isEligible(l: Latest): boolean {
  return l === null || (l.verdict === "keep" && !l.artifact);
}

/** SQL fragment selecting target ids of `kind` that are NOT eligible. */
export const INELIGIBLE_SQL = `
  SELECT target_id FROM verdicts v WHERE kind = ?
    AND at = (SELECT max(at) FROM verdicts w WHERE w.kind = v.kind AND w.target_id = v.target_id)
    AND (verdict = 'pass' OR artifact = 1)`;

export function eligibleIds(db: Db, kind: Kind, candidates: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of candidates) if (isEligible(latest(db, kind, id))) out.add(id);
  return out;
}

// --- inheritance ---------------------------------------------------------

function tokens(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of s.toLowerCase().split(/\s+/).filter(Boolean)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  let shared = 0, na = 0, nb = 0;
  for (const [t, c] of ta) { na += c; shared += Math.min(c, tb.get(t) ?? 0); }
  for (const c of tb.values()) nb += c;
  return shared / Math.max(1, Math.min(na, nb));
}

export const INHERIT_THRESHOLD = 0.8;

/**
 * For every latest example verdict whose passage no longer exists, find a
 * current passage in the same story overlapping by >= 80% of tokens and copy
 * the verdict onto it, marked inherited. Returns the verdicts written.
 */
export function inherit(db: Db, log: string = VERDICT_LOG): Verdict[] {
  const all = readLog(log);
  const latestBy = new Map<string, Verdict>();
  for (const v of all) if (v.kind === "example") latestBy.set(v.target_id, v);   // log is chronological
  const written: Verdict[] = [];
  for (const old of latestBy.values()) {
    if (!old.snapshot) continue;
    if (db.query("SELECT 1 FROM passages WHERE id = ?").get(old.target_id)) continue;   // still present
    const candidates = db.query("SELECT id, text FROM passages WHERE story_id = ?").all(old.snapshot.story_id) as { id: string; text: string }[];
    let best: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const s = tokenOverlap(old.snapshot.text, c.text);
      if (s >= INHERIT_THRESHOLD && (!best || s > best.score)) best = { id: c.id, score: s };
    }
    if (!best) continue;
    if (latestBy.has(best.id) || latest(db, "example", best.id)) continue;             // has its own verdict
    written.push(record(db, {
      kind: "example", target_id: best.id, verdict: old.verdict, artifact: old.artifact,
      note: old.note, method: "cli", by: "inherit", inherited_from: old.target_id,
    }, log));
  }
  return written;
}
