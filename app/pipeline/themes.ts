/**
 * Theme drafting: one model call per story, zero-shot from the property rules
 * until twelve themes carry a keep verdict, then eight of those as few-shot.
 * Each row is validated; each valid row is embedded, compared with its ten
 * nearest banked themes, and admitted or folded into the theme it restates.
 *
 * bank/themes.jsonl is the canonical, append-only record: one line per bank
 * or attest event. The themes table is a replay of it plus embeddings.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { fill } from "./prompts.ts";
import { tags, words } from "./model.ts";
import { ROOT, THEME_LOG, now } from "./paths.ts";
import type { Db, ThemeRow } from "./store/db.ts";
import { StepFailure, type Pipeline } from "./draw.ts";
import { eligibleIds } from "./verdicts.ts";

export type Embedder = (texts: string[]) => Promise<number[][]>;

export const pythonEmbedder: Embedder = async (texts) => {
  if (!texts.length) return [];
  const p = Bun.spawn(["python3", "-m", "extract", "embed", "--stdin"], { cwd: ROOT, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, CLOUDCHAMBER_DB: ":memory:" } });
  p.stdin.write(JSON.stringify(texts));
  p.stdin.end();
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if ((await p.exited) !== 0) throw new Error(`embed failed: ${err.trim().slice(-500)}`);
  return JSON.parse(out);
};

export const FEWSHOT_MIN = 12;
export const FEWSHOT_N = 8;
export const NEAREST = 10;

// --- row validation --------------------------------------------------------

const RELATIVE_OPENER = /^(Those|These|That|This)\s+(who|whom|whose|which|kept|held|left|made|born|sent|given|taken|chosen|bought|sold|paid|owed|entrusted|charged|hired|passed|spared|raised)\b/;

/** Capitalised words not at the start of the text or of a sentence, `I` excepted. */
export function properNouns(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  return [...t.matchAll(/(?<![.!?:;]\s)(?<!^)\b([A-Z][a-z]+)/g)].map((m) => m[1]).filter((c) => c !== "I");
}

export function validateTheme(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const why: string[] = [];
  const w = words(t);
  if (w < 9 || w > 44) why.push(`${w} words`);
  const sents = (t.match(/[.!?](\s|$)/g) ?? []).length;
  if (sents > 2) why.push(`${sents} sentences`);
  const caps = properNouns(t);
  if (caps.length) why.push(`proper noun ${caps.join(",")}`);
  if (/\bSCP-\d+\b/i.test(t) || /\b[A-Z]{1,4}-\d+\b/.test(t)) why.push("designation");
  if (/^(This|That|These|Those|It|Here)\b/.test(t) && !RELATIVE_OPENER.test(t)) why.push("deictic opener");
  return why;
}

export const themeId = (text: string) => createHash("sha1").update(text.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);

// --- embeddings ------------------------------------------------------------

const toBlob = (v: number[]) => new Uint8Array(new Float32Array(v).buffer);
const fromBlob = (b: Uint8Array) => Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);   // both normalised

/**
 * Ties break on the row that was banked first, so the nearest is the same
 * whichever plan SQLite picks for the scan. Two themes drafted in one second
 * carry the same `drafted_at`, which is why the rowid decides.
 */
export function nearest(db: Db, vec: number[], n = NEAREST): (ThemeRow & { score: number })[] {
  const rows = db.query("SELECT rowid AS seq, * FROM themes WHERE duplicate_of IS NULL AND embedding IS NOT NULL").all() as (ThemeRow & { seq: number })[];
  return rows.map((r) => ({ ...r, score: cosine(vec, fromBlob(r.embedding!)) }))
    .sort((a, b) => b.score - a.score || a.seq - b.seq)
    .slice(0, n);
}

// --- the log ---------------------------------------------------------------

type ThemeEvent =
  | { type: "bank"; id: string; text: string; story: string; at: string }
  | { type: "attest"; id: string; story: string; candidate: string; at: string };

function logEvent(e: ThemeEvent, log: string) {
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, JSON.stringify(e) + "\n");
}

/**
 * Rebuild the themes table (without embeddings) from bank/themes.jsonl, and
 * mark every story in the log as drafted so draftAll does not redraft it. The
 * log holds no rejections or verbatim repeats, so the replayed counts are the
 * banked and attested rows only.
 */
export function replayThemes(db: Db, log: string = THEME_LOG): number {
  if (!existsSync(log)) return 0;
  db.exec("DELETE FROM themes");
  db.exec("DELETE FROM theme_drafts");
  const drafts = new Map<string, { at: string; banked: number; attested: number }>();
  let n = 0;
  for (const raw of readFileSync(log, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    const e = JSON.parse(raw) as ThemeEvent;
    n++;
    const d = drafts.get(e.story) ?? { at: e.at, banked: 0, attested: 0 };
    d.at = e.at > d.at ? e.at : d.at;
    if (e.type === "bank") d.banked++; else d.attested++;
    drafts.set(e.story, d);
    if (e.type === "bank") {
      db.query("INSERT OR REPLACE INTO themes (id, text, attestation, stories, drafted_at) VALUES (?, ?, 1, ?, ?)").run(e.id, e.text, JSON.stringify([e.story]), e.at);
    } else {
      const t = db.query("SELECT stories FROM themes WHERE id = ?").get(e.id) as any;
      if (!t) continue;
      const stories = JSON.parse(t.stories) as string[];
      if (!stories.includes(e.story)) stories.push(e.story);
      db.query("UPDATE themes SET attestation = attestation + 1, stories = ? WHERE id = ?").run(JSON.stringify(stories), e.id);
    }
  }
  const ins = db.query("INSERT INTO theme_drafts (story_id, at, drafted, banked, attested, rejected) VALUES (?, ?, ?, ?, ?, 0)");
  for (const [story, d] of drafts) ins.run(story, d.at, d.banked + d.attested, d.banked, d.attested);
  return n;
}

// --- drafting --------------------------------------------------------------

export type DraftReport = { story: string; drafted: number; banked: number; attested: number; rejected: { text: string; why: string[] }[] };

export function fewshotLines(db: Db): string[] {
  const kept = (db.query("SELECT id, text FROM themes WHERE duplicate_of IS NULL").all() as { id: string; text: string }[]);
  const ok = eligibleIds(db, "theme", kept.map((k) => k.id));
  const keeps = new Set((db.query("SELECT DISTINCT target_id FROM verdicts WHERE kind = 'theme' AND verdict = 'keep'").all() as { target_id: string }[]).map((r) => r.target_id));
  const withKeep = kept.filter((k) => ok.has(k.id) && keeps.has(k.id));
  if (withKeep.length < FEWSHOT_MIN) return [];
  return withKeep.sort(() => Math.random() - 0.5).slice(0, FEWSHOT_N).map((k) => k.text);
}

export async function draftStory(p: Pipeline, storyId: string, embed: Embedder = pythonEmbedder, log: string = THEME_LOG): Promise<DraftReport> {
  const story = p.db.query("SELECT id, text FROM stories WHERE id = ?").get(storyId) as { id: string; text: string } | null;
  if (!story) throw new Error(`no story ${storyId}`);
  const lines = fewshotLines(p.db);
  const fewshot = lines.length ? fill("themesFewshot", { lines: lines.map((l) => `- ${l}`).join("\n") }) : "";
  const prompt = fill("themes", { fewshot, story: story.text });
  const { value: rows } = await p.invoke(null, null, "themes", prompt, (text) => {
    const ts = tags(text, "theme");
    if (!ts.length) throw new Error("no <theme> tags");
    return ts.slice(0, 4).map((t) => t.replace(/\s+/g, " ").trim());
  }, { storyId });
  const report: DraftReport = { story: storyId, drafted: rows.length, banked: 0, attested: 0, rejected: [] };
  const valid: string[] = [];
  for (const t of rows) {
    const why = validateTheme(t);
    if (why.length) report.rejected.push({ text: t, why });
    else valid.push(t);
  }
  const vecs = await embed(valid);
  for (let i = 0; i < valid.length; i++) {
    const text = valid[i], vec = vecs[i], id = themeId(text);
    if (p.db.query("SELECT 1 FROM themes WHERE id = ?").get(id)) continue;          // verbatim repeat
    const near = nearest(p.db, vec);
    let sameAs: string | null = null;
    if (near.length) {
      const banked = near.map((n) => `[${n.id}] ${n.text}`).join("\n");
      const { value } = await p.invoke(null, null, "redundancy", fill("redundancy", { candidate: text, banked }), (out) => {
        const m = /same:\s*([0-9a-f]{12})/i.exec(out);
        if (m) { if (!near.some((n) => n.id === m[1])) throw new Error(`same:${m[1]} names a theme not offered`); return m[1]; }
        if (/\bdifferent\b/i.test(out)) return null;
        throw new Error("neither same:<id> nor different");
      }, { storyId });
      sameAs = value;
    }
    if (sameAs) {
      const t = p.db.query("SELECT stories FROM themes WHERE id = ?").get(sameAs) as any;
      const stories = JSON.parse(t.stories) as string[];
      if (!stories.includes(storyId)) stories.push(storyId);
      p.db.query("UPDATE themes SET attestation = attestation + 1, stories = ? WHERE id = ?").run(JSON.stringify(stories), sameAs);
      p.db.query("INSERT INTO themes (id, text, attestation, stories, embedding, drafted_at, duplicate_of) VALUES (?, ?, 0, ?, ?, ?, ?)").run(id, text, JSON.stringify([storyId]), toBlob(vec), now(), sameAs);
      logEvent({ type: "attest", id: sameAs, story: storyId, candidate: text, at: now() }, log);
      report.attested++;
    } else {
      p.db.query("INSERT INTO themes (id, text, attestation, stories, embedding, drafted_at) VALUES (?, ?, 1, ?, ?, ?)").run(id, text, JSON.stringify([storyId]), toBlob(vec), now());
      logEvent({ type: "bank", id, text, story: storyId, at: now() }, log);
      report.banked++;
    }
  }
  p.db.query("INSERT OR REPLACE INTO theme_drafts (story_id, at, drafted, banked, attested, rejected) VALUES (?, ?, ?, ?, ?, ?)")
    .run(storyId, now(), report.drafted, report.banked, report.attested, report.rejected.length);
  return report;
}

/**
 * Draft every story not already drafted or given up on. A story whose model
 * call fails — the safeguards refuse a passage, the shape never parses — is
 * recorded in theme_failures and skipped here and by every later run, so one
 * story cannot end a batch of six hundred. Clear its row to try it again.
 *
 * Progress goes to stdout as it happens: the reports below are printed only
 * once the whole batch is done, which tells you nothing while it runs.
 */
export async function draftAll(p: Pipeline, opts: { only?: string[]; limit?: number } = {}, embed: Embedder = pythonEmbedder, log: string = THEME_LOG): Promise<DraftReport[]> {
  const where = opts.only?.length ? `AND source_id IN (${opts.only.map(() => "?").join(",")})` : "";
  const rows = p.db.query(`SELECT id FROM stories WHERE id NOT IN (SELECT story_id FROM theme_drafts) AND id NOT IN (SELECT story_id FROM theme_failures) ${where} ORDER BY source_id, ord ${opts.limit ? `LIMIT ${opts.limit}` : ""}`).all(...(opts.only ?? [])) as { id: string }[];
  const out: DraftReport[] = [];
  for (const [i, r] of rows.entries()) {
    const at = `[${i + 1}/${rows.length}] ${r.id}`;
    try {
      const report = await draftStory(p, r.id, embed, log);
      out.push(report);
      console.log(`${at}: ${report.banked} banked, ${report.attested} attested, ${report.rejected.length} rejected`);
    } catch (e) {
      const reason = e instanceof StepFailure ? e.reason : "error";
      const stage = e instanceof StepFailure ? e.step.stage : "themes";
      const error = String((e as any)?.message ?? e);
      p.db.query("INSERT OR REPLACE INTO theme_failures (story_id, stage, reason, error, at) VALUES (?, ?, ?, ?, ?)")
        .run(r.id, stage, reason, error.slice(0, 1000), now());
      console.log(`${at}: SKIPPED ${stage} ${reason}`);
    }
  }
  return out;
}

/** The stories given up on since `since`, one line each. */
export function failures(db: Db, since: string): string[] {
  const rows = db.query("SELECT story_id, stage, reason, error FROM theme_failures WHERE at >= ? ORDER BY at").all(since) as { story_id: string; stage: string; reason: string; error: string }[];
  return rows.map((r) => `SKIPPED ${r.story_id}: ${r.stage} ${r.reason} :: ${r.error.replace(/\s+/g, " ").slice(0, 160)}`);
}

export function histogram(db: Db, since: string): string {
  const rows = db.query("SELECT text FROM themes WHERE duplicate_of IS NULL AND drafted_at >= ?").all(since) as { text: string }[];
  if (!rows.length) return "no themes banked this draw";
  const ws = rows.map((r) => words(r.text)).sort((a, b) => a - b);
  const bins = new Map<number, number>();
  for (const w of ws) bins.set(Math.floor(w / 5) * 5, (bins.get(Math.floor(w / 5) * 5) ?? 0) + 1);
  const semi = rows.filter((r) => r.text.includes(";")).length, colon = rows.filter((r) => r.text.includes(":")).length;
  return `${rows.length} banked · words ${[...bins].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}–${k + 4}: ${v}`).join(" · ")} · median ${ws[Math.floor(ws.length / 2)]} · semicolons ${semi} · colons ${colon}`;
}
