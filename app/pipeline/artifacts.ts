/**
 * An artifact as the pipeline reads it: the meta parsed once, at the read, and
 * named per kind. Every stage writes a `meta` record beside its content, and
 * every reader used to parse the JSON for itself, so the keys were a
 * vocabulary no module owned and one predicate parsed one row three times.
 * The keys are declared here, `Pipeline.artifacts` parses, and a reader that
 * wants one kind asks for it by name and gets that kind's meta.
 */
import type { Cluster } from "./recur.ts";
import type { Answer } from "./check.ts";
import type { Beat } from "./write.ts";

/** A finding as a check or screen stores it; `dropped` is the verify pass's reason for taking it off the reported list. */
export type FindingMeta = Omit<Cluster, "reported"> & { pass: string; source: "check" | "screen"; screen?: string; beat?: number; sub_threshold?: boolean; dropped?: string };
export type ProfileMeta = { pass: string; source: "check" | "screen"; sample?: number; checker?: string; screen?: string; beat?: number; answers?: Record<string, Answer>; flags?: string[]; samples?: number; [k: string]: unknown };
export type SceneMeta = { beat: number; words: number; cap: number; warnings: string[]; rewrite?: boolean; rewrite_finding?: string; patched?: string[] };
export type PassMeta = { pass: string; samples?: Record<string, number> };
export type LedgerMeta = { pass: string; sample: number; pinned?: boolean; ledger_only?: boolean };
export type ScheduleMeta = { form: Record<string, string>; beats: Beat[]; words: number };
/** What a part of a brief carries: its candidate or job, where it came from, what landed in it. */
export type PartMeta = {
  index?: number; probability?: number; premise?: string; job?: string; jobs?: string[]; words?: number; warnings?: string[];
  forked_from?: string; copied_from?: string; rewritten_from?: string; patched?: string[]; previous?: string; copied?: boolean;
  constraints?: string[]; accepted?: string[];
};
export type ClaimMeta = { pass: string; span: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string; authority: string; cached_from?: string };
export type AutoMeta = { rounds: number; stopped: string; best: string };

export type MetaByKind = {
  finding: FindingMeta; profile: ProfileMeta; scene: SceneMeta; pass: PassMeta; ledger: LedgerMeta; schedule: ScheduleMeta;
  vignette: PartMeta; outline: PartMeta; ending: PartMeta; job: PartMeta; claim: ClaimMeta; auto: AutoMeta;
};
export type Meta = Record<string, any>;
export type Artifact<K extends string = string> = { id: string; step_id: string; kind: K; content: string; meta: K extends keyof MetaByKind ? MetaByKind[K] : Meta };

export const parseMeta = (s: string): Meta => JSON.parse(s);
/** The artifacts of one kind, oldest first, each with the meta that kind carries. */
export const ofKind = <K extends string>(arts: Artifact[], kind: K): Artifact<K>[] => arts.filter((a) => a.kind === kind) as Artifact<K>[];
/** The newest artifact of one kind, or undefined. */
export const latestOf = <K extends string>(arts: Artifact[], kind: K): Artifact<K> | undefined => ofKind(arts, kind).at(-1);
