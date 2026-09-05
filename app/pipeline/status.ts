import type { Db } from "./store/db.ts";
import { eligiblePassages, eligibleThemes } from "./bank.ts";
import { passedStories } from "./verdicts.ts";

export function status(db: Db) {
  const count = (sql: string) => (db.query(sql).get() as any)?.n ?? 0;
  const perSource = db.query("SELECT s.source_id AS source, count(*) AS n FROM passages p JOIN stories s ON s.id = p.story_id GROUP BY s.source_id").all() as { source: string; n: number }[];
  const eligible = eligiblePassages(db);
  const eligibleBySource = new Map<string, number>();
  for (const p of eligible) eligibleBySource.set(p.source_id, (eligibleBySource.get(p.source_id) ?? 0) + 1);
  return {
    sources: count("SELECT count(*) AS n FROM sources"),
    stories: count("SELECT count(*) AS n FROM stories"),
    stories_passed: passedStories(db).size,
    passages: count("SELECT count(*) AS n FROM passages"),
    passages_eligible: eligible.length,
    passages_suspect: count("SELECT count(*) AS n FROM passages WHERE suspect IS NOT NULL"),
    per_source: perSource.map((r) => ({ ...r, eligible: eligibleBySource.get(r.source) ?? 0 })),
    themes: count("SELECT count(*) AS n FROM themes WHERE duplicate_of IS NULL"),
    themes_eligible: eligibleThemes(db).length,
    verdicts: count("SELECT count(*) AS n FROM verdicts"),
    draws: db.query("SELECT status, count(*) AS n FROM draws GROUP BY status").all(),
    facet_fit: db.query("SELECT backend, n, fitted_at FROM facet_fit WHERE id = 1").get(),
  };
}
