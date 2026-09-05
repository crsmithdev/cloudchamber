import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_DB, SCHEMA } from "../paths.ts";

export type Db = Database;

export function openDb(path: string = DEFAULT_DB): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(require("node:fs").readFileSync(SCHEMA, "utf8"));
  return db;
}

export type PassageRow = {
  id: string; story_id: string; text: string; words: number; stratum: number; position: number;
  seed: number; withheld: number; d1: number | null; d2: number | null; d3: number | null;
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
