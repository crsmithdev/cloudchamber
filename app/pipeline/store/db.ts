import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB, SCHEMA } from "../paths.ts";
import { replay } from "../verdicts.ts";

export type Db = Database;

/** Bump with every change to an existing table, and mirror it in extract/store.py. */
export const SCHEMA_VERSION = 1;

/** `log` is the verdict log a migration replays from; only tests pass it. */
export function openDb(path: string = DEFAULT_DB, log?: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  const fresh = !db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'verdicts'").get();
  const schema = readFileSync(SCHEMA, "utf8");
  db.exec(schema);
  if (fresh) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  else migrate(db, schema, log);
  return db;
}

function userVersion(db: Db): number {
  return (db.query("PRAGMA user_version").get() as any).user_version;
}

/**
 * Bring an existing store up to SCHEMA_VERSION. The verdicts table is a replay
 * of the log, so a change to it is a drop, recreate and replay.
 *
 *   0 -> 1  verdicts.kind gains 'story', verdicts.method gains 'run';
 *           passages gains the suspect column.
 */
function migrate(db: Db, schema: string, log?: string) {
  if (userVersion(db) < 1) {
    db.exec("DROP TABLE verdicts");
    db.exec(schema);
    const cols = (db.query("PRAGMA table_info(passages)").all() as any[]).map((c) => c.name);
    if (!cols.includes("suspect")) db.exec("ALTER TABLE passages ADD COLUMN suspect TEXT");
    replay(db, log);
    db.exec("PRAGMA user_version = 1");
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
