export type Latest = { verdict: "keep" | "pass"; artifact: boolean; note: string; at: string; inherited_from: string | null } | null;
export type Item = { id: string; text: string; words?: number; cell?: string; title?: string; author?: string; genre?: string; source?: string; attestation?: number; stories?: string; latest: Latest; setting?: string; status?: string };
export type Run = { id: string; setting: string | null; genre: string; mode: string; segment: string | null; seed_mode: string; seed_text: string; example_ids: string; status: string; gate_method: string | null; chosen_step: string | null; flagged: number; flag_note: string; superseded_by: string | null; created_at: string; ended_at: string | null };
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
  queue: (kind: string, source?: string) => j<{ remaining: number; items: Item[] }>(`/api/queue?kind=${kind}&n=1${source ? `&source=${encodeURIComponent(source)}` : ""}`),
  verdict: (b: { kind: string; target_id: string; verdict: "keep" | "pass"; artifact: boolean; note: string; method: string }) => j("/api/verdicts", { method: "POST", body: JSON.stringify(b) }),
  items: (q: Record<string, string>) => j<{ total: number; items: Item[] }>(`/api/items?${new URLSearchParams(q)}`),
  runs: () => j<Run[]>("/api/runs"),
  run: (id: string) => j<{ run: Run; steps: Step[]; artifacts: Artifact[]; candidates: Candidate[] }>(`/api/runs/${id}`),
  startRun: (b: Record<string, string | undefined>) => j<{ id: string }>("/api/runs", { method: "POST", body: JSON.stringify(b) }),
  gate: (id: string, b: { action: string; step_id?: string; note?: string }) => j<any>(`/api/runs/${id}/gate`, { method: "POST", body: JSON.stringify(b) }),
  packet: (id: string) => j<Record<string, string>>(`/api/packets/${id}`),
};
