export type Latest = { verdict: "keep" | "pass"; artifact: boolean; note: string; at: string; inherited_from: string | null } | null;
export type Item = {
  id: string;
  text: string;
  words?: number;
  cell?: string;
  suspect?: string[];
  title?: string;
  author?: string;
  genre?: string;
  source?: string;
  passages?: number;
  attestation?: number;
  stories?: string;
  latest: Latest;
  setting?: string;
  status?: string;
};
export type Example = { id: string; text: string | null; words?: number; cell?: string; title?: string; author?: string; source?: string; story_id?: string; latest: Latest };
export type Draw = {
  id: string;
  name: string | null;
  /** The repair chain behind this draw, oldest first, this draw last; `head` says nothing repairs it. Read by chain.ts on the server. */
  rounds: string[];
  head: boolean;
  stage: "ideate" | "check" | "write";
  origin?: Origin | null;
  archived_at: string | null;
  setting: string | null;
  genre: string;
  sampling: string;
  darkness: string | null;
  mode: string;
  segment: string | null;
  seed_mode: string;
  seed_text: string;
  example_ids: string;
  status: string;
  gate_method: string | null;
  chosen_step: string | null;
  flagged: number;
  flag_note: string;
  superseded_by: string | null;
  repaired_from: string | null;
  forked_from: string | null;
  draft_config: string | null;
  created_at: string;
  ended_at: string | null;
  check?: CheckSummary | null;
  /** Why the last action on the draw failed; null once a later one succeeds. */
  error: string | null;
  /** The server's lifecycle answers: the UI keeps no status rules of its own. */
  running: boolean;
  at_gate: boolean;
  actions: Record<DrawAction, string | null>;
};
export type DrawAction = "choose" | "fork" | "flag" | "archive" | "unarchive" | "delete" | "check" | "auto" | "accept" | "dismiss" | "hold" | "draft" | "patch" | "rewrite" | "keep";
/** What a round of a repair chain shows in the list: its reported findings, the accepted ones, and their total score. Null until the server has computed it. */
export type CheckSummary = { pass: string | null; reported: number; accepted: number; open: number; total: number };
export type Finding = {
  id: string;
  artifact_id: string;
  checkers: string[];
  samples: number[];
  n: number;
  span: string;
  statement: string;
  result: string;
  evidence: string;
  invalidates: string;
  replacement: string;
  patch: string;
  pass: string;
  source: "check" | "screen";
  screen?: string;
  beat?: number;
  decision: "accepted" | "dismissed" | "open";
  note: string;
  score: number;
  samples_run: number;
  reported: boolean;
  /** Why the verify pass took it off the reported list. */
  dropped?: string;
  /** Whether the auto rule would consider it: from a checker that quotes, with evidence, not re-opening a settled fix. */
  auto_eligible: boolean;
  relitigates?: { finding: string; draw: string; round: number; replacement: string };
};
export type Claim = { statement: string; span: string; result: string; evidence: string; authority: string };
export type Profile = {
  checker?: string;
  answers?: Record<string, { answer: string; quote: string }>;
  matches?: { entry: string; span: string }[];
  nearest?: { title: string; author: string; shared: string };
  beat?: number;
  flags?: string[];
};
/** One brief of an auto run. `passes` is how many check passes the run made on it; a run stored before it was counted has one row per pass. */
export type AutoRound = { round: number; id: string; open: number; total: number; accepted: number; calls: number; passes?: number };
export type AutoResult = { id: string; rounds: AutoRound[]; best: AutoRound; stopped: "floor" | "cap" | "patience" | "budget"; floor: number; calls: number; left_open: number };
/** `dropped`: the verify pass took it off the list. `rare`: seen in too few samples, counted only when the rare ones were asked for. */
export type OffList = { dropped: number; rare: number | null };
export type FindingsSummary = { pass: string | null; reported: number; accepted: number; open: number; total: number };
/** `listed` is the gate's list; `reopened` would undo an earlier fix; `left` is what left the list and is still open, present when asked for. */
export type Findings = { pass: string | null; findings: Finding[]; listed: Finding[]; reopened: Finding[]; left: Finding[]; summary: FindingsSummary | null; off_list: OffList; claims: Claim[]; profiles: Profile[]; examined: { stage: string; sample: number; examined: string }[]; judge: string | null; score_max: number; structure: string[] };
export type Beat = { n: number; words: number; job: string; known: string; withheld: { item: string; until: number }[]; stakes: string; absorbs: string };
export type Scene = { beat: number; text: string; artifact_id: string; step_id: string };
export type Slop = {
  words: number;
  pool_words: number;
  lexicon: { term: string; count: number }[];
  not_but: { hits: number; per_10k: number; pool_per_10k: number; examples: string[] };
  trigrams: { trigram: string; count: number }[];
  paragraphs: { beat: number; words: number; paragraphs: number; mean_words: number; single_sentence_share: number }[];
};
export type Story = {
  schedule: { form: Record<string, string>; beats: Beat[]; raw: string } | null;
  scenes: Scene[];
  profiles: (Profile & { beat: number; flags: string[]; answers: Record<string, { answer: string; quote: string }> })[];
  screenFindings: Finding[];
  slop: Slop | null;
  judge: string | null;
  text: string;
};
export type DraftConfig = {
  length: { words: number; tolerance: number };
  beats: { count: "auto" | number; min: number; max: number; words_min: number; words_max: number };
  form: { tense: string; person: string; chronology: string; container: string; ending: string };
  structure: { template: string };
  scenes: { order: string };
  checks: { enabled: string[]; samples: number; keep_if: number };
  screens: { enabled: string[]; samples: number; keep_if: number };
  repair: { rounds: number };
};
/** A draw's steps come without their text; `/api/steps/:id` carries it when a step is opened. */
export type Step = {
  id: string;
  parent_id: string | null;
  stage: string;
  tab: string | null;   // the tab this step belongs in; the server decides, the page filters by it
  model: string;
  system_prompt: string;
  status: string;
  fail_reason: string | null;
  attempt: number;
  started_at: string;
  ended_at: string | null;
  error: string | null;
  prompt_chars: number;
  raw_chars: number;
};
export type FullStep = Step & { prompt: string; raw_response: string | null; parsed: string | null };
/** The meta is parsed by the server; its keys are app/pipeline/artifacts.ts. */
export type Artifact = { id: string; step_id: string; kind: string; content: string; meta: Record<string, any> };
/** The repair settings a draw would run under: its own, or the defaults until it has its own. */
export type Repair = { rounds: number; stop_score: number; patience: number; max_calls: number };
/** What every gate action answers: the draw to show next, whether the work goes on, and the action's own payload. */
export type GateResult = { draw: string | null; running: boolean; payload: any };
/** One part of a brief, as the server reads it: its role, its text and the meta of the step that wrote it. */
export type Part = { role: string; stage: string; stepId: string; text: string; meta: any; index: number };
/** The part standing in each role of a brief now. The server decides which; the page only shows them. */
export type Parts = { vignette: Part | null; outline: Part | null; contexts: Part[]; ending: Part | null };
export type Candidate = { step_id: string; index: number; probability: number; premise: string; vignette: string; warnings: string[] };
/** A draw forked off this one, and the candidate's execute step it develops. */
export type Fork = { id: string; status: string; step_id: string; index: number };
/** The draw that ran the premises, and the candidate this one develops. */
export type Origin = { id: string; name: string | null; index: number | null; probability: number | null };

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}
export const api = {
  status: () => j<any>("/api/status"),
  facets: () => j<Facets>("/api/facets"),
  verdict: (b: { kind: string; target_id: string; verdict: "keep" | "pass"; artifact: boolean; note: string; method: string }) => j("/api/verdicts", { method: "POST", body: JSON.stringify(b) }),
  items: (q: Record<string, string>) => j<{ total: number; items: Item[] }>(`/api/items?${new URLSearchParams(q)}`),
  draws: (archived = false) => j<Draw[]>(`/api/draws${archived ? "?archived=true" : ""}`),
  draw: (id: string) => j<{ draw: Draw; origin: Origin | null; steps: Step[]; parts: Parts; checks_next: string[]; repair: Repair; checked: boolean; auto: AutoResult | null; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[]; forks: Fork[] }>(`/api/draws/${id}`),
  like: (id: string) => j<Like>(`/api/draws/${id}/like`),
  deleteDraw: (id: string) => j<GateResult>(`/api/draws/${id}`, { method: "DELETE", body: "{}" }),
  startDraw: (b: Record<string, string | undefined>) => j<{ id: string }>("/api/draws", { method: "POST", body: JSON.stringify(b) }),
  gate: (id: string, b: { action: string; step_id?: string; note?: string; findings?: string[]; finding?: string; beat?: number }) => j<GateResult>(`/api/draws/${id}/gate`, { method: "POST", body: JSON.stringify(b) }),
  check: (id: string) => j<GateResult>(`/api/draws/${id}/check`, { method: "POST", body: "{}" }),
  draft: (id: string, b: { auto?: boolean; profile?: string; overrides?: Record<string, string | number> }) => j<GateResult>(`/api/draws/${id}/draft`, { method: "POST", body: JSON.stringify(b) }),
  step: (id: string) => j<{ step: FullStep; artifacts: Artifact[] }>(`/api/steps/${id}`),
  findings: (id: string, all = false) => j<Findings>(`/api/draws/${id}/findings${all ? "?all=true" : ""}`),
  story: (id: string) => j<Story>(`/api/draws/${id}/story`),
  draftConfig: () => j<{ defaults: DraftConfig; profiles: string[]; byProfile: Record<string, DraftConfig> }>("/api/draft-config"),
  brief: (id: string) => j<Record<string, string>>(`/api/briefs/${id}`),
  briefFile: (id: string, file: string) => `/api/briefs/${id}/${file}`,
};

export type Status = {
  passages: number;
  passages_eligible: number;
  passages_suspect: number;
  per_source: { source: string; n: number; eligible: number }[];
  themes: number;
  themes_eligible: number;
  verdicts: number;
  draws: { status: string; n: number }[];
  /** How many draws wait for a person in each tab. */
  waiting: { ideate: number; check: number; write: number };
};
export type Source = { id: string; genre: string; group: string; title: string };
/** The options one draw was made with, for a form that starts another like it. */
export type Like = {
  mode: string;
  setting?: string;
  genre?: string;
  sampling?: string;
  darkness?: string;
  segment?: { source?: string | string[]; author?: string };
  seed?: { mode: "picked"; themeId: string } | { mode: "typed"; text: string };
  seed_text: string;
};
export type SamplingMode = { mode: string; floor: number; ceiling: number };
export type Facets = {
  sources: Source[];
  authors: string[];
  cells: { cell: string; n: number }[];
  settings: { id: string; name: string }[];
  genres: Record<string, string[]>;
  sampling: SamplingMode[];
  darkness: string[];
};

/** "14:54 today" for today's timestamps, otherwise "Sep 4, 03:00". */
export function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return today ? `${t} today` : `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d)}, ${t}`;
}
