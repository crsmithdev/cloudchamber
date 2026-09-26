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
/*
 * The server's own view types, imported type-only (the build erases them), so a
 * field the page reads and the server stops sending fails to compile here.
 */
import type { DrawListRow, DrawDetail, StepSummary } from "../../pipeline/views.ts";
import type { AutoResult, AutoRound, FindingsSummary, FindingsView, GateFinding } from "../../pipeline/drafting.ts";
import type { Beat } from "../../pipeline/write.ts";
import type { DraftView } from "../../pipeline/drafts.ts";
import type { SlopReport } from "../../pipeline/slop.ts";
import type { ListenProfile, ListenReport } from "../../pipeline/listen.ts";
import type { DraftConfig } from "../../pipeline/draftconfig.ts";
import type { StepRow } from "../../pipeline/draw.ts";
import type { Artifact } from "../../pipeline/artifacts.ts";
import type { Part } from "../../pipeline/briefparts.ts";
import type { Origin } from "../../pipeline/stage.ts";
import type { GateResult } from "../../pipeline/gate.ts";

export type { AutoResult, AutoRound, FindingsSummary, Beat, DraftConfig, Artifact, Part, Origin, GateResult, ListenProfile, DrawDetail };
export type Draw = DrawListRow;
/** What the list row and the draw detail both carry: the row, the lifecycle answers, and what superseded it. */
export type DrawBase = DrawDetail["draw"];
/** What a round of a repair chain shows in the list. Null until the server has computed it. */
export type CheckSummary = FindingsSummary;
export type Finding = GateFinding;
export type Claim = { statement: string; span: string; result: string; evidence: string; authority: string };
/** A check's profile of a brief, as the page reads it: structure answers, or the resemblance matches and the nearest story. */
export type Profile = {
  checker?: string;
  answers?: Record<string, { answer: string; quote: string }>;
  matches?: { entry: string; span: string }[];
  nearest?: { title: string; author: string; shared: string };
  beat?: number;
  flags?: string[];
};
/** The server leaves claims and profiles loosely typed; the page reads them as above. */
export type Findings = Omit<FindingsView, "claims" | "profiles"> & { claims: Claim[]; profiles: Profile[] };
export type Scene = DraftView["scenes"][number];
export type Slop = SlopReport;
export type Listen = ListenReport;
export type Story = DraftView & { text: string };
/** A draw's steps come without their text; `/api/steps/:id` carries it when a step is opened. */
export type Step = StepSummary;
export type FullStep = StepRow;
/** The draft defaults, plus the model each stage runs on, the groups a form sets at once, and the models it offers. */
export type DraftConfigView = { defaults: DraftConfig; profiles: string[]; byProfile: Record<string, DraftConfig>; stages: Record<string, string>; groups: Record<string, string[]>; models: string[] };
/** The repair settings a draw would run under: its own, or the defaults until it has its own. */
export type Repair = DrawDetail["repair"];
/** The part standing in each role of a brief now. The server decides which; the page only shows them. */
export type Parts = DrawDetail["parts"];
export type Candidate = DrawDetail["candidates"][number];
/** A draw forked off this one, and the candidate's execute step it develops. */
export type Fork = DrawDetail["forks"][number];

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
  draw: (id: string) => j<DrawDetail>(`/api/draws/${id}`),
  like: (id: string) => j<Like>(`/api/draws/${id}/like`),
  deleteDraw: (id: string) => j<GateResult>(`/api/draws/${id}`, { method: "DELETE", body: "{}" }),
  startDraw: (b: Record<string, string | undefined | Record<string, string>>) => j<{ id: string }>("/api/draws", { method: "POST", body: JSON.stringify(b) }),
  gate: (id: string, b: { action: string; step_id?: string; note?: string; findings?: string[]; finding?: string; beat?: number }) => j<GateResult>(`/api/draws/${id}/gate`, { method: "POST", body: JSON.stringify(b) }),
  check: (id: string) => j<GateResult>(`/api/draws/${id}/check`, { method: "POST", body: "{}" }),
  draft: (id: string, b: { auto?: boolean; profile?: string; overrides?: Record<string, string | number>; models?: Record<string, string> }) => j<GateResult>(`/api/draws/${id}/draft`, { method: "POST", body: JSON.stringify(b) }),
  step: (id: string) => j<{ step: FullStep; artifacts: Artifact[] }>(`/api/steps/${id}`),
  findings: (id: string, all = false) => j<Findings>(`/api/draws/${id}/findings${all ? "?all=true" : ""}`),
  story: (id: string) => j<Story>(`/api/draws/${id}/story`),
  draftConfig: () => j<DraftConfigView>("/api/draft-config"),
  brief: (id: string) => j<Record<string, string>>(`/api/briefs/${id}`),
  briefFile: (id: string, file: string) => `/api/briefs/${id}/${file}`,
  reportPdf: (id: string) => `/api/draws/${id}/report.pdf`,
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
