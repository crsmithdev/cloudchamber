import type { Db } from "./store/db.ts";
import { eligibleCounts } from "./bank.ts";
import { passedStories } from "./verdicts.ts";

export function status(db: Db) {
  const count = (sql: string) => (db.query(sql).get() as any)?.n ?? 0;
  const perSource = db.query("SELECT s.source_id AS source, count(*) AS n FROM passages p JOIN stories s ON s.id = p.story_id GROUP BY s.source_id").all() as { source: string; n: number }[];
  const eligible = eligibleCounts(db);
  const byStatus = db.query("SELECT status, count(*) AS n FROM draws WHERE archived_at IS NULL GROUP BY status").all() as { status: string; n: number }[];
  return {
    sources: count("SELECT count(*) AS n FROM sources"),
    stories: count("SELECT count(*) AS n FROM stories"),
    stories_passed: passedStories(db).size,
    passages: count("SELECT count(*) AS n FROM passages"),
    passages_eligible: eligible.passages,
    passages_suspect: count("SELECT count(*) AS n FROM passages WHERE suspect IS NOT NULL"),
    per_source: perSource.map((r) => ({ ...r, eligible: eligible.bySource.get(r.source) ?? 0 })),
    themes: count("SELECT count(*) AS n FROM themes WHERE duplicate_of IS NULL"),
    themes_eligible: eligible.themes,
    verdicts: count("SELECT count(*) AS n FROM verdicts"),
    draws: byStatus,
    // how many stories need a person, which the rail shows: the list's "needs you" group (docs/specs/2026-09-30-stories.md
    // rule 1), so a draw a redraw replaced stays out, as does `awaiting_check_gate`, which the list files under "other"
    needs: count("SELECT count(*) AS n FROM draws WHERE archived_at IS NULL AND superseded_by IS NULL AND status IN ('awaiting_gate', 'done', 'awaiting_plan_gate', 'awaiting_draft_gate')"),
    facet_fit: db.query("SELECT backend, n, fitted_at FROM facet_fit WHERE id = 1").get(),
  };
}
