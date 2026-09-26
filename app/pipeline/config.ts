import stagesToml from "./stages.toml";
import genresToml from "./genres.toml";

export type GenStageName = "themes" | "redundancy" | "distill-map" | "distill" | "premises" | "execute" | "outline" | "context" | "ending";
export type CheckStageName = "ledger-extract" | "check-derivation" | "check-ledger" | "check-verify" | "check-structure" | "check-resemblance" | "check-claims-extract" | "check-claims-verify";
export type DraftStageName = "reconcile" | "repair-vignette" | "repair-context" | "repair-outline" | "repair-ending" | "schedule" | "scene" | "screen-ledger" | "screen-structure" | "reference-bind";
export type StageName = GenStageName | CheckStageName | DraftStageName;
/** `tools` is the comma-separated list a call may use; absent or empty means `--tools ""`. */
export type StageConfig = { model: string; fallback: string; system: string; tools?: string; effort?: Effort };

/**
 * How long a stage is asked to think. Unset leaves the CLI default. On run 10
 * `screen-ledger` was 45% of the draft's wall clock and 83% of its output was
 * thinking, so this is the knob that moves the clock.
 */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export const isEffort = (s: string): s is Effort => (EFFORTS as readonly string[]).includes(s);

/**
 * The role a part of a brief plays. A part's role is the stage that wrote it,
 * not its artifact kind: the chosen vignette, a context vignette and a repair
 * of either are all `vignette` artifacts, and only the stage tells them apart.
 */
export type PartRole = "vignette" | "outline" | "context" | "ending" | "job";

/**
 * Every stage, and the facts the pipeline asks about one: the tab its steps
 * belong in, the model group it can be priced with, the brief part it writes,
 * the checker it runs, and whether it makes a model call at all. The lists
 * below are views of this table, so a new stage is one row here rather than an
 * entry in six places.
 *
 * `tab` follows docs/specs/2026-09-10-four-tabs.md; `null` is a stage that runs
 * on no draw. A repair stage writes the same role as the stage it repairs, so a
 * reader that asks for `context` finds the rewritten one too; reading `context`
 * alone lost it, and the next repair wrote both contexts afresh under new jobs.
 */
export type Tab = "ideate" | "check" | "write";
export type StageFacts = { tab: Tab | null; group?: "prose" | "judgement" | "corpus"; role?: PartRole; checker?: string; call?: false };

const STAGE_TABLE: Readonly<Record<string, StageFacts>> = {
  themes: { tab: null, group: "corpus" },
  redundancy: { tab: null, group: "corpus" },
  "distill-map": { tab: null, group: "corpus" },
  distill: { tab: null, group: "corpus" },

  premises: { tab: "ideate", group: "prose" },
  execute: { tab: "ideate", group: "prose", role: "vignette" },
  outline: { tab: "ideate", group: "prose", role: "outline" },
  context: { tab: "ideate", group: "prose", role: "context" },
  ending: { tab: "ideate", group: "prose", role: "ending" },
  jobs: { tab: "ideate", role: "job", call: false },

  "ledger-extract": { tab: "check", group: "judgement" },
  "check-derivation": { tab: "check", group: "judgement", checker: "derivation" },
  "check-ledger": { tab: "check", group: "judgement", checker: "ledger" },
  "check-verify": { tab: "check", group: "judgement" },
  "check-structure": { tab: "check", group: "judgement", checker: "structure" },
  "check-resemblance": { tab: "check", group: "judgement", checker: "resemblance" },
  "check-claims-extract": { tab: "check", group: "judgement", checker: "claims" },
  "check-claims-verify": { tab: "check", group: "judgement", checker: "claims" },
  reconcile: { tab: "check", group: "judgement" },
  "repair-vignette": { tab: "check", group: "prose", role: "vignette" },
  "repair-context": { tab: "check", group: "prose", role: "context" },
  "repair-outline": { tab: "check", group: "prose", role: "outline" },
  "repair-ending": { tab: "check", group: "prose", role: "ending" },

  schedule: { tab: "write", group: "prose" },
  scene: { tab: "write", group: "prose" },
  "screen-ledger": { tab: "write", group: "judgement" },
  "screen-structure": { tab: "write", group: "judgement" },
  // the canon guard's reader: the bind's prompt on its own stage, so an arm that moves the bind does not move its judge
  "reference-bind": { tab: "write", group: "judgement" },
  "screen-slop": { tab: "write", call: false },
  "screen-restated": { tab: "write", call: false },
  "screen-listen": { tab: "write", call: false },
};

/** The role each stage writes, for the stages that write a part of a brief. */
export const STAGE_ROLE: Readonly<Record<string, PartRole>> =
  Object.fromEntries(Object.entries(STAGE_TABLE).filter(([, f]) => f.role).map(([s, f]) => [s, f.role!]));

/** Every stage that makes a model call, and so must name a model in stages.toml. */
export const STAGES: StageName[] = Object.entries(STAGE_TABLE).filter(([, f]) => f.call !== false).map(([s]) => s as StageName);

/** The tab a step belongs in; `null` is a stage that runs on no draw. The page filters its steps by this. */
export const stageTab = (stage: string): Tab | null => STAGE_TABLE[stage]?.tab ?? null;

/** The checker a check stage runs, or null. `check-claims-extract` and `-verify` are both the claims checker. */
export const checkerOf = (stage: string): string | null => STAGE_TABLE[stage]?.checker ?? null;

/**
 * The stages by what they do, so a model can be chosen for a whole group: the
 * prose stages write the story, the judgement stages check and screen it, the
 * corpus stages read reference material. `--models judgement=claude-sonnet-5`
 * names a group; `--models scene=claude-opus-5` names one stage.
 */
export const MODEL_GROUPS: Readonly<Record<string, StageName[]>> = {
  prose: [], judgement: [], corpus: [],
};
for (const [stage, f] of Object.entries(STAGE_TABLE)) {
  if (f.group && f.call !== false) (MODEL_GROUPS[f.group] as StageName[]).push(stage as StageName);
}

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
  premiseWords: 100,    // asked
  premiseWarnWords: 120,   // a premise longer than this is stored with a length warning
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
  // waits before each retry of a call the API failed on its side (5xx, 529); a transient failure used to fail the whole stage
  errorBackoffMs: [30_000, 60_000, 120_000],
  // a check pass starts one call, then the rest this much later: a cache write is readable after about this long, and not by calls started beside it
  cacheLeadMs: 15_000,
  // the length a part carries a `length` warning outside of, by role
  partWords: {
    vignette: { min: 300, max: 500 },
    context: { max: 500 },
    ending: { max: 650 },
  } as Readonly<Record<string, { min?: number; max?: number }>>,
};

export function loadStages(defaults: unknown = stagesToml): Record<StageName, StageConfig> {
  const cfg = defaults as Record<string, Partial<StageConfig>>;
  const out = {} as Record<StageName, StageConfig>;
  for (const s of STAGES) {
    const c = cfg[s];
    if (!c || !c.model || !c.fallback || !c.system) {
      throw new Error(`stages.toml: stage ${s} must name model, fallback and system`);
    }
    if (c.effort !== undefined && !isEffort(String(c.effort))) throw new Error(`stages.toml: stage ${s} has effort ${c.effort}; one of ${EFFORTS.join(", ")}`);
    out[s] = { model: c.model, fallback: c.fallback, system: c.system, ...(c.tools ? { tools: c.tools } : {}), ...(c.effort ? { effort: c.effort as Effort } : {}) };
  }
  return out;
}
