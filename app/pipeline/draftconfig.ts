/**
 * The drafting configuration: draft.toml defaults, then a named profile, then
 * per-draw overrides. The resolved object is stored on the draw and written
 * to the export, with the keys that were overridden marked.
 */
import draftToml from "./draft.toml";
import { SCORE_MAX } from "./recur.ts";

export type FormAxis = "tense" | "person" | "chronology" | "container";
export type DraftConfig = {
  length: { words: number; tolerance: number };
  beats: { count: "auto" | number; min: number; max: number; words_min: number; words_max: number };
  form: { tense: string; person: string; chronology: string; container: string; ending: "brief" | "open" };
  structure: { template: string };
  scenes: { order: "sequential" | "parallel" };
  checks: { enabled: string[]; samples: number; keep_if: number } & Record<string, unknown>;
  screens: { enabled: string[]; samples: number; keep_if: number; slop_baseline: string } & Record<string, unknown>;
  repair: { rounds: number; stop_score: number; patience: number; max_calls: number };
};
export type Resolved = { config: DraftConfig; overridden: string[]; profile: string | null };

export const FORM_VALUES: Record<FormAxis, string[]> = {
  tense: ["past", "present"], person: ["first", "second", "third"], chronology: ["linear", "nonlinear"], container: ["prose", "document", "interleaved", "told"],
};

/** Flags as dotted keys: `length.words`, `beats.count`, `form.tense`, `scenes.order`, `checks.samples`. */
export type Overrides = Record<string, string | number>;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function setPath(obj: any, path: string, value: unknown) {
  const ks = path.split(".");
  let o = obj;
  for (const k of ks.slice(0, -1)) { if (typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k]; }
  o[ks[ks.length - 1]] = value;
}

/** Profile tables use dotted keys (`length.words = 1500`); TOML parses those as nested tables already. */
function flatten(obj: any, prefix = ""): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatten(v, key)); else out.push([key, v]);
  }
  return out;
}

function coerce(path: string, v: string | number): unknown {
  if (typeof v === "number") return v;
  if (path === "beats.count" && v === "auto") return "auto";
  if (/^(length\.(words|tolerance)|beats\.(count|min|max|words_min|words_max)|checks\..*samples|checks\..*keep_if|screens\..*samples|screens\..*keep_if|repair\.(rounds|stop_score|patience|max_calls))$/.test(path)) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`draft config: ${path} must be a number, got ${v}`);
    return n;
  }
  return v;
}

export function loadDraftConfig(profile?: string, overrides: Overrides = {}, defaults: any = draftToml): Resolved {
  const { profiles, ...base } = clone(defaults);
  const config = base as DraftConfig;
  const overridden: string[] = [];
  if (profile) {
    const p = profiles?.[profile];
    if (!p) throw new Error(`draft config: no profile ${profile}; have ${Object.keys(profiles ?? {}).join(", ") || "none"}`);
    for (const [k, v] of flatten(p)) { setPath(config, k, v); overridden.push(k); }
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") continue;
    setPath(config, k, coerce(k, v));
    if (!overridden.includes(k)) overridden.push(k);
  }
  validate(config);
  return { config, overridden, profile: profile ?? null };
}

export function validate(c: DraftConfig): void {
  const bad = (m: string) => { throw new Error(`draft config: ${m}`); };
  if (!(c.length.words > 0)) bad("length.words must be positive");
  if (!(c.length.tolerance >= 0 && c.length.tolerance < 1)) bad("length.tolerance must be in [0, 1)");
  if (c.beats.count !== "auto" && !(Number.isInteger(c.beats.count) && c.beats.count > 0)) bad(`beats.count must be auto or a positive integer, got ${c.beats.count}`);
  if (!(c.beats.min >= 1 && c.beats.max >= c.beats.min)) bad("beats.min..max must be a range from 1");
  if (!(c.beats.words_min >= 1 && c.beats.words_max >= c.beats.words_min)) bad("beats.words_min..words_max must be a range from 1");
  for (const axis of Object.keys(FORM_VALUES) as FormAxis[]) {
    const v = c.form[axis];
    if (v !== "auto" && !FORM_VALUES[axis].includes(v)) bad(`form.${axis} must be auto or one of ${FORM_VALUES[axis].join(" | ")}, got ${v}`);
  }
  if (!["brief", "open"].includes(c.form.ending)) bad(`form.ending must be brief or open, got ${c.form.ending}`);
  if (!["auto", "listen", "told", "signal"].includes(c.structure.template)) bad(`structure.template must be auto, listen, told or signal, got ${c.structure.template}`);
  if (!["sequential", "parallel"].includes(c.scenes.order)) bad(`scenes.order must be sequential or parallel, got ${c.scenes.order}`);
  if (!(c.checks.samples >= 1 && c.checks.keep_if >= 1)) bad("checks.samples and checks.keep_if must be at least 1");
  if (!(c.screens.samples >= 1 && c.screens.keep_if >= 1)) bad("screens.samples and screens.keep_if must be at least 1");
  if (!(Number.isInteger(c.repair.rounds) && c.repair.rounds >= 0)) bad("repair.rounds must be a non-negative integer");
  if (!(c.repair.stop_score >= 0 && c.repair.stop_score <= SCORE_MAX)) bad(`repair.stop_score must be in 0..${SCORE_MAX}`);
  if (!(Number.isInteger(c.repair.patience) && c.repair.patience >= 1)) bad("repair.patience must be a positive integer");
  if (!(Number.isInteger(c.repair.max_calls) && c.repair.max_calls >= 1)) bad("repair.max_calls must be a positive integer");
}

export function profileNames(defaults: any = draftToml): string[] { return Object.keys(defaults.profiles ?? {}); }

/** Samples for one checker or screen: the per-name table overrides the group default. */
export function samplesFor(group: { samples: number; keep_if: number } & Record<string, unknown>, name: string): { samples: number; keep_if: number } {
  const own = group[name] as { samples?: number; keep_if?: number } | undefined;
  const samples = own?.samples ?? group.samples;
  return { samples, keep_if: Math.min(own?.keep_if ?? group.keep_if, samples) };
}

/** The resolved configuration as TOML text, overridden keys commented. */
export function toToml(r: Resolved): string {
  const lines: string[] = [`# resolved draft configuration${r.profile ? ` · profile ${r.profile}` : ""}`];
  const groups: [string, Record<string, unknown>][] = [];
  for (const [g, v] of Object.entries(r.config)) {
    const own: Record<string, unknown> = {}, sub: [string, Record<string, unknown>][] = [];
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x && typeof x === "object" && !Array.isArray(x)) sub.push([`${g}.${k}`, x as Record<string, unknown>]); else own[k] = x;
    }
    groups.push([g, own], ...sub);
  }
  for (const [g, kv] of groups) {
    lines.push("", `[${g}]`);
    for (const [k, x] of Object.entries(kv)) lines.push(`${k} = ${JSON.stringify(x)}${r.overridden.includes(`${g}.${k}`) ? "   # overridden" : ""}`);
  }
  return lines.join("\n") + "\n";
}
