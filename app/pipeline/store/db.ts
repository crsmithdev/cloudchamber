import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB, SCHEMA } from "../paths.ts";

export type Db = Database;

/** Bump with every change to an existing table, and mirror it in extract/store.py. */
export const SCHEMA_VERSION = 17;

export function openDb(path: string = DEFAULT_DB): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  // a second process on one store (the service and a CLI run) waits for the writer instead of failing at once with "database is locked"
  db.exec("PRAGMA busy_timeout=5000");
  // the store is over 100 MB on a slow mount; the default 2 MB cache re-reads pages on every scan
  db.exec("PRAGMA cache_size=-131072");
  const fresh = !hasTable(db, "verdicts");
  if (!fresh) requireCurrent(db, path);
  db.exec(readFileSync(SCHEMA, "utf8"));
  if (fresh) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  indexes(db);
  return db;
}

/**
 * Indexes schema.sql does not carry, because each covers a count or a group-by
 * rather than the table's shape. The status view fell from 2.3s to 70ms with
 * them, the facets from 320ms to 20.
 */
function indexes(db: Db) {
  db.exec("CREATE INDEX IF NOT EXISTS passages_suspect ON passages(id) WHERE suspect IS NOT NULL");
  db.exec("CREATE INDEX IF NOT EXISTS themes_live ON themes(id) WHERE duplicate_of IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS passages_cell ON passages(voice, mode)");   // the browse facets count by cell
  db.exec("CREATE INDEX IF NOT EXISTS artifacts_step ON artifacts(step_id)");     // a draw's artifacts join through its steps
}

function userVersion(db: Db): number {
  return (db.query("PRAGMA user_version").get() as any).user_version;
}
function hasTable(db: Db, name: string): boolean {
  return !!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}
/**
 * Refuse a store older than SCHEMA_VERSION. The migrations that brought a
 * store from version 1 up to 11 were removed once every live store was at 11;
 * they are still in git, so an older file is opened by checking out the commit
 * named below, opening it once so it migrates in place, and coming back. The
 * arms below run in order, so a store at 11 climbs to SCHEMA_VERSION in one
 * open.
 */
function requireCurrent(db: Db, path: string) {
  const at = userVersion(db);
  if (at >= SCHEMA_VERSION) return;
  // 11 → 12 (2026-09-20): a usage column on steps and a models column on draws; both nullable, no data moves
  if (at === 11) {
    db.exec("ALTER TABLE steps ADD COLUMN usage TEXT");
    db.exec("ALTER TABLE draws ADD COLUMN models TEXT");
    db.exec("PRAGMA user_version = 12");
  }
  // 12 → 13 (2026-09-24): the branch link on draws and the tree a step ran from; all nullable, no data moves
  if (userVersion(db) === 12) {
    db.exec("ALTER TABLE steps ADD COLUMN version TEXT");
    db.exec("ALTER TABLE draws ADD COLUMN branched_from TEXT REFERENCES draws(id)");
    db.exec("ALTER TABLE draws ADD COLUMN branch_at TEXT");
    db.exec("PRAGMA user_version = 13");
  }
  // 13 → 14 (2026-09-24): the process that owns a running step, so recovery cannot kill a live one
  if (userVersion(db) === 13) {
    db.exec("ALTER TABLE steps ADD COLUMN pid INTEGER");
    db.exec("PRAGMA user_version = 14");
  }
  // 14 → 15 (2026-09-27): where a held draw goes back, written by the hold, so recovery reads it instead of guessing; no data moves
  if (userVersion(db) === 14) {
    db.exec("ALTER TABLE draws ADD COLUMN hold_back TEXT");
    db.exec("ALTER TABLE draws ADD COLUMN hold_undo TEXT");
    db.exec("PRAGMA user_version = 15");
  }
  // 15 → 16 (2026-09-27): the check pass a step belongs to. A pass id is the time it began, so each earlier check step
  // takes the latest of its draw's passes that began at or before it. A pass that failed partway left no pass of its own,
  // and its steps join the pass before it, which is where the old reading by position put them too.
  if (userVersion(db) === 15) {
    db.exec("ALTER TABLE steps ADD COLUMN pass TEXT");
    db.exec(`WITH passes AS (
        SELECT DISTINCT s.draw_id, json_extract(a.meta, '$.pass') AS pass
        FROM artifacts a JOIN steps s ON s.id = a.step_id
        WHERE json_extract(a.meta, '$.pass') IS NOT NULL
          AND (a.kind = 'pass'
            OR (a.kind = 'ledger' AND coalesce(json_extract(a.meta, '$.ledger_only'), 0) = 0)
            OR (a.kind IN ('finding', 'profile') AND json_extract(a.meta, '$.source') = 'check')))
      UPDATE steps SET pass = (SELECT max(p.pass) FROM passes p WHERE p.draw_id = steps.draw_id AND p.pass <= steps.started_at)
      WHERE stage LIKE 'check-%'`);
    db.exec("PRAGMA user_version = 16");
  }
  // 16 → 17 (2026-09-27): why a finding was dismissed, so each checker's precision can be counted
  if (userVersion(db) === 16) {
    db.exec("ALTER TABLE verdicts ADD COLUMN reason TEXT");
    db.exec("PRAGMA user_version = 17");
    return;
  }
  throw new Error(
    `${path} is at schema ${at}, and this build reads ${SCHEMA_VERSION} only (11 and 12 migrate in place). ` +
    `The migrations below 11 were removed in 7978c4d..HEAD; to open it, run ` +
    `\`git stash && git checkout 7978c4d\`, open the file once so it migrates, then come back.`,
  );
}

export type PassageRow = {
  id: string; story_id: string; text: string; words: number; stratum: number; position: number;
  seed: number; withheld: number; suspect: string | null; d1: number | null; d2: number | null; d3: number | null;
  d4: number | null; d5: number | null; d6: number | null; voice: string | null; mode: string | null;
  first_seen: string;
};
export type ThemeRow = {
  id: string; text: string; attestation: number; stories: string; embedding: Uint8Array | null;
  drafted_at: string; duplicate_of: string | null;
};
