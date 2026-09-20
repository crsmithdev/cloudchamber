import stagesToml from "./stages.toml";
import genresToml from "./genres.toml";

export type GenStageName = "themes" | "redundancy" | "distill-map" | "distill" | "premises" | "execute" | "outline" | "jobs" | "context" | "ending";
export type CheckStageName = "ledger-extract" | "check-derivation" | "check-ledger" | "check-verify" | "check-structure" | "check-resemblance" | "check-claims-extract" | "check-claims-verify";
export type DraftStageName = "reconcile" | "repair-vignette" | "repair-context" | "repair-outline" | "repair-ending" | "schedule" | "scene" | "screen-ledger" | "screen-structure";
export type StageName = GenStageName | CheckStageName | DraftStageName;
/** `tools` is the comma-separated list a call may use; absent or empty means `--tools ""`. */
export type StageConfig = { model: string; fallback: string; system: string; tools?: string };

/**
 * The role a part of a brief plays. A part's role is the stage that wrote it,
 * not its artifact kind: the chosen vignette, a context vignette and a repair
 * of either are all `vignette` artifacts, and only the stage tells them apart.
 */
export type PartRole = "vignette" | "outline" | "context" | "ending" | "job";

/**
 * The role each stage writes. A repair stage writes the same role as the stage
 * it repairs, so a reader that asks for `context` finds the rewritten one too;
 * reading `context` alone lost it, and the next repair wrote both contexts
 * afresh under new jobs.
 */
export const STAGE_ROLE: Readonly<Record<string, PartRole>> = {
  execute: "vignette", "repair-vignette": "vignette",
  outline: "outline", "repair-outline": "outline",
  context: "context", "repair-context": "context",
  ending: "ending", "repair-ending": "ending",
  jobs: "job",
};

export const STAGES: StageName[] = [
  "themes", "redundancy", "distill-map", "distill", "premises", "execute", "outline", "jobs", "context", "ending",
  "ledger-extract", "check-derivation", "check-ledger", "check-verify", "check-structure", "check-resemblance", "check-claims-extract", "check-claims-verify",
  "reconcile", "repair-vignette", "repair-context", "repair-outline", "repair-ending", "schedule", "scene", "screen-ledger", "screen-structure",
];

/**
 * The stages by what they do, so a model can be chosen for a whole group: the
 * prose stages write the story, the judgement stages check and screen it, the
 * corpus stages read reference material. `--models judgement=claude-sonnet-5`
 * names a group; `--models scene=claude-opus-5` names one stage.
 */
export const MODEL_GROUPS: Readonly<Record<string, StageName[]>> = {
  prose: ["premises", "execute", "outline", "jobs", "context", "ending", "repair-vignette", "repair-context", "repair-outline", "repair-ending", "schedule", "scene"],
  judgement: ["ledger-extract", "check-derivation", "check-ledger", "check-verify", "check-structure", "check-resemblance", "check-claims-extract", "check-claims-verify", "reconcile", "screen-ledger", "screen-structure"],
  corpus: ["themes", "redundancy", "distill-map", "distill"],
};

/** The models a form offers; any model id the CLI accepts works in `--models` and the API. */
export const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"] as const;

/** `{stage-or-group: model}` to `{stage: model}`; a group expands before a stage named after it, so the stage wins. A name that is neither throws. */
export function resolveModels(models: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.entries(models).filter(([, m]) => m && m.trim());
  for (const [k, m] of entries) if (MODEL_GROUPS[k]) for (const s of MODEL_GROUPS[k]) out[s] = m.trim();
  for (const [k, m] of entries) {
    if (MODEL_GROUPS[k]) continue;
    if (!(STAGES as string[]).includes(k)) throw new Error(`models: ${k} is not a stage or a group (${[...Object.keys(MODEL_GROUPS), ...STAGES].join(", ")})`);
    out[k as StageName] = m.trim();
  }
  return out;
}

/** The CLI form: `judgement=claude-sonnet-5,scene=claude-opus-5`. */
export function parseModels(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i < 1) throw new Error(`--models: ${part} is not stage=model`);
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** The start form's genre shortcuts, by group. Free text is accepted; this list only saves typing. */
export const GENRES = genresToml as Record<string, string[]>;

export const SAMPLING = ["tail", "off-centre", "standard"] as const;
export type Sampling = (typeof SAMPLING)[number];
export const DEFAULT_SAMPLING: Sampling = "tail";
export const isSampling = (s: string): s is Sampling => (SAMPLING as readonly string[]).includes(s);

/** How much the story takes and how little it gives back. Unset asks for nothing, and the prompts read as before. */
export const DARKNESS = ["light", "grey", "dark", "black"] as const;
export type Darkness = (typeof DARKNESS)[number];
export const isDarkness = (s: string): s is Darkness => (DARKNESS as readonly string[]).includes(s);

/**
 * The stated-probability band each sampling mode asks for and accepts. The
 * band is only half of it: the prose that goes with each, in prompts.ts, is
 * what actually moves the premises, since the model states the number itself.
 */
export const BANDS: Record<Sampling, { floor: number; ceiling: number }> = {
  tail: { floor: 0, ceiling: 0.10 },
  "off-centre": { floor: 0.10, ceiling: 0.35 },
  standard: { floor: 0.35, ceiling: 1 },
};

/** Draw parameters decided in the spec. */
export const RUN = {
  k: 5,                 // premises per batch
  examples: 6,          // passages in front of every generation call
  contextVignettes: 2,
  premiseWords: 100,    // asked; stored with a warning above 120
  vignetteWords: 400,   // asked; cap 450 in the ask, warning outside 300-500
  outlineSectionWords: 400,
  endingWords: 600,
  coreJobs: ["departure", "particulars", "knowledge", "arrival"] as const,   // the outline's four sections; arrival (what arrives, what it costs) added 2026-09-19 for listenability
  endingJobs: ["particulars", "knowledge", "arrival"] as const,   // the sections the ending is derived from; a fix that moves one moves the ending
  listCaps: { entries: 40, words: 45 },   // per setting list; the reduce pass cuts to this and lint holds it
  mapCandidates: 5,     // candidate entries a map call may return per list, per reference file
  mapConcurrency: 8,    // reference files the map pass sends at once
  sceneCapSlack: 0.10,  // a scene over its cap by more than this carries the over_cap warning
  spanWords: 30,        // a finding's quoted span is under this
  // the length a part carries a `length` warning outside of, by role
  partWords: {
    vignette: { min: 300, max: 500 },
    context: { max: 500 },
    ending: { max: 650 },
  } as Readonly<Record<string, { min?: number; max?: number }>>,
};

export function loadStages(): Record<StageName, StageConfig> {
  const cfg = stagesToml as Record<string, Partial<StageConfig>>;
  const out = {} as Record<StageName, StageConfig>;
  for (const s of STAGES) {
    const c = cfg[s];
    if (!c || !c.model || !c.fallback || !c.system) {
      throw new Error(`stages.toml: stage ${s} must name model, fallback and system`);
    }
    out[s] = { model: c.model, fallback: c.fallback, system: c.system, ...(c.tools ? { tools: c.tools } : {}) };
  }
  return out;
}
