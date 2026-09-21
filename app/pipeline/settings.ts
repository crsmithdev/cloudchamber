/**
 * A setting is one file under sources/settings/<id>.md: metadata-only front
 * matter and five flat lists of named things. Every stage of a draw loads
 * whole lists, never part of one. The setting's reference/ directory never
 * enters a prompt; it is what `distill` reads.
 *
 * A setting is reference, not a rulebook. It states what is in the world and
 * never how to write it: the craft rules it used to carry came down from the
 * retired playbook and left on 2026-09-14, and the Matrix and Jobs prose that
 * remained of that voice left on 2026-09-19. No setting carried either.
 *
 *   ---
 *   id: <slug>
 *   name: <the setting's name>
 *   claims: setting
 *   seed_segments: []
 *   ---
 *   ## Bodies   ## Events   ## Instruments   ## Places   ## Terms
 *   - name — what it does; what it cannot do, or what follows from it
 *
 * A list earns its place by being enumerable and by an invented entry being a
 * canon violation; that is why there are five and not nine. An empty section
 * is the single line `none`. Unrestricted mode is the absence of a setting.
 * See docs/specs/2026-09-13-four-lists.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS } from "./paths.ts";
import { RUN } from "./config.ts";

export const LISTS = ["Bodies", "Events", "Instruments", "Places", "Terms"] as const;
export type ListName = (typeof LISTS)[number];
export const FRONT_MATTER_KEYS = ["id", "name", "seed_segments", "claims"];
/** Where the claims checker verifies: the web, or the setting's own distillate. Absent: the checker does not run. */
export const CLAIMS_VALUES = ["world", "setting"] as const;
export type ClaimsAuthority = (typeof CLAIMS_VALUES)[number];
export const REDRAFT = "<!-- redraft -->";
/** What each list is to the model. All five are closed classes; people, intervals and sensations are unlisted and so unconstrained. */
export const INTENT = "the setting records these; anything else must be marked for a source";

export type Span = { start: number; end: number };   // body offsets in the file text, heading excluded
export type Setting = {
  id: string;
  name: string;
  seedSegments: string[];
  claims: ClaimsAuthority | null;
  lists: Record<ListName, string[]>;
  spans: Record<ListName, Span>;
  meta: Record<string, string>;
  dir: string;        // the settings directory; reference/ is <dir>/<id>/reference
};

export type GenStage = "premises" | "execute" | "outline" | "context" | "ending";
/**
 * Which lists each stage loads. A loaded list is loaded whole:
 * premises chooses the story's subject and so reads every Body and every Event
 * there is. The other four lists are synchronic — they say what is in the
 * world — so Events is what the stages that settle dates settle them against.
 */
export const LOADING: Record<GenStage, { lists: ListName[] }> = {
  premises: { lists: ["Bodies", "Events"] },
  execute: { lists: ["Instruments", "Places", "Terms"] },
  outline: { lists: ["Bodies", "Events", "Instruments"] },
  context: { lists: ["Instruments", "Places", "Terms"] },
  ending: { lists: ["Bodies", "Events", "Instruments", "Terms"] },
};

// --- parsing ---------------------------------------------------------------

export function parseFrontMatter(text: string): { meta: Record<string, string>; body: string; bodyStart: number } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text, bodyStart: 0 };
  const meta: Record<string, string> = {};
  for (const raw of m[1].split("\n")) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(raw);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: text.slice(m[0].length), bodyStart: m[0].length };
}

const parseList = (v: string | undefined) => (v ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);

type Heading = { level: number; title: string; start: number; bodyStart: number };

function headings(text: string, from: number): Heading[] {
  const out: Heading[] = [];
  const re = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ level: m[1].length, title: m[2], start: m.index, bodyStart: m.index + m[0].length });
  return out;
}

/** Sections as {title -> body span}; a body runs to the next heading of the same or a higher level. */
function spansUnder(hs: Heading[], i: number, level: number, end: number): { title: string; span: Span }[] {
  const out: { title: string; span: Span }[] = [];
  for (let j = i; j < hs.length && hs[j].start < end; j++) {
    if (hs[j].level < level) break;
    if (hs[j].level !== level) continue;
    let k = j + 1;
    while (k < hs.length && hs[k].level > level && hs[k].start < end) k++;
    const stop = k < hs.length && hs[k].start < end ? hs[k].start : end;
    out.push({ title: hs[j].title, span: { start: hs[j].bodyStart, end: stop } });
  }
  return out;
}

const body = (text: string, s: Span) => text.slice(s.start, s.end).trim();

/** List items of a section body, bullet markers and the redraft marker stripped; `none` is no entries. */
export function entries(bodyText: string): string[] {
  return bodyText.replace(REDRAFT, "").split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter((l) => l && l !== "none");
}

export function parseSetting(text: string, id: string, dir: string = SETTINGS): Setting {
  const { meta, bodyStart } = parseFrontMatter(text);
  const hs = headings(text, bodyStart);
  const top = spansUnder(hs, 0, 2, text.length);
  const lists = {} as Record<ListName, string[]>;
  const spans = {} as Record<ListName, Span>;
  for (const name of LISTS) {
    const s = top.find((t) => t.title === name);
    lists[name] = s ? entries(body(text, s.span)) : [];
    spans[name] = s ? s.span : { start: -1, end: -1 };
  }
  return {
    id, name: meta.name ?? id,
    seedSegments: parseList(meta.seed_segments),
    claims: (CLAIMS_VALUES as readonly string[]).includes(meta.claims) ? (meta.claims as ClaimsAuthority) : null,
    lists, spans, meta, dir,
  };
}

export function settingPath(id: string, dir: string = SETTINGS): string { return join(dir, `${id}.md`); }
export function referenceDir(id: string, dir: string = SETTINGS): string { return join(dir, id, "reference"); }

export function loadSetting(id: string, dir: string = SETTINGS): Setting {
  const path = settingPath(id, dir);
  if (!existsSync(path)) throw new Error(`setting ${id}: no file at sources/settings/${id}.md`);
  return parseSetting(readFileSync(path, "utf8"), id, dir);
}

// --- slicing ---------------------------------------------------------------

export const isEmpty = (bodyText: string) => bodyText.trim() === "none" || bodyText.trim() === "";

const listBlock = (name: ListName, rows: string[]) => `## ${name} — ${INTENT}\n\n${rows.map((e) => `- ${e}`).join("\n")}`;

/** The setting text for one stage: each loaded list, whole. */
export function slice(setting: Setting, stage: GenStage): string {
  const load = LOADING[stage];
  const parts: string[] = [];
  for (const name of load.lists) if (setting.lists[name].length) parts.push(listBlock(name, setting.lists[name]));
  return parts.join("\n\n");
}

/**
 * The setting as it was written down: all five lists. Only the claims
 * verifier under `claims: setting` reads this; no generation stage does.
 */
export function distillate(setting: Setting): string {
  const parts: string[] = [];
  for (const name of LISTS) if (setting.lists[name].length) parts.push(listBlock(name, setting.lists[name]));
  return parts.join("\n\n");
}

// --- reading a draw back against the setting --------------------------------

/** The separator between an entry's name and what it does. */
const SEP = " — ";

/** The name half of an entry: everything before the separator, article dropped. */
export const entryName = (entry: string) => entry.split(SEP)[0].trim().replace(/^(the|a|an)\s+/i, "");

/**
 * Whether a piece of generated text reaches for one entry. The name matches
 * whole, or its longest capitalised run does — so "the Public Administrator
 * took the rooms" counts for "Office of the Public Administrator". Case and
 * punctuation are ignored; a name under four characters needs the whole match.
 */
export function mentions(text: string, entry: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hay = norm(text);
  const name = entryName(entry);
  const has = (needle: string) => needle.length >= 4 && hay.includes(norm(needle));
  return has(name) || capitalisedRuns(name).some(has);
}

/** The maximal runs of two or more capitalised words in a name: "Office of the Public Administrator" gives "Public Administrator". */
function capitalisedRuns(name: string): string[] {
  const out: string[] = [];
  let run: string[] = [];
  for (const w of name.split(/\s+/)) {
    if (/^[A-Z]/.test(w)) run.push(w);
    else { if (run.length > 1) out.push(run.join(" ")); run = []; }
  }
  if (run.length > 1) out.push(run.join(" "));
  return out;
}

/** Every entry of a list the text reaches for. */
export const mentioned = (text: string, rows: string[]) => rows.filter((e) => mentions(text, e));

// --- lint ------------------------------------------------------------------

export type Finding = { list: string; entry: string; reason: string };
export const formatFinding = (f: Finding) => `${f.list} › ${f.entry}: ${f.reason}`;

/** Headings a setting no longer carries: the per-domain shape, the craft rules that came down from the playbook, and the Matrix and Jobs prose that remained of it. */
const RETIRED = ["Domains", "Open ground", "Hard rules", "Do not build", "Frame", "Mechanisms", "Roles", "Institutions", "Clocks", "Vocabulary", "Sensation", "Sources", "Matrix", "Jobs"];

export function lintSetting(text: string, id: string): Finding[] {
  const caps = RUN.listCaps;
  const out: Finding[] = [];
  const s = parseSetting(text, id);
  for (const k of Object.keys(s.meta)) if (!FRONT_MATTER_KEYS.includes(k)) out.push({ list: "front matter", entry: k, reason: `unknown key ${k}` });
  if (s.meta.claims !== undefined && !(CLAIMS_VALUES as readonly string[]).includes(s.meta.claims)) {
    out.push({ list: "front matter", entry: "claims", reason: `claims must be ${CLAIMS_VALUES.join(" | ")}, got ${s.meta.claims}` });
  }
  const { bodyStart } = parseFrontMatter(text);
  const hs = headings(text, bodyStart);
  const top = new Set(hs.filter((h) => h.level === 2).map((h) => h.title));
  for (const name of LISTS) if (!top.has(name)) out.push({ list: "setting", entry: name, reason: "missing" });
  for (const h of hs) {
    if (h.level > 2) out.push({ list: "setting", entry: h.title, reason: `no heading below ## ; a list is flat` });
    else if (RETIRED.includes(h.title)) out.push({ list: "setting", entry: h.title, reason: "retired by the four-list shape" });
  }
  for (const name of LISTS) {
    const rows = s.lists[name];
    if (rows.length > caps.entries) out.push({ list: name, entry: `${rows.length} entries`, reason: `over the cap of ${caps.entries}` });
    for (const e of rows) {
      const short = e.length > 40 ? `${e.slice(0, 40)}…` : e;
      if (!e.includes(SEP)) out.push({ list: name, entry: short, reason: "an entry is `name — what it does; what follows`" });
      if (e.split(/\s+/).length > caps.words) out.push({ list: name, entry: short, reason: `over ${caps.words} words` });
    }
  }
  return out;
}

export function lintFile(id: string, dir: string = SETTINGS): Finding[] {
  return lintSetting(readFileSync(settingPath(id, dir), "utf8"), id);
}

export class SettingLintError extends Error {
  constructor(public id: string, public findings: Finding[]) {
    super(`setting ${id} fails lint:\n${findings.map(formatFinding).join("\n")}`);
  }
}

/** Load a setting for a draw or a distill: lint first, throw on findings. */
export function loadChecked(id: string, dir: string = SETTINGS): Setting {
  const path = settingPath(id, dir);
  if (!existsSync(path)) throw new Error(`setting ${id}: no file at sources/settings/${id}.md`);
  const text = readFileSync(path, "utf8");
  const findings = lintSetting(text, id);
  if (findings.length) throw new SettingLintError(id, findings);
  return parseSetting(text, id, dir);
}

/** Replace one list's body in the file text, leaving every other byte as it was. */
export function replaceList(text: string, id: string, name: ListName, rows: string[]): string {
  const s = parseSetting(text, id);
  const span = s.spans[name];
  if (span.start < 0) throw new Error(`setting ${id}: no ${name} list`);
  const bodyText = rows.length ? rows.map((e) => `- ${e}`).join("\n") : "none";
  return `${text.slice(0, span.start)}\n\n${bodyText}\n\n${text.slice(span.end)}`;
}
