import stagesToml from "./stages.toml";

export type GenStageName = "themes" | "redundancy" | "distill" | "premises" | "execute" | "outline" | "jobs" | "context" | "ending";
export type CheckStageName = "check-derivation" | "check-ledger" | "check-structure" | "check-resemblance" | "check-claims-extract" | "check-claims-verify";
export type DraftStageName = "repair-vignette" | "repair-outline" | "repair-ending" | "schedule" | "scene" | "screen-ledger" | "screen-structure";
export type StageName = GenStageName | CheckStageName | DraftStageName;
/** `tools` is the comma-separated list a call may use; absent or empty means `--tools ""`. */
export type StageConfig = { model: string; fallback: string; system: string; tools?: string };

export const STAGES: StageName[] = [
  "themes", "redundancy", "distill", "premises", "execute", "outline", "jobs", "context", "ending",
  "check-derivation", "check-ledger", "check-structure", "check-resemblance", "check-claims-extract", "check-claims-verify",
  "repair-vignette", "repair-outline", "repair-ending", "schedule", "scene", "screen-ledger", "screen-structure",
];

/** Draw parameters decided in the spec. */
export const RUN = {
  k: 5,                 // premises per batch
  ceiling: 0.10,        // stated probability must be under this
  examples: 6,          // passages in front of every generation call
  contextVignettes: 2,
  premiseWords: 100,    // asked; stored with a warning above 120
  vignetteWords: 400,   // asked; cap 450 in the ask, warning outside 300-500
  outlineSectionWords: 400,
  endingWords: 600,
  coreJobs: ["debt audit", "arithmetic", "custody"] as const,
  distillWords: 60000,  // a domain whose reference files exceed this is refused, not chunked
  distillCaps: { Mechanisms: 8, Roles: 8, Institutions: 8, Instruments: 8, Clocks: 8, Places: 8, Vocabulary: 12 } as Record<string, number>,
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
