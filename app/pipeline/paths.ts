import { resolve } from "node:path";

/** Repo root: this file lives at app/pipeline/paths.ts. */
export const ROOT = resolve(import.meta.dir, "..", "..");
export const BANK = resolve(ROOT, "bank");
export const PACKETS = resolve(ROOT, "packets");
export const VERDICT_LOG = resolve(BANK, "verdicts.jsonl");
export const THEME_LOG = resolve(BANK, "themes.jsonl");
export const SCHEMA = resolve(ROOT, "app", "pipeline", "store", "schema.sql");
export const DEFAULT_DB = process.env.FOGBELT_DB ?? resolve(ROOT, "data", "fogbelt.db");

export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
