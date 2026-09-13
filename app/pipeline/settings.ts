/**
 * A setting is one file under sources/settings/<id>.md: metadata-only front
 * matter, five setting-wide sections, and under `## Domains` any number of
 * domains that each carry the same nine typed sections. A draw picks `draw`
 * domains and every stage loads only the sections in LOADING for it, with the
 * Hard rules last. Sources and the setting's reference/ directory never enter
 * a prompt; the reference directory is what `distill` reads.
 *
 *   ---
 *   id: setting-a
 *   name: The setting-a
 *   draw: 2
 *   seed_segments: []
 *   names: true
 *   ---
 *   ## Matrix
 *   ## Hard rules
 *   ## Do not build
 *   ## Open ground
 *   ## Jobs
 *   - matrix: <description>
 *   ## Domains
 *   ### 12. Death and its administration
 *   #### Frame … #### Mechanisms … #### Roles … #### Institutions …
 *   #### Instruments … #### Clocks … #### Places … #### Vocabulary … #### Sources
 *
 * An empty section is the single line `none`. Unrestricted mode is the absence
 * of a setting; a setting that draws no domains runs on its setting-wide
 * sections alone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS } from "./paths.ts";
import { properNouns, validateTheme } from "./themes.ts";

export const SETTING_SECTIONS = ["Matrix", "Hard rules", "Do not build", "Open ground", "Jobs"] as const;
export const DOMAIN_SECTIONS = ["Frame", "Mechanisms", "Roles", "Institutions", "Instruments", "Clocks", "Places", "Vocabulary", "Sources"] as const;
export type SettingSection = (typeof SETTING_SECTIONS)[number];
export type DomainSection = (typeof DOMAIN_SECTIONS)[number];
/** The sections distill may write. Frame and Sources are always Chris's. */
export const FILLABLE: DomainSection[] = ["Mechanisms", "Roles", "Institutions", "Instruments", "Clocks", "Places", "Vocabulary"];
/** Sections a proper noun may appear in when the setting is masked. */
export const NAMED: DomainSection[] = ["Institutions", "Sources"];
export const FRONT_MATTER_KEYS = ["id", "name", "draw", "seed_segments", "names", "claims"];
/** Where the claims checker verifies: the web, the pinned domains' reference files, or the setting's own distillate. Absent: the checker does not run. */
export const CLAIMS_VALUES = ["world", "reference", "setting"] as const;
export type ClaimsAuthority = (typeof CLAIMS_VALUES)[number];
export const DEFAULT_DRAW = 2;
export const REDRAFT = "<!-- redraft -->";

export type Span = { start: number; end: number };   // body offsets in the file text, heading excluded
export type Domain = { slug: string; heading: string; sections: Record<DomainSection, string>; spans: Record<DomainSection, Span> };
export type Setting = {
  id: string;
  name: string;
  draw: number;
  seedSegments: string[];
  names: boolean;
  claims: ClaimsAuthority | null;
  sections: Record<SettingSection, string>;
  jobs: { name: string; description: string }[];
  domains: Domain[];
  meta: Record<string, string>;
  dir: string;        // the settings directory; reference/ is <dir>/<id>/reference
};

export type GenStage = "premises" | "execute" | "outline" | "jobs" | "context" | "ending";
/** Which sections each stage loads. Hard rules are appended last to every stage and are not listed. */
export const LOADING: Record<GenStage, { setting: SettingSection[]; domain: DomainSection[] }> = {
  premises: { setting: ["Matrix", "Do not build", "Open ground"], domain: ["Frame", "Mechanisms", "Roles"] },
  execute: { setting: ["Matrix", "Do not build"], domain: ["Frame", "Roles", "Instruments", "Places", "Vocabulary"] },
  outline: { setting: ["Matrix", "Do not build"], domain: ["Frame", "Mechanisms", "Institutions", "Instruments", "Clocks"] },
  jobs: { setting: ["Matrix", "Do not build"], domain: ["Frame", "Institutions", "Instruments", "Clocks", "Vocabulary"] },
  context: { setting: ["Matrix", "Do not build"], domain: ["Frame", "Institutions", "Instruments", "Clocks", "Vocabulary"] },
  ending: { setting: ["Matrix", "Do not build"], domain: ["Frame", "Institutions", "Instruments", "Clocks", "Vocabulary"] },
};

export const slug = (heading: string) =>
  heading.replace(/^\d+[.)]?\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

export function parseSetting(text: string, id: string, dir: string = SETTINGS): Setting {
  const { meta, bodyStart } = parseFrontMatter(text);
  const hs = headings(text, bodyStart);
  const sections = {} as Record<SettingSection, string>;
  const top = spansUnder(hs, 0, 2, text.length);
  for (const name of SETTING_SECTIONS) {
    const s = top.find((t) => t.title === name);
    sections[name] = s ? body(text, s.span) : "";
  }
  const domainsSec = top.find((t) => t.title === "Domains");
  const domains: Domain[] = [];
  if (domainsSec) {
    const i = hs.findIndex((h) => h.bodyStart === domainsSec.span.start);
    for (const d of spansUnder(hs, i + 1, 3, domainsSec.span.end)) {
      const j = hs.findIndex((h) => h.bodyStart === d.span.start);
      const subs = spansUnder(hs, j + 1, 4, d.span.end);
      const secs = {} as Record<DomainSection, string>;
      const spans = {} as Record<DomainSection, Span>;
      for (const name of DOMAIN_SECTIONS) {
        const s = subs.find((x) => x.title === name);
        secs[name] = s ? body(text, s.span) : "";
        spans[name] = s ? s.span : { start: -1, end: -1 };
      }
      domains.push({ slug: slug(d.title), heading: d.title, sections: secs, spans });
    }
  }
  const jobs = sections.Jobs.split("\n").map((l) => /^-\s+([^:]+):\s*(.+)$/.exec(l)).filter(Boolean)
    .map((m) => ({ name: m![1].trim(), description: m![2].trim() }));
  return {
    id, name: meta.name ?? id,
    draw: meta.draw ? Number(meta.draw) : DEFAULT_DRAW,
    seedSegments: parseList(meta.seed_segments),
    names: meta.names === "true",
    claims: (CLAIMS_VALUES as readonly string[]).includes(meta.claims) ? (meta.claims as ClaimsAuthority) : null,
    sections, jobs, domains, meta, dir,
  };
}

export function settingPath(id: string, dir: string = SETTINGS): string { return join(dir, `${id}.md`); }
export function referenceDir(id: string, dir: string = SETTINGS): string { return join(dir, id, "reference"); }

export function loadSetting(id: string, dir: string = SETTINGS): Setting {
  const path = settingPath(id, dir);
  if (!existsSync(path)) throw new Error(`setting ${id}: no file at sources/settings/${id}.md`);
  return parseSetting(readFileSync(path, "utf8"), id, dir);
}

/** The heading titles a domain's Sources lines resolve to: `reference/<file>.md`, first token of each line. */
export function sourceFiles(domain: Domain): string[] {
  return domain.sections.Sources.split("\n").map((l) => /^-?\s*(reference\/\S+\.md)/.exec(l)?.[1]).filter((x): x is string => !!x);
}

/**
 * The reference files the pinned domains' Sources lines name, read in full,
 * each in a <reference name="..."> tag. Only the claims verifier under
 * `claims: reference` reads this; no generation stage does.
 */
export function referenceText(setting: Setting, domains: Domain[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const d of domains) for (const f of sourceFiles(d)) {
    if (seen.has(f)) continue;
    seen.add(f);
    const path = join(setting.dir, setting.id, f);
    if (!existsSync(path)) continue;
    parts.push(`<reference name="${f}">\n${readFileSync(path, "utf8").trim()}\n</reference>`);
  }
  return parts.join("\n\n");
}

// --- slicing ---------------------------------------------------------------

export const isEmpty = (bodyText: string) => bodyText.trim() === "none" || bodyText.trim() === "";

/** The setting text for one stage: setting-wide sections, then each drawn domain with its loaded sections. Hard rules are not included. */
export function slice(setting: Setting, domains: Domain[], stage: GenStage): string {
  const load = LOADING[stage];
  const parts: string[] = [];
  for (const name of load.setting) if (!isEmpty(setting.sections[name])) parts.push(`## ${name}\n\n${setting.sections[name]}`);
  for (const d of domains) {
    const secs = load.domain.filter((s) => !isEmpty(d.sections[s])).map((s) => `#### ${s}\n\n${d.sections[s]}`);
    parts.push([`### ${d.heading}`, ...secs].join("\n\n"));
  }
  return parts.join("\n\n");
}

export function hardRules(setting: Setting): string {
  return isEmpty(setting.sections["Hard rules"]) ? "" : `## Hard rules\n\n${setting.sections["Hard rules"]}`;
}

/**
 * The setting as it was written down: every setting-wide section, then every
 * domain with all its typed sections but Sources. The whole file, not the
 * draw's slice, so `claims: setting` verifies against the canon rather than
 * against the two domains the draw happened to take. Only the claims verifier
 * reads this; no generation stage does.
 */
export function distillate(setting: Setting): string {
  const parts: string[] = [];
  for (const name of SETTING_SECTIONS) if (!isEmpty(setting.sections[name])) parts.push(`## ${name}\n\n${setting.sections[name]}`);
  for (const d of setting.domains) {
    const secs = DOMAIN_SECTIONS.filter((s) => s !== "Sources" && !isEmpty(d.sections[s])).map((s) => `#### ${s}\n\n${d.sections[s]}`);
    parts.push([`### ${d.heading}`, ...secs].join("\n\n"));
  }
  return parts.join("\n\n");
}

/**
 * `draw` distinct domains by the pipeline's rng, or the named slugs in the
 * order given. An empty list is a pin too: the setting runs with no domains,
 * on its setting-wide sections alone. `draw: 0` makes that the default.
 */
export function pickDomains(setting: Setting, rng: () => number, slugs?: string[]): Domain[] {
  if (slugs) {
    return slugs.map((s) => {
      const d = setting.domains.find((x) => x.slug === s);
      if (!d) throw new Error(`setting ${setting.id}: no domain ${s}`);
      return d;
    });
  }
  if (setting.draw > setting.domains.length) throw new Error(`setting ${setting.id}: draw ${setting.draw} exceeds ${setting.domains.length} domains`);
  const pool = [...setting.domains];
  const out: Domain[] = [];
  while (out.length < setting.draw) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/** The reserved `--domains` value: run the setting with no domains at all. */
export const NO_DOMAINS = "none";

/** A `--domains` string as the pipeline takes it: undefined to draw at random, [] for `none`, else the slugs in order. */
export function parseDomains(value?: string): string[] | undefined {
  const slugs = (value ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  if (!slugs.length) return undefined;
  return slugs.length === 1 && slugs[0] === NO_DOMAINS ? [] : slugs;
}

// --- lint ------------------------------------------------------------------

export type Finding = { domain: string; section: string; reason: string };
export const formatFinding = (f: Finding) => `${f.domain} › ${f.section}: ${f.reason}`;

export function lintSetting(text: string, id: string, fileExists: (rel: string) => boolean): Finding[] {
  const out: Finding[] = [];
  const s = parseSetting(text, id);
  for (const k of Object.keys(s.meta)) if (!FRONT_MATTER_KEYS.includes(k)) out.push({ domain: "front matter", section: k, reason: `unknown key ${k}` });
  if (s.meta.draw && !(Number.isInteger(s.draw) && s.draw >= 0)) out.push({ domain: "front matter", section: "draw", reason: `draw must be a non-negative integer, got ${s.meta.draw}` });
  if (s.meta.claims !== undefined && !(CLAIMS_VALUES as readonly string[]).includes(s.meta.claims)) out.push({ domain: "front matter", section: "claims", reason: `claims must be ${CLAIMS_VALUES.join(" | ")}, got ${s.meta.claims}` });
  const { bodyStart } = parseFrontMatter(text);
  const top = new Set(headings(text, bodyStart).filter((h) => h.level === 2).map((h) => h.title));
  for (const name of [...SETTING_SECTIONS, "Domains"]) if (!top.has(name)) out.push({ domain: "setting", section: name, reason: "missing" });
  for (const name of SETTING_SECTIONS) if (top.has(name) && s.sections[name].trim() === "") out.push({ domain: "setting", section: name, reason: "empty sections hold the line none" });
  if (top.has("Domains") && !s.domains.length && s.draw > 0) out.push({ domain: "setting", section: "Domains", reason: "at least one domain" });
  for (const d of s.domains) {
    const present = DOMAIN_SECTIONS.filter((n) => d.spans[n].start >= 0);
    for (const name of DOMAIN_SECTIONS) if (d.spans[name].start < 0) out.push({ domain: d.slug, section: name, reason: "missing" });
    const order = present.map((n) => d.spans[n].start);
    if (order.some((x, i) => i && x < order[i - 1])) out.push({ domain: d.slug, section: present.find((n, i) => i && d.spans[n].start < d.spans[present[i - 1]].start)!, reason: "out of order" });
    for (const name of present) if (d.sections[name].trim() === "") out.push({ domain: d.slug, section: name, reason: "empty sections hold the line none" });
    if (d.spans.Frame.start >= 0 && d.sections.Frame.split("\n").filter((l) => l.trim()).length !== 1) out.push({ domain: d.slug, section: "Frame", reason: "one line" });
    if (!isEmpty(d.sections.Mechanisms)) for (const line of lines(d.sections.Mechanisms)) {
      const why = validateTheme(line);
      if (why.length) out.push({ domain: d.slug, section: "Mechanisms", reason: `${line.slice(0, 40)}… ${why.join(", ")}` });
    }
    if (!s.names) for (const name of DOMAIN_SECTIONS) {
      if (NAMED.includes(name) || name === "Mechanisms" || isEmpty(d.sections[name])) continue;   // Mechanisms are covered by the theme validator
      for (const line of lines(d.sections[name])) for (const w of properNouns(line)) out.push({ domain: d.slug, section: name, reason: `proper noun ${w}` });
    }
    if (d.spans.Sources.start >= 0) {
      const files = sourceFiles(d);
      if (isEmpty(d.sections.Sources) || !files.length) out.push({ domain: d.slug, section: "Sources", reason: "at least one reference/<file>.md line" });
      for (const f of files) if (!fileExists(f)) out.push({ domain: d.slug, section: "Sources", reason: `no file ${f}` });
    }
  }
  return out;
}

/** List items or paragraphs of a section body, bullet markers and the redraft marker stripped. */
export function lines(bodyText: string): string[] {
  return bodyText.replace(REDRAFT, "").split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter((l) => l && l !== "none");
}

export function lintFile(id: string, dir: string = SETTINGS): Finding[] {
  const text = readFileSync(settingPath(id, dir), "utf8");
  return lintSetting(text, id, (rel) => existsSync(join(dir, id, rel)));
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
  const findings = lintSetting(text, id, (rel) => existsSync(join(dir, id, rel)));
  if (findings.length) throw new SettingLintError(id, findings);
  return parseSetting(text, id, dir);
}

/** Replace one domain section's body in the file text, leaving every other byte as it was. */
export function replaceSection(text: string, id: string, domainSlug: string, section: DomainSection, newBody: string): string {
  const s = parseSetting(text, id);
  const d = s.domains.find((x) => x.slug === domainSlug);
  if (!d) throw new Error(`setting ${id}: no domain ${domainSlug}`);
  const span = d.spans[section];
  if (span.start < 0) throw new Error(`setting ${id}: ${domainSlug} has no ${section}`);
  return text.slice(0, span.start) + "\n\n" + newBody.trim() + "\n\n" + text.slice(span.end);
}
