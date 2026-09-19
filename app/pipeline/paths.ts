import { homedir } from "node:os";
import { resolve } from "node:path";

/** Repo root: this file lives at app/pipeline/paths.ts. */
export const ROOT = resolve(import.meta.dir, "..", "..");
/** CLOUDCHAMBER_BANK and CLOUDCHAMBER_BRIEFS relocate the tracked files; the test preload sets them to a temp dir. */
export const BANK = process.env.CLOUDCHAMBER_BANK ?? resolve(ROOT, "bank");
export const BRIEFS = process.env.CLOUDCHAMBER_BRIEFS ?? resolve(ROOT, "briefs");
export const DRAFTS = process.env.CLOUDCHAMBER_DRAFTS ?? resolve(ROOT, "drafts");
/** CLOUDCHAMBER_SETTINGS relocates sources/settings; tests point it at a fixture directory. */
export const SETTINGS = process.env.CLOUDCHAMBER_SETTINGS ?? resolve(ROOT, "sources", "settings");
/** The narrated stories a draft is measured against for listenability: one transcript JSON per video, by channel. */
export const NARRATION = process.env.CLOUDCHAMBER_NARRATION ?? resolve(ROOT, "evals", "reference");
export const VERDICT_LOG = resolve(BANK, "verdicts.jsonl");
export const THEME_LOG = resolve(BANK, "themes.jsonl");
export const SCHEMA = resolve(ROOT, "app", "pipeline", "store", "schema.sql");
/**
 * The store lives on the Linux filesystem, not under the repo: the repo is on
 * the Windows mount, where the same reads cost about ten times as much (245 ms
 * against 2,670 ms for one pass over every draw's findings). It is rebuildable
 * from sources/ and bank/, so nothing tracked moves with it.
 */
export const DEFAULT_DB = process.env.CLOUDCHAMBER_DB ?? resolve(homedir(), ".cloudchamber", "cloudchamber.db");

export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
