import stagesToml from "./stages.toml";

export type StageName = "themes" | "redundancy" | "distill" | "premises" | "execute" | "outline" | "jobs" | "context" | "ending";
export type StageConfig = { model: string; fallback: string; system: string };

export const STAGES: StageName[] = ["themes", "redundancy", "distill", "premises", "execute", "outline", "jobs", "context", "ending"];

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
};

export function loadStages(): Record<StageName, StageConfig> {
  const cfg = stagesToml as Record<string, Partial<StageConfig>>;
  const out = {} as Record<StageName, StageConfig>;
  for (const s of STAGES) {
    const c = cfg[s];
    if (!c || !c.model || !c.fallback || !c.system) {
      throw new Error(`stages.toml: stage ${s} must name model, fallback and system`);
    }
    out[s] = { model: c.model, fallback: c.fallback, system: c.system };
  }
  return out;
}
