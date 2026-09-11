import { resolve } from "node:path";

/** Repo root: this file lives at app/pipeline/paths.ts. */
export const ROOT = resolve(import.meta.dir, "..", "..");
/** CLOUDCHAMBER_BANK and CLOUDCHAMBER_BRIEFS relocate the tracked files; the test preload sets them to a temp dir. */
export const BANK = process.env.CLOUDCHAMBER_BANK ?? resolve(ROOT, "bank");
export const BRIEFS = process.env.CLOUDCHAMBER_BRIEFS ?? resolve(ROOT, "briefs");
export const DRAFTS = process.env.CLOUDCHAMBER_DRAFTS ?? resolve(ROOT, "drafts");
/** CLOUDCHAMBER_SETTINGS relocates sources/settings; tests point it at a fixture directory. */
export const SETTINGS = process.env.CLOUDCHAMBER_SETTINGS ?? resolve(ROOT, "sources", "settings");
export const VERDICT_LOG = resolve(BANK, "verdicts.jsonl");
export const THEME_LOG = resolve(BANK, "themes.jsonl");
export const SCHEMA = resolve(ROOT, "app", "pipeline", "store", "schema.sql");
export const DEFAULT_DB = process.env.CLOUDCHAMBER_DB ?? resolve(ROOT, "data", "cloudchamber.db");

export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
