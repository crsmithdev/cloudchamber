export type Latest = { verdict: "keep" | "pass"; artifact: boolean; note: string; at: string; inherited_from: string | null } | null;
export type Item = { id: string; text: string; words?: number; cell?: string; suspect?: string[]; title?: string; author?: string; genre?: string; source?: string; passages?: number; attestation?: number; stories?: string; latest: Latest; setting?: string; status?: string };
export type Example = { id: string; text: string | null; words?: number; cell?: string; title?: string; author?: string; source?: string; story_id?: string; latest: Latest };
export type Draw = { id: string; name?: string; setting: string | null; genre: string; mode: string; segment: string | null; seed_mode: string; seed_text: string; example_ids: string; domains: string | null; status: string; gate_method: string | null; chosen_step: string | null; flagged: number; flag_note: string; superseded_by: string | null; repaired_from: string | null; draft_config: string | null; created_at: string; ended_at: string | null };
export type Finding = { id: string; artifact_id: string; checkers: string[]; samples: number[]; n: number; span: string; statement: string; result: string; evidence: string; invalidates: string; replacement: string; pass: string; source: "check" | "screen"; screen?: string; beat?: number; decision: "accepted" | "dismissed" | "open"; note: string };
export type Claim = { statement: string; span: string; result: string; evidence: string; authority: string };
export type Profile = { checker?: string; answers?: Record<string, { answer: string; quote: string }>; matches?: { entry: string; span: string }[]; nearest?: { title: string; author: string; shared: string }; beat?: number; flags?: string[] };
export type Findings = { pass: string | null; findings: Finding[]; claims: Claim[]; profiles: Profile[]; examined: { stage: string; sample: number; examined: string }[]; judge: string | null };
export type Beat = { n: number; words: number; job: string; known: string; withheld: { item: string; until: number }[]; stakes: string; absorbs: string };
export type Scene = { beat: number; text: string; artifact_id: string; step_id: string };
export type Slop = { words: number; pool_words: number; lexicon: { term: string; count: number }[]; not_but: { hits: number; per_10k: number; pool_per_10k: number; examples: string[] }; trigrams: { trigram: string; count: number }[]; paragraphs: { beat: number; words: number; paragraphs: number; mean_words: number; single_sentence_share: number }[] };
export type Story = { schedule: { form: Record<string, string>; beats: Beat[]; raw: string } | null; scenes: Scene[]; profiles: (Profile & { beat: number; flags: string[]; answers: Record<string, { answer: string; quote: string }> })[]; screenFindings: Finding[]; slop: Slop | null; judge: string | null; text: string };
export type DraftConfig = { length: { words: number; tolerance: number }; beats: { count: "auto" | number; min: number; max: number; words_min: number; words_max: number }; form: { tense: string; person: string; chronology: string; container: string; ending: string }; structure: { template: string }; scenes: { order: string }; checks: { enabled: string[]; samples: number; keep_if: number }; screens: { enabled: string[]; samples: number; keep_if: number }; repair: { rounds: number } };
export type Step = { id: string; parent_id: string | null; stage: string; model: string; system_prompt: string; prompt: string; raw_response: string | null; parsed: string | null; status: string; fail_reason: string | null; attempt: number; started_at: string; ended_at: string | null; error: string | null };
export type Artifact = { id: string; step_id: string; kind: string; content: string; meta: string };
export type Candidate = { step_id: string; index: number; probability: number; premise: string; vignette: string; warnings: string[] };

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}
export const api = {
  status: () => j<any>("/api/status"),
  facets: () => j<{ sources: { id: string; genre: string }[]; authors: string[]; cells: { cell: string; n: number }[]; settings: string[] }>("/api/facets"),
  verdict: (b: { kind: string; target_id: string; verdict: "keep" | "pass"; artifact: boolean; note: string; method: string }) => j("/api/verdicts", { method: "POST", body: JSON.stringify(b) }),
  items: (q: Record<string, string>) => j<{ total: number; items: Item[] }>(`/api/items?${new URLSearchParams(q)}`),
  draws: () => j<Draw[]>("/api/draws"),
  setting: (id: string) => j<{ id: string; name: string; draw: number; domains: { slug: string; heading: string }[] }>(`/api/settings/${id}`),
  draw: (id: string) => j<{ draw: Draw; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[] }>(`/api/draws/${id}`),
  startDraw: (b: Record<string, string | undefined>) => j<{ id: string }>("/api/draws", { method: "POST", body: JSON.stringify(b) }),
  gate: (id: string, b: { action: string; step_id?: string; note?: string; findings?: string[]; finding?: string; beat?: number }) => j<any>(`/api/draws/${id}/gate`, { method: "POST", body: JSON.stringify(b) }),
  check: (id: string) => j<{ id: string; status: string }>(`/api/draws/${id}/check`, { method: "POST", body: "{}" }),
  draft: (id: string, b: { auto?: boolean; profile?: string; overrides?: Record<string, string | number> }) => j<{ id: string; status: string }>(`/api/draws/${id}/draft`, { method: "POST", body: JSON.stringify(b) }),
  findings: (id: string) => j<Findings>(`/api/draws/${id}/findings`),
  story: (id: string) => j<Story>(`/api/draws/${id}/story`),
  draftConfig: () => j<{ defaults: DraftConfig; profiles: string[] }>("/api/draft-config"),
  brief: (id: string) => j<Record<string, string>>(`/api/briefs/${id}`),
  briefFile: (id: string, file: string) => `/api/briefs/${id}/${file}`,
};

export type Status = { passages: number; passages_eligible: number; passages_suspect: number; per_source: { source: string; n: number; eligible: number }[]; themes: number; themes_eligible: number; verdicts: number; draws: { status: string; n: number }[] };
export type Facets = { sources: { id: string; genre: string }[]; authors: string[]; cells: { cell: string; n: number }[]; settings: string[] };

/** "14:54 today" for today's timestamps, otherwise "Sep 4, 03:00". */
export function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return today ? `${t} today` : `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d)}, ${t}`;
}
