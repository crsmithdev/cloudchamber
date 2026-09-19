/**
 * Reading a draft back, and exporting a kept one to drafts/<draw>/ with its
 * schedule, findings, configuration and trail.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Pipeline } from "./draw.ts";
import { BRIEFS, DRAFTS } from "./paths.ts";
import { chainOf, type FindingView } from "./chain.ts";
import { score } from "./recur.ts";
import { words } from "./model.ts";
import { toToml, type Resolved } from "./draftconfig.ts";
import { currentScenes, type Beat, type Profile, type Scene } from "./write.ts";
import type { Answer } from "./check.ts";
import type { SlopReport } from "./slop.ts";
import { pipelineVersion } from "./version.ts";
import { latestOf, ofKind } from "./artifacts.ts";

export type DraftView = {
  schedule: { form: Record<string, string>; beats: Beat[]; raw: string } | null;
  scenes: Scene[];
  profiles: Profile[];
  screenFindings: FindingView[];
  slop: SlopReport | null;
  judge: string | null;
};

/** The latest schedule, the current scenes, and each beat's latest screen pass. */
export function draftView(p: Pipeline, drawId: string): DraftView {
  const arts = p.artifacts(drawId);
  const sched = latestOf(arts, "schedule");
  const scenes = currentScenes(p, drawId);
  const profileArts = ofKind(arts, "profile").filter((a) => a.meta.source === "screen").map((a) => a.meta as Profile & { answers: Record<string, Answer> });
  const latestPass = new Map<number, string>();
  for (const pr of profileArts) if (!latestPass.has(pr.beat) || latestPass.get(pr.beat)! < pr.pass) latestPass.set(pr.beat, pr.pass);
  const profiles = profileArts.filter((pr) => latestPass.get(pr.beat) === pr.pass).sort((a, b) => a.beat - b.beat);
  // a screen's denominator is the highest sample number it recurred in, the same figure the panes print
  // a flag carries a verdict like a check finding does: applying its patch settles it
  const chain = chainOf(p, drawId);
  const screenFindings = chain.findingArtifacts().filter((f) => f.source === "screen" && (latestPass.get(f.beat!) ?? f.pass) === f.pass)
    .map((f) => { const samples_run = Math.max(f.n, ...f.samples); return { ...f, ...chain.decision(f.id), samples_run, score: score(f, samples_run), reported: true }; })
    .sort((a, b) => a.beat! - b.beat! || b.score - a.score);
  const slopArt = latestOf(arts, "slop");
  return {
    schedule: sched ? { form: sched.meta.form, beats: sched.meta.beats, raw: sched.content } : null,
    scenes, profiles, screenFindings, slop: slopArt ? (JSON.parse(slopArt.content) as SlopReport) : null, judge: chain.judge(),
  };
}

export function renderStory(v: DraftView, withFlags = true): string {
  const out: string[] = [];
  v.scenes.forEach((s, i) => {
    if (i) out.push("", "* * *", "");
    out.push(s.text.trim());
    if (!withFlags) return;
    for (const f of v.screenFindings.filter((f) => f.beat === s.beat)) out.push("", `[screen-${f.screen} beat ${s.beat}] ${f.span} → ${f.replacement}`);
    const pr = v.profiles.find((x) => x.beat === s.beat);
    if (pr) for (const q of pr.flags) out.push("", `[screen-structure beat ${s.beat}] ${q}: ${pr.answers[q].quote}`);
  });
  if (withFlags && v.judge) out.push("", v.judge);
  return out.join("\n") + "\n";
}

export function renderSchedule(v: DraftView): string {
  if (!v.schedule) return "";
  const out = ["# Schedule", "", ...Object.entries(v.schedule.form).map(([k, x]) => `- ${k}: ${x}`), ""];
  for (const b of v.schedule.beats) {
    out.push(`## Beat ${b.n} · ${b.words} words${b.absorbs && b.absorbs !== "none" ? ` · absorbs ${b.absorbs}` : ""}`, "", `**Job.** ${b.job}`, "", `**Known by its end.** ${b.known}`, "",
      `**Withheld after it.**${b.withheld.length ? "" : " nothing"}`, ...b.withheld.map((w) => `- ${w.item} — beat ${w.until}`), "", `**Stakes.** ${b.stakes}`, "");
  }
  return out.join("\n");
}

export function renderFindings(p: Pipeline, drawId: string, v: DraftView): string {
  const checks = chainOf(p, drawId).findings();
  const out = ["# Findings", ""];
  out.push("## Check", "");
  if (!checks.length) out.push("none reported", "");
  for (const f of checks) out.push(`- **${f.id}** ${f.checkers.join("+")} ×${f.n} [${f.invalidates}] ${f.decision}${f.note ? `: ${f.note}` : ""}`, `  span: ${f.span}`, `  ${f.statement}`, `  evidence: ${f.evidence}`, `  replacement: ${f.replacement}`, "");
  out.push("## Screens", "");
  for (const s of v.scenes) {
    const fs = v.screenFindings.filter((f) => f.beat === s.beat), pr = v.profiles.find((x) => x.beat === s.beat);
    out.push(`### Beat ${s.beat}`, "");
    for (const f of fs) out.push(`- ledger: ${f.span} → ${f.replacement}`);
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
  for (const s of steps) if (s.status === "done") models.set(s.stage, s.model);
  const trail = [
    existsSync(briefTrail) ? readFileSync(briefTrail, "utf8").trimEnd() : `# Trail — ${drawId}`, "",
    "## draft", "",
    `config: ${resolved.profile ? `profile ${resolved.profile}` : "defaults"}${resolved.overridden.length ? ` · overridden ${resolved.overridden.join(", ")}` : ""}`, "",
    "### models", "", ...[...models].filter(([s]) => /^(check|repair|schedule|scene|screen)/.test(s)).map(([s, m]) => `- ${s}: ${m}`), "",
    "### scenes", "", ...v.scenes.map((s) => `- beat ${s.beat}: ${words(s.text)} words`), "",
    `screen flags: ${v.screenFindings.length} ledger, ${v.profiles.reduce((a, x) => a + x.flags.length, 0)} structure`, "",
    "### gate 2", "", ...(gate2.length ? gate2.map((g) => `- ${g}`) : ["- keep"]), "",
    ...(v.judge ? [v.judge, ""] : []),
    `steps: ${steps.length} · pipeline ${pipelineVersion()}`,
  ];
  w("trail.md", trail.join("\n"));
  return dir;
}
