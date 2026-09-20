import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB, SCHEMA } from "../paths.ts";

export type Db = Database;

/** Bump with every change to an existing table, and mirror it in extract/store.py. */
export const SCHEMA_VERSION = 12;

export function openDb(path: string = DEFAULT_DB): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
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
 * named below, opening it once so it migrates in place, and coming back.
 */
function requireCurrent(db: Db, path: string) {
  const at = userVersion(db);
  if (at >= SCHEMA_VERSION) return;
  // 11 → 12 (2026-09-20): a usage column on steps and a models column on draws; both nullable, no data moves
  if (at === 11) {
    db.exec("ALTER TABLE steps ADD COLUMN usage TEXT");
    db.exec("ALTER TABLE draws ADD COLUMN models TEXT");
    db.exec("PRAGMA user_version = 12");
    return;
  }
  throw new Error(
    `${path} is at schema ${at}, and this build reads ${SCHEMA_VERSION} only (11 migrates in place). ` +
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
export type StoryRow = {
  id: string; source_id: string; ord: number; title: string; author: string; genre: string;
  words: number; text: string; locator: string; split_by: string;
};
export type ThemeRow = {
  id: string; text: string; attestation: number; stories: string; embedding: Uint8Array | null;
  drafted_at: string; duplicate_of: string | null;
};
