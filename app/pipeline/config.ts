import stagesToml from "./stages.toml";
import genresToml from "./genres.toml";

export type GenStageName = "themes" | "redundancy" | "distill-map" | "distill" | "premises" | "execute" | "outline" | "jobs" | "context" | "ending";
export type CheckStageName = "ledger-extract" | "check-derivation" | "check-ledger" | "check-structure" | "check-resemblance" | "check-claims-extract" | "check-claims-verify";
export type DraftStageName = "repair-vignette" | "repair-outline" | "repair-ending" | "schedule" | "scene" | "screen-ledger" | "screen-structure";
export type StageName = GenStageName | CheckStageName | DraftStageName;
/** `tools` is the comma-separated list a call may use; absent or empty means `--tools ""`. */
export type StageConfig = { model: string; fallback: string; system: string; tools?: string };

export const STAGES: StageName[] = [
  "themes", "redundancy", "distill-map", "distill", "premises", "execute", "outline", "jobs", "context", "ending",
  "ledger-extract", "check-derivation", "check-ledger", "check-structure", "check-resemblance", "check-claims-extract", "check-claims-verify",
  "repair-vignette", "repair-outline", "repair-ending", "schedule", "scene", "screen-ledger", "screen-structure",
];

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
  coreJobs: ["debt audit", "arithmetic", "custody"] as const,
  listCaps: { entries: 40, words: 45 },   // per setting list; the reduce pass cuts to this and lint holds it
  mapCandidates: 5,     // candidate entries a map call may return per list, per reference file
  mapConcurrency: 8,    // reference files the map pass sends at once
  sceneCapSlack: 0.10,  // a scene over its cap by more than this carries the over_cap warning
  spanWords: 30,        // a finding's quoted span is under this
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
