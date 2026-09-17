/**
 * Stage 1: the checkers. K checkers, each its own headless call, none seeing
 * another's output, each run S times; findings clustered by recurrence and
 * merged across checkers; dismissed findings excluded. Structure and
 * resemblance produce profiles, never findings, and run once for the whole
 * repair chain. Claims run only when the setting declares an authority.
 *
 * The reported findings then go back to the model once, with the brief, and
 * only those whose span asserts the fact and whose evidence conflicts with it
 * stay reported; the rest are stored under the bar with the reason. The
 * checkers over-flag: on the pit chain they read an unstated count as a
 * contradiction and a stated rule as its own violation.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pipeline, StepRow } from "./draw.ts";
import { fill, type TemplateName } from "./prompts.ts";
import { tag, tags } from "./model.ts";
import { distillate, type ClaimsAuthority } from "./settings.ts";
import { samplesFor, type DraftConfig } from "./draftconfig.ts";
import { cluster, excludeDismissed, findingId, merge, normalise, parseFindings, type Cluster, type Finding } from "./recur.ts";
import { briefBlock, briefParts, chainProfile, claimVerdicts, dismissedFindings, passId, pinnedLedger, type BriefParts } from "./briefparts.ts";
import { RUN } from "./config.ts";

export const PREMISES_PATH = resolve(import.meta.dir, "premises.md");
export const CHECKERS = ["derivation", "ledger", "structure", "resemblance", "claims"] as const;
export type Checker = (typeof CHECKERS)[number];
export const STRUCTURE_QUESTIONS = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];

export type CheckResult = { pass: string; findings: Cluster[]; claims: "off" | ClaimsAuthority };

/** The prompt pair each authority runs: the web asks for real-world claims, the distillate asks for claims about the setting. */
const CLAIMS_PROMPTS: Record<ClaimsAuthority, { extract: TemplateName; verify: TemplateName }> = {
  world: { extract: "claimsExtract", verify: "claimsVerifyWorld" },
  setting: { extract: "claimsExtractSetting", verify: "claimsVerifySetting" },
};
export type Answer = { answer: "present" | "absent"; quote: string };

export function parseQuestions(text: string, names: string[]): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const m of text.matchAll(/<question\s+name="([^"]+)"\s*>([\s\S]*?)<\/question>/gi)) {
    const a = (tag(m[2], "answer") ?? "").toLowerCase();
    if (a !== "present" && a !== "absent") throw new Error(`question ${m[1]}: answer must be present or absent`);
    out[m[1].trim().toLowerCase()] = { answer: a, quote: tag(m[2], "quote") ?? "" };
  }
  for (const n of names) if (!out[n]) throw new Error(`missing <question name="${n}">`);
  return out;
}

export function loadPremiseList(path: string = PREMISES_PATH): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").split("\n").filter((l) => /^\d+\.\s/.test(l)).join("\n");
}

const findingShape = (settingJobs: string[]) => fill("findingShape", { sections: [...RUN.coreJobs, ...settingJobs].join(" | ") });

/** Run every enabled checker over the brief. The draw must hold a brief; status is the caller's. */
export async function runCheck(p: Pipeline, drawId: string, cfg: DraftConfig, opts: { checks?: string[]; samples?: number; premisesPath?: string } = {}): Promise<CheckResult> {
  const parts = briefParts(p, drawId);
  const brief = briefBlock(parts);
  const pass = passId();
  const enabled = (opts.checks ?? cfg.checks.enabled).filter((c) => (CHECKERS as readonly string[]).includes(c)) as Checker[];
  const dismissed = dismissedFindings(p, drawId);
  const shape = findingShape(parts.settingJobs);
  const S = (name: string) => opts.samples ? { samples: opts.samples, keep_if: Math.min(cfg.checks.keep_if, opts.samples) } : samplesFor(cfg.checks, name);
  const perChecker: { checker: string; clusters: Cluster[]; firstStep: StepRow }[] = [];

  const runs: Promise<unknown>[] = [];
  if (enabled.includes("derivation")) runs.push(sampled(p, drawId, parts, "check-derivation", fill("checkDerivation", { brief, findingShape: shape }), S("derivation"), "derivation", (t) => {
    if (!tag(t, "examined")) throw new Error("no <examined> tag");
    return { impossibility: tag(t, "impossibility"), findings: parseFindings(t, "derivation", 0), examined: tag(t, "examined") };
  }).then((r) => { perChecker.push(r); }));
  if (enabled.includes("ledger")) {
    // the ledger is extracted once for the chain and pinned; every round is checked against it
    let ledger = pinnedLedger(p, drawId);
    if (!ledger) {
      const r = await p.invoke(drawId, parts.outlineStepId, "ledger-extract", fill("ledgerExtract", { brief }), (t) => {
        const l = tag(t, "ledger"); if (!l) throw new Error("no <ledger> tag"); return l;
      });
      p.artifact(r.step, "ledger", String(r.value), { pass, sample: 1, pinned: true });
      ledger = String(r.value);
    }
    const block = fill("pinnedLedger", { ledger: ledger! });
    runs.push(sampled(p, drawId, parts, "check-ledger", fill("checkLedger", { brief, ledger: block, findingShape: shape }), S("ledger"), "ledger", (t) => {
      if (!tag(t, "examined")) throw new Error("no <examined> tag");
      return { findings: parseFindings(t, "ledger", 0), examined: tag(t, "examined") };
    }).then((r) => { perChecker.push(r); }));
  }
  // structure and resemblance profile the premise, which a repair never changes: once per chain
  if (enabled.includes("structure") && !chainProfile(p, drawId, "structure")) runs.push(sampled(p, drawId, parts, "check-structure", fill("checkStructure", { brief }), S("structure"), "structure", (t) => ({ answers: parseQuestions(t, STRUCTURE_QUESTIONS) }),
    (step, value, sample) => p.artifact(step, "profile", JSON.stringify(value.answers), { pass, sample, source: "check", checker: "structure", answers: value.answers })));
  if (enabled.includes("resemblance") && !chainProfile(p, drawId, "resemblance")) runs.push(sampled(p, drawId, parts, "check-resemblance", fill("checkResemblance", { brief, list: loadPremiseList(opts.premisesPath) }), S("resemblance"), "resemblance", (t) => {
    const nearest = tag(t, "nearest");
    if (!nearest) throw new Error("no <nearest> tag");
    const matches = tags(t, "match").map((m) => ({ entry: tag(m, "entry") ?? "", span: tag(m, "span") ?? "" }));
    return { matches, nearest: { title: tag(nearest, "title") ?? "", author: tag(nearest, "author") ?? "", shared: tag(nearest, "shared") ?? "" } };
  }, (step, value, sample) => p.artifact(step, "profile", JSON.stringify(value), { pass, sample, source: "check", checker: "resemblance", ...value })));

  let claims: CheckResult["claims"] = "off";
  const { setting } = p.loadDrawSetting(parts.draw);
  if (enabled.includes("claims") && setting?.claims) {
    claims = setting.claims;
    const reference = claims === "setting" ? distillate(setting) : "";
    runs.push(runClaims(p, drawId, parts, brief, claims, reference, pass).then((r) => { perChecker.push(r); }));
  }
  await Promise.all(runs);

  const reported = perChecker.flatMap((c) => c.clusters.filter((x) => x.reported));
  const merged = excludeDismissed(merge(reported, parts.settingJobs), dismissed);
  // a clean pass leaves no finding or profile behind, so the pass is marked on its own: the gate reads the latest pass, not the latest with findings
  if (perChecker.length) p.artifact(perChecker[0].firstStep, "pass", pass, { pass });
  const dropped = await verifyFindings(p, drawId, parts, brief, merged);
  for (const c of merged) {
    const owner = perChecker.find((x) => x.checker === c.checkers[0])!;
    const { reported: _r, ...meta } = c;
    const why = dropped.get(c.id);
    p.artifact(owner.firstStep, "finding", c.statement, { ...meta, pass, source: "check", ...(why ? { sub_threshold: true, dropped: why } : {}) });
  }
  return { pass, findings: merged.filter((c) => !dropped.has(c.id)), claims };
}

/**
 * The pairing step: one call reads every reported finding back against the
 * brief. Returns the ids to drop, each with the reason. Claims have their own
 * verifier and are not read again.
 */
async function verifyFindings(p: Pipeline, drawId: string, parts: BriefParts, brief: string, merged: Cluster[]): Promise<Map<string, string>> {
  const subject = merged.filter((c) => !(c.checkers.length === 1 && c.checkers[0] === "claims"));
  const out = new Map<string, string>();
  if (!subject.length) return out;
  const findings = subject.map((c, i) => `${i + 1}. span: "${c.span}"\n   statement: ${c.statement}\n   result: ${c.result}\n   evidence: ${c.evidence}`).join("\n");
  const { value } = await p.invoke(drawId, parts.outlineStepId, "check-verify", fill("checkVerify", { brief, findings }), (t) => parseVerdicts(t, subject.length));
  value.forEach((v, i) => { if (v.answer === "drop") out.set(subject[i].id, v.why); });
  return out;
}

export function parseVerdicts(text: string, n: number): { answer: "keep" | "drop"; why: string }[] {
  const byN = new Map<number, { answer: "keep" | "drop"; why: string }>();
  for (const m of text.matchAll(/<verdict\s+n="(\d+)"\s*>([\s\S]*?)<\/verdict>/gi)) {
    const a = (tag(m[2], "answer") ?? "").toLowerCase();
    if (a !== "keep" && a !== "drop") throw new Error(`verdict ${m[1]}: answer must be keep or drop`);
    byN.set(Number(m[1]), { answer: a, why: tag(m[2], "why") ?? "" });
  }
  return Array.from({ length: n }, (_, i) => { const v = byN.get(i + 1); if (!v) throw new Error(`missing <verdict n="${i + 1}">`); return v; });
}

/** S concurrent samples of one checker; the parsed value goes on each step, the findings are clustered. */
async function sampled(p: Pipeline, drawId: string, parts: BriefParts, stage: any, prompt: string, s: { samples: number; keep_if: number }, checker: string,
  parse: (text: string) => any, store?: (step: StepRow, value: any, sample: number) => void): Promise<{ checker: string; clusters: Cluster[]; firstStep: StepRow }> {
  const results = await Promise.all(Array.from({ length: s.samples }, (_, i) => p.invoke(drawId, parts.outlineStepId, stage, prompt, parse).then((r) => ({ ...r, sample: i + 1 }))));
  results.sort((a, b) => a.sample - b.sample);
  const findings: Finding[] = [];
  for (const r of results) {
    store?.(r.step, r.value, r.sample);
    for (const f of (r.value.findings ?? []) as Finding[]) findings.push({ ...f, sample: r.sample });
  }
  return { checker, clusters: cluster(findings, s.keep_if, parts.settingJobs, drawId), firstStep: results[0].step };
}

const RESULTS = new Set(["supported", "contradicted", "unverifiable"]);

async function runClaims(p: Pipeline, drawId: string, parts: BriefParts, brief: string, authority: ClaimsAuthority, reference: string, pass: string) {
  const tpl = CLAIMS_PROMPTS[authority];
  const { step, value: claims } = await p.invoke(drawId, parts.outlineStepId, "check-claims-extract", fill(tpl.extract, { brief }), (t) =>
    tags(t, "claim").map((c) => ({ span: tag(c, "span") ?? "", statement: tag(c, "statement") ?? "" })).filter((c) => c.span && c.statement));
  // a claim already verified anywhere in this chain against the same authority is not re-verified:
  // the distillate does not change, so the verdict cannot. This was 12 calls a round, every round.
  const priorClaims = claimVerdicts(p, drawId, authority);
  const verified = await Promise.all(claims.map((c) => {
    const known = priorClaims.find((v) => normalise(v.statement) === normalise(c.statement));
    if (known) return Promise.resolve({ ...known, cached: true });
    const prompt = fill(tpl.verify, { reference, span: c.span, statement: c.statement });
    return p.invoke(drawId, step.id, "check-claims-verify", prompt, (t) => {
      const f = parseFindings(t, "claims", 1)[0];
      if (!f) throw new Error("no <finding> tag");
      const result = f.result.toLowerCase().trim();
      if (!RESULTS.has(result)) throw new Error(`result must be supported | contradicted | unverifiable, got ${f.result}`);
      return { ...f, result, span: f.span || c.span, statement: f.statement || c.statement };
    }, null, authority === "world" ? undefined : "").then((r) => {
      p.artifact(r.step, "claim", r.value.statement, { pass, span: r.value.span, result: r.value.result, evidence: r.value.evidence, invalidates: r.value.invalidates, replacement: r.value.replacement, patch: r.value.patch, authority });
      return r.value;
    });
  }));
  // the cached ones still belong to this pass, so the pane and the export show the whole set
  for (const v of verified as any[]) if (v.cached) p.artifact(step, "claim", v.statement, { pass, span: v.span, result: v.result, evidence: v.evidence, invalidates: v.invalidates, replacement: v.replacement, patch: v.patch, authority, cached_from: v.draw });
  const contradicted = verified.filter((f) => f.result === "contradicted");
  const clusters: Cluster[] = contradicted.map((f) => ({
    id: findingId("claims", f.span, drawId), checkers: ["claims"], samples: [1], n: 1, span: f.span, statement: f.statement, result: f.result,
    evidence: f.evidence, invalidates: f.invalidates || "none", replacement: f.replacement, patch: f.patch ?? "", reported: true,
  }));
  return { checker: "claims", clusters, firstStep: step };
}
