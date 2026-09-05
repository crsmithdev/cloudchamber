export type Latest = { verdict: "keep" | "pass"; artifact: boolean; note: string; at: string; inherited_from: string | null } | null;
export type Item = { id: string; text: string; words?: number; cell?: string; suspect?: string[]; title?: string; author?: string; genre?: string; source?: string; passages?: number; attestation?: number; stories?: string; latest: Latest; setting?: string; status?: string };
export type Example = { id: string; text: string | null; words?: number; cell?: string; title?: string; author?: string; source?: string; story_id?: string; latest: Latest };
export type QueueMode = "suspects-first" | "suspects" | "sample";
export type Draw = { id: string; name?: string; setting: string | null; genre: string; mode: string; segment: string | null; seed_mode: string; seed_text: string; example_ids: string; status: string; gate_method: string | null; chosen_step: string | null; flagged: number; flag_note: string; superseded_by: string | null; created_at: string; ended_at: string | null };
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
  queue: (kind: string, source?: string, mode: QueueMode = "suspects-first", n = 1) => j<{ remaining: number; suspects: number; items: Item[] }>(`/api/queue?kind=${kind}&n=${n}${source ? `&source=${encodeURIComponent(source)}` : ""}${mode === "suspects" ? "&suspect=true" : mode === "sample" ? "&sample=true" : ""}`),
  verdict: (b: { kind: string; target_id: string; verdict: "keep" | "pass"; artifact: boolean; note: string; method: string }) => j("/api/verdicts", { method: "POST", body: JSON.stringify(b) }),
  items: (q: Record<string, string>) => j<{ total: number; items: Item[] }>(`/api/items?${new URLSearchParams(q)}`),
  draws: () => j<Draw[]>("/api/draws"),
  draw: (id: string) => j<{ draw: Draw; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[]; examples: Example[] }>(`/api/draws/${id}`),
  startDraw: (b: Record<string, string | undefined>) => j<{ id: string }>("/api/draws", { method: "POST", body: JSON.stringify(b) }),
  gate: (id: string, b: { action: string; step_id?: string; note?: string }) => j<any>(`/api/draws/${id}/gate`, { method: "POST", body: JSON.stringify(b) }),
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
