/**
 * `cloudchamber distill <id> [--map|--reduce]`: build a setting's four lists
 * from its reference tree, in two passes, because no corpus here fits one
 * call.
 *
 *   map     one call per reference file; candidate entries append to
 *           sources/settings/<id>/candidates.jsonl with the file's topic.
 *           A file already in the sidecar is skipped, so a killed run
 *           resumes by re-running.
 *   reduce  one call per list over that list's candidates; dedupes, prefers
 *           the specific, cuts to the cap, and writes the list into the
 *           setting file in place.
 *
 * The sidecar is the point: changing a cap or the house style re-runs reduce
 * only — four calls, no corpus read. See docs/specs/2026-09-13-four-lists.md.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { RUN } from "./config.ts";
import type { Pipeline } from "./draw.ts";
import { StepFailure } from "./draw.ts";
import { tags, tag, words } from "./model.ts";
import { fill, TEMPLATES } from "./prompts.ts";
import {
  LISTS, isEmpty, lintSetting, formatFinding, parseSetting, replaceList, settingPath, referenceDir,
  type ListName, type Setting,
} from "./settings.ts";

export type DistillOpts = { map?: boolean; reduce?: boolean };
export type Candidate = { list: ListName; entry: string; source: string; file: string };

export const candidatesPath = (id: string, dir: string) => join(dir, id, "candidates.jsonl");

/** Every .md under the setting's reference/, recursively, as paths relative to reference/. */
export function referenceFiles(id: string, dir: string): string[] {
  const root = referenceDir(id, dir);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".md") && !name.startsWith("INDEX")) out.push(relative(root, p));
    }
  };
  walk(root);
  return out;
}

/** A reference file's front matter topic, and its prose with the front matter stripped. */
function readReference(path: string): { topic: string; text: string } {
  const raw = readFileSync(path, "utf8");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  const topic = m ? (/^topic:\s*(.+)$/m.exec(m[1])?.[1]?.trim() ?? "") : "";
  return { topic, text: (m ? raw.slice(m[0].length) : raw).trim() };
}

export function readCandidates(id: string, dir: string): Candidate[] {
  const path = candidatesPath(id, dir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Candidate);
}

const shape = () => fill("entryShape", { words: String(RUN.listCaps.words) });

/** The setting's matrix as a prompt block, or nothing: a setting need not have one. */
const matrixBlock = (s: Setting) => (isEmpty(s.sections.Matrix) ? "" : `\n## Matrix\n\n${s.sections.Matrix}\n`);

const parseEntries = (raw: string, list: ListName): string[] =>
  tags(tag(raw, list.toLowerCase()) ?? "", "entry").map((e) => e.trim()).filter(Boolean);

/**
 * Map: one call per reference file not already in the sidecar. Returns a
 * report line per file.
 */
export async function distillMap(p: Pipeline, id: string, setting: Setting): Promise<string[]> {
  const dir = p.settingsDir;
  const done = new Set(readCandidates(id, dir).map((c) => c.file));
  const files = referenceFiles(id, dir).filter((f) => !done.has(f));
  const out: string[] = [];
  if (!files.length) return [`map: every reference file is already in the sidecar`];
  mkdirSync(join(dir, id), { recursive: true });
  for (const f of files) {
    const { topic, text } = readReference(join(referenceDir(id, dir), f));
    const prompt = fill("distillMap", {
      matrix: matrixBlock(setting), topic: topic || f, n: String(RUN.mapCandidates),
      listDefinitions: TEMPLATES.listDefinitions, entryShape: shape(), reference: text,
    });
    let rows: Candidate[];
    try {
      const { value } = await p.invoke(null, null, "distill", prompt, (raw) => {
        const got: Candidate[] = [];
        for (const list of LISTS) for (const entry of parseEntries(raw, list)) got.push({ list, entry, source: topic || f, file: f });
        if (!got.length) throw new Error("no <entry> tags in any list");
        return got;
      }, `setting/${id}/map/${f}`);
      rows = value;
    } catch (e) {
      out.push(`${f}: ${e instanceof StepFailure ? e.reason : String((e as any)?.message ?? e)}`);
      continue;
    }
    appendFileSync(candidatesPath(id, dir), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    out.push(`${f}: ${rows.length} candidates (${words(text)} words)`);
  }
  return out;
}

/**
 * Reduce: one call per list over its candidates, written into the setting
 * file in place. Returns a report line per list.
 */
export async function distillReduce(p: Pipeline, id: string, setting: Setting): Promise<string[]> {
  const dir = p.settingsDir;
  const path = settingPath(id, dir);
  const all = readCandidates(id, dir);
  if (!all.length) return [`reduce: no candidates; run the map pass first`];
  const out: string[] = [];
  for (const list of LISTS) {
    const mine = all.filter((c) => c.list === list);
    if (!mine.length) { out.push(`${list}: no candidates`); continue; }
    const prompt = fill("distillReduce", {
      matrix: matrixBlock(setting), list, listl: list.toLowerCase(),
      cap: String(RUN.listCaps.entries), words: String(RUN.listCaps.words), entryShape: shape(),
      candidates: mine.map((c) => `- ${c.entry}   [${c.source}]`).join("\n"),
    });
    let kept: string[];
    try {
      const { value } = await p.invoke(null, null, "distill", prompt, (raw) => {
        const got = parseEntries(raw, list);
        if (!got.length) throw new Error(`no <entry> tags in <${list.toLowerCase()}>`);
        return got;
      }, `setting/${id}/reduce/${list}`);
      kept = value;
    } catch (e) {
      out.push(`${list}: ${e instanceof StepFailure ? e.reason : String((e as any)?.message ?? e)}`);
      continue;
    }
    const capped = kept.slice(0, RUN.listCaps.entries);
    writeFileSync(path, replaceList(readFileSync(path, "utf8"), id, list, capped));
    out.push(`${list}: ${capped.length} of ${mine.length} candidates${kept.length > capped.length ? ` (${kept.length - capped.length} over the cap dropped)` : ""}`);
  }
  return out;
}

/** Both passes unless one is asked for. Lint runs first, and on the result. */
export async function distill(p: Pipeline, id: string, opts: DistillOpts = {}): Promise<string[]> {
  const dir = p.settingsDir;
  const path = settingPath(id, dir);
  if (!existsSync(path)) throw new Error(`setting ${id}: no file at sources/settings/${id}.md`);
  const setting = parseSetting(readFileSync(path, "utf8"), id, dir);
  const both = !opts.map && !opts.reduce;
  const out: string[] = [];
  if (opts.map || both) out.push(...(await distillMap(p, id, setting)));
  if (opts.reduce || both) out.push(...(await distillReduce(p, id, setting)));
  const findings = lintSetting(readFileSync(path, "utf8"), id);
  if (findings.length) out.push("", "lint:", ...findings.map(formatFinding));
  return out;
}
