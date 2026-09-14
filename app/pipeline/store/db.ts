import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB, SCHEMA } from "../paths.ts";
import { replay } from "../verdicts.ts";
import { drawNames } from "../names.ts";

export type Db = Database;

/** Bump with every change to an existing table, and mirror it in extract/store.py. */
export const SCHEMA_VERSION = 9;

/** `log` is the verdict log a migration replays from; only tests pass it. */
export function openDb(path: string = DEFAULT_DB, log?: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  const fresh = !hasTable(db, "verdicts");
  if (!fresh) renameBeforeSchema(db);
  const schema = readFileSync(SCHEMA, "utf8");
  db.exec(schema);
  if (fresh) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  else migrate(db, schema, log);
  indexes(db);
  return db;
}

/**
 * Indexes a migration must precede, because schema.sql runs before the
 * columns they cover exist. All three serve a count or a group-by that
 * otherwise scans the passage text or the theme embeddings: the status view
 * fell from 2.3s to 70ms, the facets from 320ms to 20.
 */
function indexes(db: Db) {
  db.exec("CREATE INDEX IF NOT EXISTS passages_suspect ON passages(id) WHERE suspect IS NOT NULL");
  db.exec("CREATE INDEX IF NOT EXISTS themes_live ON themes(id) WHERE duplicate_of IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS passages_cell ON passages(voice, mode)");   // the browse facets count by cell
}

function userVersion(db: Db): number {
  return (db.query("PRAGMA user_version").get() as any).user_version;
}
function hasTable(db: Db, name: string): boolean {
  return !!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}
function columns(db: Db, table: string): string[] {
  return (db.query(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name);
}

/**
 * Renames that must happen before schema.sql runs, or its CREATE TABLE IF NOT
 * EXISTS would leave an empty table under the new name beside the old one.
 *
 *   1 -> 2  runs became draws; steps.run_id became steps.draw_id.
 */
function renameBeforeSchema(db: Db) {
  if (userVersion(db) < 2 && hasTable(db, "runs")) {
    if (hasTable(db, "draws")) {
      const n = (db.query("SELECT count(*) AS n FROM draws").get() as any).n;
      if (n > 0) throw new Error("store has both runs and a non-empty draws table; resolve by hand");
      db.exec("DROP TABLE draws");
    }
    db.exec("ALTER TABLE runs RENAME TO draws");
    if (columns(db, "steps").includes("run_id")) db.exec("ALTER TABLE steps RENAME COLUMN run_id TO draw_id");
    db.exec("DROP INDEX IF EXISTS steps_run");
  }
}

/**
 * Bring an existing store up to SCHEMA_VERSION. The verdicts table is a replay
 * of the log, so a change to it is a drop, recreate and replay.
 *
 *   0 -> 1  verdicts.kind gains 'story', verdicts.method gains 'run';
 *           passages gains the suspect column.
 *   1 -> 2  verdicts.kind 'packet' is 'brief' and method 'run' is 'draw';
 *           artifacts of kind 'packet' are 'brief'. Tables were renamed above.
 *   2 -> 3  draws gains the domains column (typed settings).
 *   3 -> 4  verdicts.kind gains 'finding' and 'draft'; draws gains repaired_from
 *           and draft_config; steps gains tools (drafting pipeline).
 *   4 -> 5  draws gains forked_from: a second candidate developed on its own.
 *   5 -> 6  draws gains sampling; every draw made before it sampled the tail.
 *   6 -> 7  draws gains archived_at: hidden from the lists, otherwise untouched.
 *   7 -> 8  draws gains name, backfilled with the names the UI was deriving,
 *           so no draw is renamed by the change.
 *   8 -> 9  draws loses domains: a setting loads whole lists, so a draw
 *           selects nothing before the premise exists (four lists).
 */
function migrate(db: Db, schema: string, log?: string) {
  if (userVersion(db) < 1) {
    db.exec("DROP TABLE verdicts");
    db.exec(schema);
    if (!columns(db, "passages").includes("suspect")) db.exec("ALTER TABLE passages ADD COLUMN suspect TEXT");
    replay(db, log);
    db.exec("PRAGMA user_version = 1");
  }
  if (userVersion(db) < 2) {
    db.exec("DROP TABLE verdicts");
    db.exec(schema);
    replay(db, log);
    db.exec("UPDATE artifacts SET kind = 'brief' WHERE kind = 'packet'");
    db.exec("PRAGMA user_version = 2");
  }
  if (userVersion(db) < 3) {
    if (!columns(db, "draws").includes("domains")) db.exec("ALTER TABLE draws ADD COLUMN domains TEXT");
    db.exec("PRAGMA user_version = 3");
  }
  if (userVersion(db) < 4) {
    db.exec("DROP TABLE verdicts");
    db.exec(schema);
    replay(db, log);
    if (!columns(db, "draws").includes("repaired_from")) db.exec("ALTER TABLE draws ADD COLUMN repaired_from TEXT REFERENCES draws(id)");
    if (!columns(db, "draws").includes("draft_config")) db.exec("ALTER TABLE draws ADD COLUMN draft_config TEXT");
    if (!columns(db, "steps").includes("tools")) db.exec("ALTER TABLE steps ADD COLUMN tools TEXT NOT NULL DEFAULT ''");
    db.exec("PRAGMA user_version = 4");
  }
  if (userVersion(db) < 5) {
    if (!columns(db, "draws").includes("forked_from")) db.exec("ALTER TABLE draws ADD COLUMN forked_from TEXT REFERENCES draws(id)");
    db.exec("PRAGMA user_version = 5");
  }
  if (userVersion(db) < 6) {
    if (!columns(db, "draws").includes("sampling")) db.exec("ALTER TABLE draws ADD COLUMN sampling TEXT NOT NULL DEFAULT 'tail'");
    db.exec("PRAGMA user_version = 6");
  }
  if (userVersion(db) < 7) {
    if (!columns(db, "draws").includes("archived_at")) db.exec("ALTER TABLE draws ADD COLUMN archived_at TEXT");
    db.exec("PRAGMA user_version = 7");
  }
  if (userVersion(db) < 8) {
    if (!columns(db, "draws").includes("name")) db.exec("ALTER TABLE draws ADD COLUMN name TEXT");
    const rows = db.query("SELECT id, seed_text, created_at FROM draws").all() as { id: string; seed_text: string; created_at: string }[];
    const upd = db.query("UPDATE draws SET name = ? WHERE id = ?");
    for (const [id, name] of drawNames(rows)) upd.run(name, id);
    db.exec("PRAGMA user_version = 8");
  }
  if (userVersion(db) < 9) {
    if (columns(db, "draws").includes("domains")) db.exec("ALTER TABLE draws DROP COLUMN domains");
    db.exec("PRAGMA user_version = 9");
  }
}

export type PassageRow = {
  id: string; story_id: string; text: string; words: number; stratum: number; position: number;
  seed: number; withheld: number; suspect: string | null; d1: number | null; d2: number | null; d3: number | null;
  d4: number | null; d5: number | null; d6: number | null; voice: string | null; mode: string | null;
  first_seen: string;
};
export type StoryRow = {
  id: string; source_id: string; ord: number; title: string; author: string; genre: string;
  words: number; text: string; locator: string; split_by: string;
};
export type ThemeRow = {
  id: string; text: string; attestation: number; stories: string; embedding: Uint8Array | null;
  drafted_at: string; duplicate_of: string | null;
};
