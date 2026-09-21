import { homedir } from "node:os";
import { resolve } from "node:path";

/** Repo root: this file lives at app/pipeline/paths.ts. */
export const ROOT = resolve(import.meta.dir, "..", "..");
/** CLOUDCHAMBER_BANK and CLOUDCHAMBER_BRIEFS relocate the tracked files; the test preload sets them to a temp dir. */
export const BANK = process.env.CLOUDCHAMBER_BANK ?? resolve(ROOT, "bank");
export const BRIEFS = process.env.CLOUDCHAMBER_BRIEFS ?? resolve(ROOT, "briefs");
export const DRAFTS = process.env.CLOUDCHAMBER_DRAFTS ?? resolve(ROOT, "drafts");
/** One report per drafted draw: the story and everything that made it, as HTML and PDF. Not tracked. */
export const OUTPUT = process.env.CLOUDCHAMBER_OUTPUT ?? resolve(ROOT, "output");
/**
 * The private corpus, linked in as one directory: the books, the example bank,
 * the narration transcripts, the settings and the stories. It is not in this
 * repository; see the README.
 */
export const CORPUS = process.env.CLOUDCHAMBER_CORPUS ?? resolve(ROOT, "corpus");
/** CLOUDCHAMBER_SETTINGS relocates the settings; tests point it at a fixture directory. */
export const SETTINGS = process.env.CLOUDCHAMBER_SETTINGS ?? resolve(CORPUS, "settings");
/** The narrated stories a draft is measured against for listenability: one transcript JSON per video, by channel. */
export const NARRATION = process.env.CLOUDCHAMBER_NARRATION ?? resolve(CORPUS, "narration");
/** Every eligible passage, verbatim, one file per source; `export` writes it. */
export const EXAMPLES = process.env.CLOUDCHAMBER_EXAMPLES ?? resolve(CORPUS, "examples");
export const VERDICT_LOG = resolve(BANK, "verdicts.jsonl");
export const THEME_LOG = resolve(BANK, "themes.jsonl");
export const SCHEMA = resolve(ROOT, "app", "pipeline", "store", "schema.sql");
/**
 * The store lives on the Linux filesystem, not under the repo: the repo is on
 * the Windows mount, where the same reads cost about ten times as much (245 ms
 * against 2,670 ms for one pass over every draw's findings). It is rebuildable
 * from the corpus and bank/, so nothing tracked moves with it.
 */
export const DEFAULT_DB = process.env.CLOUDCHAMBER_DB ?? resolve(homedir(), ".cloudchamber", "cloudchamber.db");

export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
