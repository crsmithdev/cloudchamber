/**
 * Reading a draft back, and exporting a kept one to drafts/<draw>/ with its
 * schedule, findings, configuration and trail.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Pipeline } from "./draw.ts";
import { BRIEFS, DRAFTS } from "./paths.ts";
import { chainOf, type FindingView } from "./chain.ts";
import { ofKind } from "./artifacts.ts";
import { words } from "./model.ts";
import { toToml, type Resolved } from "./draftconfig.ts";
import type { Beat, Profile, Scene } from "./write.ts";
import type { SlopReport } from "./slop.ts";
import type { ListenReport } from "./listen.ts";
import { pipelineVersion } from "./version.ts";
import { PLAN_CAP, type Sym } from "./ir/s2.ts";

export type DraftView = {
  schedule: { form: Record<string, string>; beats: Beat[]; raw: string } | null;
  scenes: Scene[];
  profiles: Profile[];
  screenFindings: FindingView[];
  /** The plan check's findings, read-only (spec 2026-09-28-story-ir §14.5, S3′); `planCapped` when L4 returned its maximum and the list may be short. */
  planFindings: FindingView[];
  planCapped: boolean;
  /** The symbol table the plan check read the schedule against: the draw's latest L1 reading, or none. */
  symbols: Sym[];
  /** The flags the scenes as they stand were rewritten under, ticked at gate 2. */
  rewrittenUnder: string[];
  slop: SlopReport | null;
  listen: ListenReport | null;
  judge: string | null;
  directions: Direction[];
};

/** An instruction the operator gave at gate 2, with the beats it was given for. */
export type Direction = { text: string; beats: number[] };

/**
 * Every instruction this draw's scenes were rewritten under, oldest first, each
 * with its beats. A scene written under one keeps it in its meta through a
 * patch or a branch copy, so a later rewrite of the beat can carry it.
 */
export function directionsOf(p: Pipeline, drawId: string): Direction[] {
  const out = new Map<string, Set<number>>();
  for (const a of ofKind(p.artifacts(drawId), "scene")) {
    if (!a.meta.instruction) continue;
    out.set(a.meta.instruction, (out.get(a.meta.instruction) ?? new Set()).add(a.meta.beat));
  }
  return [...out].map(([text, beats]) => ({ text, beats: [...beats].sort((x, y) => x - y) }));
}

/** The draft as the chain reads it: the latest schedule, the scenes as they stand, each beat's latest screen pass. */
export function draftView(p: Pipeline, drawId: string): DraftView {
  const chain = chainOf(p, drawId);
  const planFindings = chain.planFindings();
  const scenes = chain.scenes();
  const l1 = chain.steps().filter((s) => s.stage === "ir-symbolize" && s.status === "done" && s.parsed).at(-1);
  // every scene written under a ticked flag, not only the scenes as they stand: a patch after the rewrite drops the mark
  const rewrittenUnder = [...new Set(ofKind(p.artifacts(drawId), "scene").flatMap((a) => (a.meta.rewrite_finding ?? "").split(", ").filter(Boolean)))];
  return { schedule: chain.schedule(), scenes, profiles: chain.screenProfiles(), screenFindings: chain.screenFindings(), planFindings, planCapped: planFindings.filter((f) => f.screen === "plan-ledger").length >= PLAN_CAP, symbols: l1 ? (JSON.parse(l1.parsed!) as Sym[]) : [], rewrittenUnder, slop: chain.slop(), listen: chain.listen(), judge: chain.judge(), directions: directionsOf(p, drawId) };
}

/** One line for a plan finding, as the story and the export print it: its kind, its beat if it has one, the finding, and the fix where L4 gave one. */
export const planLine = (f: FindingView): string =>
  `[${f.screen}${f.beat ? ` beat ${f.beat}` : ""}${f.question ? ", a question" : ""}] ${f.statement}${f.replacement ? ` → ${f.replacement}` : ""}`;
const CAP_LINE = `[plan] the plan reading returned its maximum of ${PLAN_CAP} findings; the list may be short`;

export function renderStory(v: DraftView, withFlags = true): string {
  const out: string[] = [];
  if (withFlags) {
    // the plan findings with no beat lead the story; a beat's own follow its scene
    for (const f of v.planFindings.filter((f) => !f.beat)) out.push(planLine(f));
    if (v.planCapped) out.push(CAP_LINE);
    if (out.length) out.push("");
  }
  v.scenes.forEach((s, i) => {
    if (i) out.push("", "* * *", "");
    out.push(s.text.trim());
    if (!withFlags) return;
    for (const f of v.screenFindings.filter((f) => f.beat === s.beat)) out.push("", `[screen-${f.screen} beat ${s.beat}] ${f.span} → ${f.replacement}`);
    const pr = v.profiles.find((x) => x.beat === s.beat);
    if (pr) for (const q of pr.flags) out.push("", `[screen-structure beat ${s.beat}] ${q}: ${pr.answers[q].quote}`);
    for (const f of v.planFindings.filter((f) => f.beat === s.beat)) out.push("", planLine(f));
  });
  if (withFlags && v.judge) out.push("", v.judge);
  return out.join("\n") + "\n";
}

function renderSchedule(v: DraftView): string {
  if (!v.schedule) return "";
  const out = ["# Schedule", "", ...Object.entries(v.schedule.form).map(([k, x]) => `- ${k}: ${x}`), ""];
  for (const b of v.schedule.beats) {
    out.push(`## Beat ${b.n} · ${b.words} words${b.absorbs && b.absorbs !== "none" ? ` · absorbs ${b.absorbs}` : ""}`, "", `**Job.** ${b.job}`, "", `**Known by its end.** ${b.known}`, "",
      `**Withheld after it.**${b.withheld.length ? "" : " nothing"}`, ...b.withheld.map((w) => `- ${w.item} — beat ${w.until}`), "", `**Stakes.** ${b.stakes}`, "");
  }
  return out.join("\n");
}

function renderFindings(p: Pipeline, drawId: string, v: DraftView): string {
  const checks = chainOf(p, drawId).findings();
  const out = ["# Findings", ""];
  out.push("## Check", "");
  if (!checks.length) out.push("none reported", "");
  for (const f of checks) out.push(`- **${f.id}** ${f.checkers.join("+")} ×${f.n} [${f.invalidates}] ${f.decision}${f.note ? `: ${f.note}` : ""}`, `  span: ${f.span}`, `  ${f.statement}`, `  evidence: ${f.evidence}`, `  replacement: ${f.replacement}`, "");
  out.push("## Plan", "", "The schedule read against the pinned ledger before any scene was written. Informational: nothing acts on these.", "");
  if (!v.planFindings.length) out.push("- none", "");
  for (const f of v.planFindings) out.push(`- ${planLine(f).slice(1).replace("] ", ": ")}`);
  if (v.planCapped) out.push(`- ${CAP_LINE.slice("[plan] ".length)}`);
  if (v.planFindings.length) out.push("");
  out.push("## Screens", "");
  for (const s of v.scenes) {
    const fs = v.screenFindings.filter((f) => f.beat === s.beat), pr = v.profiles.find((x) => x.beat === s.beat);
    out.push(`### Beat ${s.beat}`, "");
    // each flag under the screen that raised it: a restated flag is not a ledger flag
    for (const f of fs) out.push(`- ${f.screen}: ${f.span} → ${f.replacement}`);
    for (const q of pr?.flags ?? []) out.push(`- structure ${q}: ${pr!.answers[q].quote}`);
    if (!fs.length && !pr?.flags.length) out.push("- none");
    out.push("");
  }
  if (v.slop) {
    out.push("## Slop", "", `- lexicon: ${v.slop.lexicon.map((l) => `${l.term} ×${l.count}`).join(", ") || "none"}`,
      `- not-X-but-Y: ${v.slop.not_but.per_10k} per 10k (pool ${v.slop.not_but.pool_per_10k})`,
      `- repeated trigrams absent from the pool: ${v.slop.trigrams.map((t) => `"${t.trigram}" ×${t.count}`).join(", ") || "none"}`,
      `- paragraphs: ${v.slop.paragraphs.map((x) => `beat ${x.beat} ${x.paragraphs}p mean ${x.mean_words}w single ${Math.round(x.single_sentence_share * 100)}%`).join("; ")}`, "");
  }
  if (v.listen) {
    const row = (k: keyof typeof v.listen.story) => `${v.listen!.story[k]} (pool ${v.listen!.pool[k]})`;
    out.push("## Listen", "", `- ${v.listen.minutes} min at the pool's ${v.listen.pool_wpm} wpm`, `- words per sentence: ${row("sentence_mean")}`, `- sentences over 30 words: ${row("long_sentence_share")}`,
      `- numerals per 1k: ${row("numerals_per_1k")}`, `- quote marks per 1k: ${row("quotes_per_1k")}`, `- the body named per 1k: ${row("body_per_1k")}`, `- the listener addressed per 1k: ${row("you_per_1k")}`, `- first person per 1k: ${row("first_person_per_1k")}`, "");
  }
  if (v.judge) out.push(v.judge, "");
  return out.join("\n");
}

/** Write drafts/<draw>/ for a kept story. */
export function exportDraft(p: Pipeline, drawId: string, resolved: Resolved, gate2: string[], base: string = DRAFTS, briefs: string = BRIEFS): string {
  const v = draftView(p, drawId);
  const dir = join(base, drawId);
  mkdirSync(dir, { recursive: true });
  const w = (name: string, body: string) => writeFileSync(join(dir, name), body.trimEnd() + "\n");
  w("story.md", renderStory(v, false));
  w("schedule.md", renderSchedule(v));
  w("findings.md", renderFindings(p, drawId, v));
  w("config.toml", toToml(resolved));
  const briefTrail = join(briefs, drawId, "trail.md");
  const steps = p.steps(drawId);
  const models = new Map<string, string>();
  for (const s of steps) if (s.status === "done" && ((s.model !== "patched" && s.model !== "operator") || !models.has(s.stage))) models.set(s.stage, s.model);
  const trail = [
    existsSync(briefTrail) ? readFileSync(briefTrail, "utf8").trimEnd() : `# Trail — ${drawId}`, "",
    "## draft", "",
    `config: ${resolved.profile ? `profile ${resolved.profile}` : "defaults"}${resolved.overridden.length ? ` · overridden ${resolved.overridden.join(", ")}` : ""}`, "",
    "### models", "", ...[...models].filter(([s]) => /^(check|repair|schedule|scene|screen)/.test(s)).map(([s, m]) => `- ${s}: ${m}`), "",
    "### scenes", "", ...v.scenes.map((s) => `- beat ${s.beat}: ${words(s.text)} words`), "",
    `screen flags: ${v.screenFindings.length} ledger, ${v.profiles.reduce((a, x) => a + x.flags.length, 0)} structure`,
    `plan findings: ${v.planFindings.length}${v.planFindings.some((f) => f.question) ? ` (${v.planFindings.filter((f) => f.question).length} questions)` : ""}`, "",
    ...(v.listen ? [`narration: about ${v.listen.minutes} min at ${v.listen.pool_wpm} wpm`, ""] : []),
    "### gate 2", "", ...(gate2.length ? gate2.map((g) => `- ${g}`) : ["- keep"]), "",
    ...(v.judge ? [v.judge, ""] : []),
    `steps: ${steps.length} · pipeline ${pipelineVersion()}`,
  ];
  w("trail.md", trail.join("\n"));
  return dir;
}
