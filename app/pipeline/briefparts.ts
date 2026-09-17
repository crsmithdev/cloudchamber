/**
 * What the checking and drafting stages read from a finished draw: the brief's
 * pieces as artifacts, the six example passages, and the findings recorded
 * against it. Shared by check, repair, schedule, scenes, screens and export.
 */
import { RUN } from "./config.ts";
import type { DrawRow, Pipeline } from "./draw.ts";
import { fill } from "./prompts.ts";
import { latest } from "./verdicts.ts";
import { cluster, excludeDismissed, merge, normalise, same, score, type Cluster, type Finding } from "./recur.ts";

export type Artifact = { id: string; step_id: string; kind: string; content: string; meta: string };

let passCounter = 0;
/** A check or screen pass id: millisecond time plus a counter, so two passes never share one and sort in order. */
export function passId(): string { return `${new Date().toISOString()}-${(passCounter++).toString(36).padStart(3, "0")}`; }

export type BriefParts = {
  draw: DrawRow;
  seed: string;
  premise: string;
  outline: string;
  outlineStepId: string;
  vignette: string;
  chosenStepId: string;
  contexts: string[];
  ending: string;
  examples: string[];
  settingJobs: string[];   // outline sections beyond the three core jobs
};

export function briefParts(p: Pipeline, drawId: string): BriefParts {
  const draw = p.draw(drawId);
  const arts = p.artifacts(drawId);
  const steps = new Map(p.steps(drawId).map((s) => [s.id, s]));
  const stageOf = (a: Artifact) => steps.get(a.step_id)?.stage ?? "";
  const chosen = arts.find((a) => a.kind === "vignette" && a.step_id === draw.chosen_step);
  if (!chosen) throw new Error(`draw ${drawId}: no chosen vignette; the draw has not produced a brief`);
  const outline = [...arts].reverse().find((a) => a.kind === "outline");
  const ending = [...arts].reverse().find((a) => a.kind === "ending");
  if (!outline || !ending) throw new Error(`draw ${drawId}: brief incomplete (outline or ending missing)`);
  const contexts = arts.filter((a) => a.kind === "vignette" && stageOf(a) === "context").map((a) => a.content);
  const jobs = (JSON.parse(outline.meta).jobs as string[] | undefined) ?? [];
  const examples = (JSON.parse(draw.example_ids) as string[]).map((pid) => (p.db.query("SELECT text FROM passages WHERE id = ?").get(pid) as any)?.text).filter(Boolean);
  return {
    draw, seed: draw.seed_text, premise: JSON.parse(chosen.meta).premise ?? "", outline: outline.content, outlineStepId: outline.step_id,
    vignette: chosen.content, chosenStepId: chosen.step_id, contexts, ending: ending.content, examples,
    settingJobs: jobs.filter((j) => !(RUN.coreJobs as readonly string[]).includes(j)),
  };
}

export function briefBlock(b: BriefParts): string {
  return fill("briefBlock", { seed: b.seed, premise: b.premise, outline: b.outline, vignette: b.vignette, context1: b.contexts[0] ?? "", context2: b.contexts[1] ?? "", ending: b.ending });
}

// --- findings as artifacts -----------------------------------------------------

export type FindingMeta = Omit<Cluster, "reported"> & { pass: string; source: "check" | "screen"; screen?: string; beat?: number };
export type FindingView = FindingMeta & { artifact_id: string; decision: "accepted" | "dismissed" | "open"; note: string; score: number; samples_run: number; reported: boolean; relitigates?: Settled };
/** A finding accepted somewhere in this repair chain, and where. */
export type Settled = { finding: string; draw: string; round: number; replacement: string; span: string; statement: string };

export function findingArtifacts(p: Pipeline, drawId: string): (FindingMeta & { artifact_id: string })[] {
  return p.artifacts(drawId).filter((a) => a.kind === "finding").map((a) => ({ ...(JSON.parse(a.meta) as FindingMeta), artifact_id: a.id }));
}

/** The latest check pass id on a draw, or null when none has run. Pass ids sort as strings in time order. */
export function latestCheckPass(p: Pipeline, drawId: string): string | null {
  const passes = p.artifacts(drawId).filter((a) => a.kind === "ledger" || (a.kind === "finding" && JSON.parse(a.meta).source === "check") || a.kind === "profile" && JSON.parse(a.meta).source === "check")
    .map((a) => JSON.parse(a.meta).pass as string).filter(Boolean);
  return passes.length ? passes.sort().at(-1)! : null;
}

/** The distinct check pass ids on a draw, oldest first. */
export function checkPasses(p: Pipeline, drawId: string): string[] {
  const passes = p.artifacts(drawId)
    .filter((a) => a.kind === "ledger" || ((a.kind === "finding" || a.kind === "profile") && JSON.parse(a.meta).source === "check"))
    .map((a) => JSON.parse(a.meta).pass as string).filter(Boolean);
  return [...new Set(passes)].sort();
}

/**
 * How many samples each checker ran in one pass, read off the steps rather
 * than the configuration, so the score reflects what actually happened even
 * when draft.toml has changed since. Claims run once per claim, not S times.
 */
export function samplesPerChecker(p: Pipeline, drawId: string): Record<string, number> {
  const passes = Math.max(1, checkPasses(p, drawId).length);
  const out: Record<string, number> = { claims: 1 };
  const done = p.steps(drawId).filter((s) => s.status === "done" && /^check-/.test(s.stage));
  for (const s of done) {
    const checker = s.stage.replace(/^check-/, "");
    if (checker.startsWith("claims")) continue;
    out[checker] = (out[checker] ?? 0) + 1;
  }
  for (const k of Object.keys(out)) if (k !== "claims") out[k] = Math.max(1, Math.round(out[k] / passes));
  return out;
}

/** The sample count a merged cluster is scored against: the largest of its checkers'. */
export function samplesAgainst(f: { checkers: string[] }, per: Record<string, number>): number {
  return Math.max(1, ...f.checkers.map((c) => per[c] ?? 1));
}

export function decision(p: Pipeline, findingId: string): { decision: "accepted" | "dismissed" | "open"; note: string } {
  const l = latest(p.db, "finding", findingId);
  return l ? { decision: l.verdict === "keep" ? "accepted" : "dismissed", note: l.note } : { decision: "open", note: "" };
}

/** The reported check findings of the latest pass, with their gate decisions and scores, highest score first. */
export function checkFindings(p: Pipeline, drawId: string): FindingView[] {
  const pass = latestCheckPass(p, drawId);
  if (!pass) return [];
  const per = samplesPerChecker(p, drawId);
  const jobs = briefSettingJobs(p, drawId);
  const settled = settledConstraints(p, drawId);
  const outline = briefOutline(p, drawId);
  return findingArtifacts(p, drawId).filter((f) => f.source === "check" && f.pass === pass)
    .map((f) => withScore(p, f, per, jobs, !(f as { sub_threshold?: boolean }).sub_threshold, settled, outline))
    .sort((a, b) => b.score - a.score);
}

/** The setting jobs of a draw's outline, for the score's severity term. Empty when the draw has no brief yet. */
function briefSettingJobs(p: Pipeline, drawId: string): string[] {
  const outline = [...p.artifacts(drawId)].reverse().find((a) => a.kind === "outline");
  const jobs = (outline ? (JSON.parse(outline.meta).jobs as string[] | undefined) : undefined) ?? [];
  return jobs.filter((j) => !(RUN.coreJobs as readonly string[]).includes(j));
}

/** The text of a draw's outline, so the score can tell a span quoted from it. Empty when the draw has no brief yet. */
function briefOutline(p: Pipeline, drawId: string): string {
  return [...p.artifacts(drawId)].reverse().find((a) => a.kind === "outline")?.content ?? "";
}

export function withScore(p: Pipeline, f: FindingMeta & { artifact_id: string }, per: Record<string, number>, settingJobs: string[], reported: boolean, settled: Settled[] = [], outline = ""): FindingView {
  const samples_run = samplesAgainst(f, per);
  const re = relitigated(f, settled);
  return { ...f, ...decision(p, f.id), score: score(f, samples_run, settingJobs, outline), samples_run, reported, ...(re ? { relitigates: re } : {}) };
}

/**
 * The clusters the latest pass found but did not report, because they recurred
 * in fewer than keep_if samples. They are reconstructed from each checker
 * step's parsed findings, so no call is made and every past pass can be read
 * this way. A cluster overlapping a reported or dismissed finding is dropped.
 */
export function subThresholdFindings(p: Pipeline, drawId: string): FindingView[] {
  const pass = latestCheckPass(p, drawId);
  if (!pass) return [];
  const per = samplesPerChecker(p, drawId);
  const jobs = briefSettingJobs(p, drawId);
  const reported = checkFindings(p, drawId);
  const dismissed = dismissedFindings(p, drawId);
  const perChecker: Cluster[] = [];
  const stages = [...new Set(p.steps(drawId).filter((s) => /^check-/.test(s.stage)).map((s) => s.stage))];
  for (const stage of stages) {
    const checker = stage.replace(/^check-/, "");
    if (checker.startsWith("claims") || !per[checker]) continue;
    // the latest pass ran the last `samples` steps of this stage
    const steps = p.steps(drawId).filter((s) => s.stage === stage && s.status === "done" && s.parsed).slice(-per[checker]);
    const findings: Finding[] = [];
    steps.forEach((step, i) => {
      const parsed = JSON.parse(step.parsed!) as { findings?: Finding[] };
      for (const f of parsed.findings ?? []) if (f?.span) findings.push({ ...f, checker, sample: i + 1 });
    });
    if (findings.length) perChecker.push(...cluster(findings, 1, jobs, drawId));
  }
  // the same span from two checkers is one finding, as it is above the bar
  const hidden = excludeDismissed(merge(perChecker, jobs).filter((c) => !reported.some((r) => same(r, c))), dismissed);
  const settled = settledConstraints(p, drawId);
  const outline = briefOutline(p, drawId);
  return hidden.map((c) => {
    const { reported: _r, ...meta } = c;
    return withScore(p, { ...meta, pass, source: "check", artifact_id: "" }, per, jobs, false, settled, outline);
  }).sort((a, b) => b.score - a.score);
}

/** Every finding the gate can act on: the reported ones, and the sub-threshold ones when asked for. */
export function gateFindings(p: Pipeline, drawId: string, all = false): FindingView[] {
  const reported = checkFindings(p, drawId);
  return all ? [...reported, ...subThresholdFindings(p, drawId)].sort((a, b) => b.score - a.score) : reported;
}

/**
 * Every replacement accepted anywhere in this repair chain, oldest round
 * first. A dismissal was already remembered for ever; an accepted fix was
 * remembered for one round, so a later round was free to contradict it and the
 * checker was free to flag the fix as the defect. Measured at 35% of findings
 * over an eight-round chain.
 */
export function settledConstraints(p: Pipeline, drawId: string): Settled[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let id: string | null = drawId;
  while (id && !seen.has(id)) { seen.add(id); chain.push(id); id = p.draw(id).repaired_from; }
  chain.reverse();
  const out: Settled[] = [];
  chain.forEach((draw, i) => {
    for (const f of findingArtifacts(p, draw)) {
      if (f.source !== "check" || decision(p, f.id).decision !== "accepted") continue;
      if (!f.replacement.trim() || f.replacement.trim().toLowerCase() === "none") continue;
      if (out.some((o) => same(o, f))) continue;
      out.push({ finding: f.id, draw, round: i + 1, replacement: f.replacement, span: f.span, statement: f.statement });
    }
  });
  return out;
}

/**
 * The settled fix a finding re-opens, or undefined. The test is whether this
 * is the same defect as one already accepted — the existing cluster rule, on
 * span and statement — not whether it quotes the replacement text. The repair
 * paraphrases its constraints, so matching against the replacement decays from
 * 31% of findings at 0.5 overlap to 9% at 0.7 and answers nothing.
 */
export function relitigated(f: { span: string; statement: string }, settled: Settled[]): Settled | undefined {
  return settled.find((sc) => same(f, sc));
}

/** Findings dismissed on this draw or any brief it repairs; a re-check does not raise them again. */
export function dismissedFindings(p: Pipeline, drawId: string): { span: string; statement: string }[] {
  const out: { span: string; statement: string }[] = [];
  const seen = new Set<string>();
  let id: string | null = drawId;
  while (id && !seen.has(id)) {
    seen.add(id);
    for (const f of findingArtifacts(p, id)) if (f.source === "check" && decision(p, f.id).decision === "dismissed") out.push({ span: f.span, statement: f.statement });
    id = p.draw(id).repaired_from;
  }
  return out;
}

/**
 * The ledger this brief is held to: the one extracted at the root of the
 * repair chain, plus the replacements accepted since, in order.
 *
 * Re-extracting it every round was the reason a chain never converged. Over an
 * eight-round chain not one ledger line survived from one round to the next,
 * and the categories changed wholesale, so each round measured the brief
 * against a standard it had just invented. Pinned, the standard moves only
 * when Chris accepts a finding, and the amendment says so.
 *
 * An amendment overrides the base line it overturns; the base line is not
 * struck. On the pit chain the base said the copy of down points at the pit
 * and round 1 settled that it points at the person, and the checker held the
 * prose to both. The header now says which one holds.
 */
export function pinnedLedger(p: Pipeline, drawId: string): string | null {
  let root = drawId;
  const seen = new Set<string>();
  while (!seen.has(root)) { seen.add(root); const up: string | null = p.draw(root).repaired_from; if (!up) break; root = up; }
  const base = firstLedger(p, root) ?? latestLedger(p, drawId);
  if (!base) return null;
  const amendments = settledConstraints(p, drawId);
  if (!amendments.length) return base;
  return [base, "", "amended by the findings accepted since; where an amendment and a line above disagree, the amendment holds and the line above is void:", ...amendments.map((a) => `- ${a.replacement}`)].join("\n");
}

/**
 * The profile each profile-only checker produced anywhere in this repair chain,
 * newest first. Structure and resemblance describe the premise, not the text a
 * repair rewrites, so their answers do not move between rounds. Running them
 * every round was about 5% of a chain's input tokens for an unchanging answer.
 */
export function chainProfile(p: Pipeline, drawId: string, checker: string): { pass: string; draw: string; meta: any } | null {
  const seen = new Set<string>();
  let id: string | null = drawId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const hit = p.artifacts(id).filter((a) => a.kind === "profile")
      .map((a) => ({ draw: id!, meta: JSON.parse(a.meta) as any }))
      .filter((x) => x.meta.source === "check" && x.meta.checker === checker)
      .sort((a, b) => String(a.meta.pass).localeCompare(String(b.meta.pass)));
    if (hit.length) { const last = hit.at(-1)!; return { pass: String(last.meta.pass), draw: last.draw, meta: last.meta }; }
    id = p.draw(id).repaired_from;
  }
  return null;
}

/** The first ledger extracted on a draw: the contract, before any amendment. */
export function firstLedger(p: Pipeline, drawId: string): string | null {
  const ls = p.artifacts(drawId).filter((a) => a.kind === "ledger");
  if (!ls.length) return null;
  return ls.sort((a, b) => (JSON.parse(a.meta).pass as string).localeCompare(JSON.parse(b.meta).pass))[0].content;
}

/**
 * Every claim verified anywhere in this repair chain under the same authority.
 * A lore setting's distillate does not change between rounds, so a claim's
 * verdict cannot either, and re-verifying it is the largest single slice of a
 * round's cost: one call per extracted claim, twelve on a typical brief.
 */
export function claimVerdicts(p: Pipeline, drawId: string, authority: string): CachedClaim[] {
  const out: CachedClaim[] = [];
  const seen = new Set<string>();
  let id: string | null = drawId;
  while (id && !seen.has(id)) {
    seen.add(id);
    for (const a of p.artifacts(id).filter((x) => x.kind === "claim")) {
      const m = JSON.parse(a.meta) as { span?: string; result?: string; evidence?: string; authority?: string; invalidates?: string; replacement?: string; patch?: string };
      if (m.authority !== authority || !m.result) continue;
      if (out.some((o) => normalise(o.statement) === normalise(a.content))) continue;
      out.push({ statement: a.content, span: m.span ?? "", result: m.result, evidence: m.evidence ?? "none", invalidates: m.invalidates ?? "none", replacement: m.replacement ?? "", patch: m.patch ?? "", draw: id });
    }
    id = p.draw(id).repaired_from;
  }
  return out;
}

export type CachedClaim = { statement: string; span: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string; draw: string };

/** The ledger the latest check extracted, or null. */
export function latestLedger(p: Pipeline, drawId: string): string | null {
  const ls = p.artifacts(drawId).filter((a) => a.kind === "ledger");
  if (!ls.length) return null;
  return ls.sort((a, b) => (JSON.parse(a.meta).pass as string).localeCompare(JSON.parse(b.meta).pass))[ls.length - 1].content;
}

/** The model family of a model id: the second token of claude-<family>-... */
export const family = (model: string) => model.split("-")[1] ?? model;

/**
 * The line every findings view carries when judge and generator share a
 * family, or null when at least one check ran on another family.
 */
export function judgeNote(p: Pipeline, drawId: string): string | null {
  const steps = p.steps(drawId).filter((s) => s.status === "done" && !["copied", "deterministic", "patched"].includes(s.model));
  const gen = new Set(steps.filter((s) => !/^(check|screen)-/.test(s.stage)).map((s) => family(s.model)));
  const judges = steps.filter((s) => /^(check|screen)-/.test(s.stage)).map((s) => family(s.model));
  if (!judges.length) return null;
  let genFamilies = gen;
  if (!genFamilies.size) {
    // a repaired draw's generation may be copied; look at the brief it repairs
    const from = p.draw(drawId).repaired_from;
    if (from) genFamilies = new Set(p.steps(from).filter((s) => s.status === "done" && !/^(check|screen)-/.test(s.stage) && s.model !== "copied").map((s) => family(s.model)));
  }
  const shared = judges.every((j) => genFamilies.has(j));
  return shared ? `checked on ${[...new Set(judges)].join(", ")}; judge and generator share a family` : null;
}
