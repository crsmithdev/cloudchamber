/**
 * Export the eligible bank to plain files a skill can read without the store.
 *   corpus/examples/<source>.md every eligible passage of that source, verbatim
 *   bank/themes.md              every eligible theme with its attestation
 * Passed or artifact-flagged items never appear, nor any passage of a passed
 * story. Rebuildable; tracked anyway.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BANK, EXAMPLES } from "./paths.ts";
import type { Db, PassageRow, ThemeRow } from "./store/db.ts";
import { INELIGIBLE_SQL, eligibleIds } from "./verdicts.ts";

export type Segment = { source?: string | string[]; author?: string; genre?: string };

/** A segment's sources as a list; one source and none are the same shape as many. */
export const sourceIds = (source: Segment["source"]): string[] => (Array.isArray(source) ? source : source ? [source] : []);

/**
 * A source's display name, read off its own file: "Ellen Datlow - The Best
 * Horror of the Year Volume 01" is that volume under that editor, so the
 * start form can group the anthologies together. A glob or a file with no
 * author in its name falls back to the id.
 */
export function sourceLabel(id: string, path: string): { group: string; title: string } {
  const base = (path.split("/").pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "");
  const m = /^(.+?) - (.+)$/.exec(base);
  return m ? { group: m[1].trim(), title: m[2].trim() } : { group: id, title: id };
}

export function eligiblePassages(db: Db, seg: Segment = {}): (PassageRow & { title: string; author: string; genre: string; source_id: string })[] {
  const where: string[] = [`s.id NOT IN (${INELIGIBLE_SQL})`], args: any[] = ["story"];
  const sources = sourceIds(seg.source);
  if (sources.length) { where.push(`s.source_id IN (${sources.map(() => "?").join(", ")})`); args.push(...sources); }
  if (seg.author) { where.push("lower(s.author) = lower(?)"); args.push(seg.author); }
  if (seg.genre) { where.push("s.genre = ?"); args.push(seg.genre); }
  const rows = db.query(
    `SELECT p.*, s.title, s.author, s.genre, s.source_id FROM passages p JOIN stories s ON s.id = p.story_id
     WHERE ${where.join(" AND ")} ORDER BY s.source_id, s.ord, p.position`,
  ).all(...args) as any[];
  const ok = eligibleIds(db, "example", rows.map((r) => r.id));
  return rows.filter((r) => ok.has(r.id));
}

/**
  * How many passages are eligible, in total and per source. The status view
  * wants the counts, not four thousand rows of prose, and a theme row carries
  * its embedding.
  */
export function eligibleCounts(db: Db): { passages: number; themes: number; bySource: Map<string, number> } {
  // count them all, then subtract the few that are out. A NOT IN on p.id costs the
  // covering index and the scan goes from 50ms to 400; an IN on a handful does not.
  const ids = (kind: string) => (db.query(INELIGIBLE_SQL).all(kind) as { target_id: string }[]).map((r) => r.target_id);
  const list = (xs: string[]) => xs.map(() => "?").join(", ");
  const bySource = new Map<string, number>();
  const all = db.query(`SELECT s.source_id AS source, count(*) AS n FROM passages p JOIN stories s ON s.id = p.story_id GROUP BY s.source_id`).all() as { source: string; n: number }[];
  for (const r of all) bySource.set(r.source, r.n);
  const badStories = ids("story"), badExamples = ids("example"), badThemes = ids("theme");
  const drop = (source: string, n: number) => bySource.set(source, (bySource.get(source) ?? 0) - n);
  // one lookup per ineligible item, each on a primary key. An OR across the two tables scans instead.
  const perStory = db.query("SELECT source_id AS source, (SELECT count(*) FROM passages p WHERE p.story_id = stories.id) AS n FROM stories WHERE id = ?");
  for (const id of badStories) { const r = perStory.get(id) as { source: string; n: number } | null; if (r) drop(r.source, r.n); }
  const perPassage = db.query("SELECT s.source_id AS source, s.id AS story FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?");
  const gone = new Set(badStories);
  for (const id of badExamples) { const r = perPassage.get(id) as { source: string; story: string } | null; if (r && !gone.has(r.story)) drop(r.source, 1); }
  const live = (db.query("SELECT count(*) AS n FROM themes WHERE duplicate_of IS NULL").get() as { n: number }).n;
  const outThemes = badThemes.length
    ? (db.query(`SELECT count(*) AS n FROM themes WHERE duplicate_of IS NULL AND id IN (${list(badThemes)})`).get(...badThemes) as { n: number }).n
    : 0;
  return { passages: [...bySource.values()].reduce((a, n) => a + n, 0), themes: live - outThemes, bySource };
}

export function eligibleThemes(db: Db): ThemeRow[] {
  const rows = db.query("SELECT * FROM themes WHERE duplicate_of IS NULL ORDER BY drafted_at, rowid").all() as ThemeRow[];
  const ok = eligibleIds(db, "theme", rows.map((r) => r.id));
  return rows.filter((r) => ok.has(r.id));
}

/** The passages go to `examples`, which is private; the themes go to `bank`, which is tracked. */
export function exportBank(db: Db, { bank = BANK, examples = EXAMPLES }: { bank?: string; examples?: string } = {}): { files: string[]; passages: number; themes: number } {
  mkdirSync(examples, { recursive: true });
  mkdirSync(bank, { recursive: true });
  for (const f of readdirSync(examples)) if (f.endsWith(".md")) rmSync(join(examples, f));
  const passages = eligiblePassages(db);
  const bySource = new Map<string, typeof passages>();
  for (const p of passages) {
    if (!bySource.has(p.source_id)) bySource.set(p.source_id, []);
    bySource.get(p.source_id)!.push(p);
  }
  const files: string[] = [];
  for (const [source, rows] of bySource) {
    const out = [`# ${source}`, "", `${rows.length} eligible passages. Verbatim prose; each entry carries its provenance and facet cell.`, ""];
    for (const p of rows) {
      out.push(`### ${p.title} — ${p.author || "unknown"} · ${p.genre} · ${p.voice ?? "?"}/${p.mode ?? "?"} · ${p.id}`, "", p.text, "");
    }
    const path = join(examples, `${source}.md`);
    writeFileSync(path, out.join("\n"));
    files.push(path);
  }
  const themes = eligibleThemes(db);
  const tOut = ["# themes", "", `${themes.length} eligible themes. One sentence each; attestation is how many stories drafted it.`, ""];
  for (const t of themes) tOut.push(`- ${t.text}  \n  ×${t.attestation} · ${JSON.parse(t.stories).join(", ")} · ${t.id}`);
  const tPath = join(bank, "themes.md");
  writeFileSync(tPath, tOut.join("\n") + "\n");
  files.push(tPath);
  return { files, passages: passages.length, themes: themes.length };
}
