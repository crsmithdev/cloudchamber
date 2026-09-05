/**
 * Export the eligible bank to plain files a skill can read without the store.
 *   bank/examples/<source>.md   every eligible passage of that source, verbatim
 *   bank/themes.md              every eligible theme with its attestation
 * Passed or artifact-flagged items never appear, nor any passage of a passed
 * story. Rebuildable; tracked anyway.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BANK } from "./paths.ts";
import type { Db, PassageRow, StoryRow, ThemeRow } from "./store/db.ts";
import { INELIGIBLE_SQL, eligibleIds } from "./verdicts.ts";

export type Segment = { source?: string; author?: string; genre?: string };

export function eligiblePassages(db: Db, seg: Segment = {}): (PassageRow & { title: string; author: string; genre: string; source_id: string })[] {
  const where: string[] = [`s.id NOT IN (${INELIGIBLE_SQL})`], args: any[] = ["story"];
  if (seg.source) { where.push("s.source_id = ?"); args.push(seg.source); }
  if (seg.author) { where.push("lower(s.author) = lower(?)"); args.push(seg.author); }
  if (seg.genre) { where.push("s.genre = ?"); args.push(seg.genre); }
  const rows = db.query(
    `SELECT p.*, s.title, s.author, s.genre, s.source_id FROM passages p JOIN stories s ON s.id = p.story_id
     WHERE ${where.join(" AND ")} ORDER BY s.source_id, s.ord, p.position`,
  ).all(...args) as any[];
  const ok = eligibleIds(db, "example", rows.map((r) => r.id));
  return rows.filter((r) => ok.has(r.id));
}

export function eligibleThemes(db: Db): ThemeRow[] {
  const rows = db.query("SELECT * FROM themes WHERE duplicate_of IS NULL ORDER BY drafted_at").all() as ThemeRow[];
  const ok = eligibleIds(db, "theme", rows.map((r) => r.id));
  return rows.filter((r) => ok.has(r.id));
}

export function exportBank(db: Db, dir: string = BANK): { files: string[]; passages: number; themes: number } {
  const exDir = join(dir, "examples");
  mkdirSync(exDir, { recursive: true });
  for (const f of readdirSync(exDir)) if (f.endsWith(".md")) rmSync(join(exDir, f));
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
    const path = join(exDir, `${source}.md`);
    writeFileSync(path, out.join("\n"));
    files.push(path);
  }
  const themes = eligibleThemes(db);
  const tOut = ["# themes", "", `${themes.length} eligible themes. One sentence each; attestation is how many stories drafted it.`, ""];
  for (const t of themes) tOut.push(`- ${t.text}  \n  ×${t.attestation} · ${JSON.parse(t.stories).join(", ")} · ${t.id}`);
  const tPath = join(dir, "themes.md");
  writeFileSync(tPath, tOut.join("\n") + "\n");
  files.push(tPath);
  return { files, passages: passages.length, themes: themes.length };
}
