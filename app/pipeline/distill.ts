/**
 * `cloudchamber distill <id> [--map|--reduce]`: build a setting's five lists
 * from its reference tree, in two passes, because no corpus here fits one
 * call.
 *
 *   map     one call per reference file; candidate entries append to
 *           sources/settings/<id>/candidates.jsonl with the file's topic
 *           and a hash of its content. A file whose hash is already in the
 *           sidecar is skipped, so a killed run resumes by re-running; a
 *           changed or removed file loses its rows, and a changed or new
 *           file is mapped. Files map RUN.mapConcurrency at a time.
 *   reduce  one call per list over that list's candidates; dedupes, prefers
 *           the specific, cuts to the cap, and writes the list into the
 *           setting file in place.
 *
 * The sidecar is the point: changing a cap or the house style re-runs reduce
 * only — four calls, no corpus read. See docs/specs/2026-09-13-four-lists.md.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { RUN } from "./config.ts";
import type { Pipeline } from "./draw.ts";
import { StepFailure } from "./draw.ts";
import { tags, tag, words } from "./model.ts";
import { fill, TEMPLATES } from "./prompts.ts";
import {
  LISTS, entryName, isEmpty, lintSetting, formatFinding, parseFrontMatter, parseSetting, replaceList, settingPath, referenceDir,
  type ListName, type Setting,
} from "./settings.ts";

export type DistillOpts = { map?: boolean; reduce?: boolean };
/** `hash` is the reference file's content when it was mapped; a row without one predates hashing and counts as stale. */
export type Candidate = { list: ListName; entry: string; source: string; file: string; hash?: string };
/** A kept entry and the reference file it came from: the trail the setting file itself cannot carry. */
export type Kept = { list: ListName; entry: string; file: string };

export const candidatesPath = (id: string, dir: string) => join(dir, id, "candidates.jsonl");
export const keptPath = (id: string, dir: string) => join(dir, id, "kept.jsonl");

export function readKept(id: string, dir: string): Kept[] {
  const path = keptPath(id, dir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Kept);
}

/**
 * The reduce keeps each entry's `[source]` bracket so the trail survives the
 * call; this takes it off for the setting file and hands back the source it
 * named. An entry that lost its bracket keeps an empty source rather than
 * failing: the entry is the product, the trail is the record of it.
 */
export function splitSource(entry: string): { entry: string; source: string } {
  const m = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(entry);
  return m ? { entry: m[1].trim(), source: m[2].trim() } : { entry: entry.trim(), source: "" };
}

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

/** A reference file's front matter topic, its prose with the front matter stripped, and a hash of the whole file. */
function readReference(path: string): { topic: string; text: string; hash: string } {
  const raw = readFileSync(path, "utf8");
  const { meta, body } = parseFrontMatter(raw);
  return { topic: meta.topic ?? "", text: body.trim(), hash: createHash("sha256").update(raw).digest("hex").slice(0, 16) };
}

export function readCandidates(id: string, dir: string): Candidate[] {
  const path = candidatesPath(id, dir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Candidate);
}

const shape = () => fill("entryShape", { words: String(RUN.listCaps.words) });

const parseEntries = (raw: string, list: ListName): string[] =>
  tags(tag(raw, list.toLowerCase()) ?? "", "entry").map((e) => e.trim()).filter(Boolean);

/**
 * Map: one call per reference file not in the sidecar at its current hash.
 * Rows for a removed or changed file are dropped first, so the reduce never
 * reads a candidate from text that is no longer there. Returns a report line
 * per file.
 */
export async function distillMap(p: Pipeline, id: string, setting: Setting): Promise<string[]> {
  const dir = p.settingsDir;
  const refs = new Map(referenceFiles(id, dir).map((f) => [f, readReference(join(referenceDir(id, dir), f))]));
  const rows = readCandidates(id, dir);
  const fresh = (c: Candidate) => refs.get(c.file)?.hash === c.hash;
  const out: string[] = [];
  const stale = new Map<string, number>();
  for (const c of rows) if (!fresh(c)) stale.set(c.file, (stale.get(c.file) ?? 0) + 1);
  if (stale.size) {
    writeFileSync(candidatesPath(id, dir), rows.filter(fresh).map((r) => `${JSON.stringify(r)}\n`).join(""));
    for (const [f, n] of stale) out.push(`${f}: ${n} candidates dropped (${refs.has(f) ? "changed" : "removed"})`);
  }
  const done = new Set(rows.filter(fresh).map((c) => c.file));
  const files = [...refs.keys()].filter((f) => !done.has(f));
  if (!files.length) return [...out, `map: every reference file is already in the sidecar`];
  mkdirSync(join(dir, id), { recursive: true });
  const lines: string[] = new Array(files.length);
  const mapOne = async (i: number) => {
    const f = files[i];
    const { topic, text, hash } = refs.get(f)!;
    const prompt = fill("distillMap", {
      topic: topic || f, n: String(RUN.mapCandidates),
      listDefinitions: TEMPLATES.listDefinitions, entryShape: shape(), reference: text,
    });
    try {
      const { value } = await p.invoke(null, null, "distill-map", prompt, (raw) => {
        const got: Candidate[] = [];
        for (const list of LISTS) for (const entry of parseEntries(raw, list)) got.push({ list, entry, source: topic || f, file: f, hash });
        if (!got.length) throw new Error("no <entry> tags in any list");
        return got;
      }, `setting/${id}/map/${f}`);
      // a synchronous append between awaits: concurrent files never interleave their rows
      appendFileSync(candidatesPath(id, dir), `${value.map((r) => JSON.stringify(r)).join("\n")}\n`);
      lines[i] = `${f}: ${value.length} candidates (${words(text)} words)`;
    } catch (e) {
      lines[i] = `${f}: ${e instanceof StepFailure ? e.reason : String((e as any)?.message ?? e)}`;
    }
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(RUN.mapConcurrency, files.length) }, async () => {
    while (next < files.length) await mapOne(next++);
  }));
  return [...out, ...lines];
}

const tooLong = (entry: string) => splitSource(entry).entry.split(/\s+/).length > RUN.listCaps.words;

/**
 * An entry the reduce returned over the word cap gets one follow-up call to
 * cut it; anything still over after that is dropped. The count cap is enforced
 * in code and the word cap was not, which is how four entries landed a setting
 * in a state lint would not load.
 */
async function trimLong(p: Pipeline, id: string, list: ListName, kept: string[], out: string[]): Promise<string[]> {
  const long = kept.filter(tooLong);
  if (!long.length) return kept;
  let fixed: string[] = [];
  try {
    const { value } = await p.invoke(null, null, "distill", fill("distillTrim", {
      words: String(RUN.listCaps.words), listl: list.toLowerCase(), entries: long.map((e) => `- ${e}`).join("\n"),
    }), (raw) => {
      const got = parseEntries(raw, list);
      if (got.length !== long.length) throw new Error(`asked to cut ${long.length} entries, got ${got.length}`);
      return got;
    }, `setting/${id}/trim/${list}`);
    fixed = value;
  } catch (e) {
    out.push(`${list}: the trim call failed (${e instanceof StepFailure ? e.reason : String((e as any)?.message ?? e)})`);
  }
  const byOriginal = new Map(long.map((e, i) => [e, fixed[i]]));
  const result: string[] = [];
  let dropped = 0;
  for (const e of kept) {
    const candidate = byOriginal.get(e) ?? e;
    if (tooLong(candidate)) { dropped++; continue; }
    result.push(candidate);
  }
  out.push(`${list}: ${long.length} entr${long.length === 1 ? "y" : "ies"} over ${RUN.listCaps.words} words, ${long.length - dropped} cut, ${dropped} dropped`);
  return result;
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
  writeFileSync(keptPath(id, dir), "");   // a reduce rewrites every list, so it rewrites the trail
  const out: string[] = [];
  const taken: string[] = [];   // names the lists reduced before this one kept; the setting names each thing once
  for (const list of LISTS) {
    const mine = all.filter((c) => c.list === list);
    if (!mine.length) { out.push(`${list}: no candidates`); continue; }
    const prompt = fill("distillReduce", {
      list, listl: list.toLowerCase(),
      cap: String(RUN.listCaps.entries), words: String(RUN.listCaps.words), entryShape: shape(),
      candidates: mine.map((c) => `- ${c.entry}   [${c.source}]`).join("\n"),
      kept: taken.length ? fill("keptElsewhere", { names: taken.map((n) => `- ${n}`).join("\n") }) : "",
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
    const trimmed = await trimLong(p, id, list, kept.slice(0, RUN.listCaps.entries), out);
    const capped = trimmed.map(splitSource);
    const bySource = new Map(mine.map((c) => [c.source, c.file]));
    taken.push(...capped.map((c) => entryName(c.entry)));
    writeFileSync(path, replaceList(readFileSync(path, "utf8"), id, list, capped.map((c) => c.entry)));
    appendFileSync(keptPath(id, dir), capped.map((c) =>
      `${JSON.stringify({ list, entry: c.entry, file: bySource.get(c.source) ?? "" } satisfies Kept)}\n`).join(""));
    const traced = capped.filter((c) => bySource.has(c.source)).length;
    out.push(`${list}: ${capped.length} of ${mine.length} candidates, ${traced} traced to a source file${kept.length > capped.length ? ` (${kept.length - capped.length} over the cap dropped)` : ""}`);
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
