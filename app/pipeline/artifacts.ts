/**
 * The artifact store: every artifact is written and read here. Each kind
 * declares its meta, a write is checked against that kind, and a read parses
 * the meta once and names it per kind. The keys used to be a vocabulary no
 * module owned: writes took any record, and readers parsed the JSON for
 * themselves and cast the fields they wanted.
 */
import { randomBytes } from "node:crypto";
import type { Db } from "./store/db.ts";
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
  index?: number; probability?: number; premise?: string; job?: string; jobs?: string[]; words?: number | Record<string, number>; warnings?: string[];
  forked_from?: string; copied_from?: string; rewritten_from?: string; patched?: string[]; previous?: string; copied?: boolean;
  constraints?: string[]; accepted?: string[];
};
export type ClaimMeta = { pass: string; span: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string; authority: string; cached_from?: string };
export type AutoMeta = { rounds: number; stopped: string; best: string };
/** A premise as the premises step numbered it: from the tail, with its stated probability. */
export type PremiseMeta = { index: number; probability: number; warnings: string[] };
/** The directory a brief was written to; a repair's names the draw it repaired. */
export type BriefMeta = { repaired_from?: string };
/** A draft-wide screen report; its content is the report's JSON. */
export type ReportMeta = { pass: string; source: "screen"; screen: string };

export type MetaByKind = {
  finding: FindingMeta; profile: ProfileMeta; scene: SceneMeta; pass: PassMeta; ledger: LedgerMeta; schedule: ScheduleMeta;
  vignette: PartMeta; outline: PartMeta; ending: PartMeta; job: PartMeta; claim: ClaimMeta; auto: AutoMeta;
  premise: PremiseMeta; brief: BriefMeta; slop: ReportMeta; listen: ReportMeta;
};
export type Kind = keyof MetaByKind;
export type Meta = Record<string, any>;
export type Artifact<K extends string = string> = { id: string; step_id: string; kind: K; content: string; meta: K extends keyof MetaByKind ? MetaByKind[K] : Meta; stage: string };

export const parseMeta = (s: string): Meta => JSON.parse(s);
/** The artifacts of one kind, oldest first, each with the meta that kind carries. */
export const ofKind = <K extends string>(arts: Artifact[], kind: K): Artifact<K>[] => arts.filter((a) => a.kind === kind) as Artifact<K>[];
/** The newest artifact of one kind, or undefined. */
export const latestOf = <K extends string>(arts: Artifact[], kind: K): Artifact<K> | undefined => ofKind(arts, kind).at(-1);

/** Store one artifact on a step, its meta checked against its kind. Returns the artifact's id. */
export function writeArtifact<K extends Kind>(db: Db, stepId: string, kind: K, content: string, meta: MetaByKind[K]): string {
  const id = `${kind}-${randomBytes(4).toString("hex")}`;
  db.query("INSERT INTO artifacts (id, step_id, kind, content, meta) VALUES (?, ?, ?, ?, ?)").run(id, stepId, kind, content, JSON.stringify(meta));
  return id;
}

/** Every artifact of a draw, or of one step, oldest first, with its step's stage and its meta parsed. */
export function readArtifacts(db: Db, of: { draw: string } | { step: string }): Artifact[] {
  const [where, key] = "draw" in of ? ["s.draw_id = ?", of.draw] : ["a.step_id = ?", of.step];
  const rows = db.query(`SELECT a.id, a.step_id, a.kind, a.content, a.meta, s.stage FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE ${where} ORDER BY s.started_at, a.rowid`).all(key) as { id: string; step_id: string; kind: string; content: string; meta: string; stage: string }[];
  return rows.map((r) => ({ ...r, meta: parseMeta(r.meta) }));
}

