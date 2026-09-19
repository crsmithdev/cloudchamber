/**
 * Stage 1: the checkers. K checkers, each its own headless call, none seeing
 * another's output, each run S times; findings clustered by recurrence and
 * merged across checkers; dismissed findings excluded. Structure and
 * resemblance produce profiles, never findings, and run once for the whole
 * repair chain. Claims run only when the setting declares an authority.
 *
 * Every finding, reported or under the bar, then goes back to the model once
 * with the brief, and only those a reader of the story would notice stay; the
 * rest are stored under the bar with the reason. A finding whose span is not
 * in a vignette or the ending is dropped before that call: the reader never
 * sees the outline, and on the pit chain the outline's own calendar sums were
 * most of what was left.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pipeline, StepRow } from "./draw.ts";
import { fill, type TemplateName } from "./prompts.ts";
import { need, samples, tag, tags } from "./model.ts";
import { distillate, type ClaimsAuthority } from "./settings.ts";
import { samplesFor, type DraftConfig } from "./draftconfig.ts";
import { cluster, excludeDismissed, findingId, merge, normalise, parseFindings, quoted, same, type Cluster, type Finding } from "./recur.ts";
import { briefBlock, briefParts, passId, prose, type BriefParts } from "./briefparts.ts";
import { chainOf, type Chain } from "./chain.ts";
import { RUN } from "./config.ts";

export const PREMISES_PATH = resolve(import.meta.dir, "premises.md");
export const CHECKERS = ["derivation", "ledger", "structure", "resemblance", "claims"] as const;
export type Checker = (typeof CHECKERS)[number];
export const STRUCTURE_QUESTIONS = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];

export type CheckResult = { pass: string; findings: Cluster[]; claims: "off" | ClaimsAuthority };

/**
 * The checkers a check pass would run on this draw now. Three of the five are
 * conditional: structure and resemblance profile the premise, which a repair
 * never changes, so they run once per chain; claims runs only when the setting
 * names an authority to check against. The page reads this rather than naming
 * the five itself.
 */
export function checkersNext(p: Pipeline, drawId: string, enabled: readonly string[], chain: Chain = chainOf(p, drawId)): Checker[] {
  const setting = p.loadDrawSetting(p.draw(drawId)).setting;
  return (CHECKERS as readonly Checker[]).filter((c) => {
    if (!enabled.includes(c)) return false;
    if (c === "structure" || c === "resemblance") return !chain.profile(c);
    if (c === "claims") return !!setting?.claims;
    return true;
  });
}

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

const findingShape = () => fill("findingShape", { sections: RUN.coreJobs.join(" | ") });

/** Extract a brief's ledger in one call and store it under `meta`. */
export async function extractLedger(p: Pipeline, drawId: string, parts: BriefParts, brief: string, meta: Record<string, unknown>): Promise<string> {
  const { step, value } = await p.invoke(drawId, parts.outlineStepId, "ledger-extract", fill("ledgerExtract", { brief }), (t) => need(t, "ledger"));
  p.artifact(step, "ledger", String(value), meta);
  return String(value);
}

/** Run every enabled checker over the brief. The draw must hold a brief; status is the caller's. */
export async function runCheck(p: Pipeline, drawId: string, cfg: DraftConfig, opts: { checks?: string[]; samples?: number; premisesPath?: string } = {}): Promise<CheckResult> {
  const parts = briefParts(p, drawId);
  const chain = chainOf(p, drawId);
  const brief = briefBlock(parts);
  const pass = passId();
  const enabled = checkersNext(p, drawId, opts.checks ?? cfg.checks.enabled, chain);
  const dismissed = chain.dismissed();
  const shape = findingShape();
  const S = (name: string) => opts.samples ? { samples: opts.samples, keep_if: Math.min(cfg.checks.keep_if, opts.samples) } : samplesFor(cfg.checks, name);
  const perChecker: { checker: string; clusters: Cluster[]; firstStep: StepRow; samples?: number }[] = [];
  const findingsOf = (checker: "derivation" | "ledger") => (t: string) => { need(t, "examined"); return { findings: parseFindings(t, checker, 0), examined: tag(t, "examined") }; };
  // the ledger is extracted once for the chain and pinned; every round is checked against it. It is read here once
  // and the verify pass gets the same one: asked again, the chain would answer with the null it cached before the extraction
  const ledger: Promise<string | null> = chain.ledger() ? Promise.resolve(chain.ledger())
    : enabled.includes("ledger") ? extractLedger(p, drawId, parts, brief, { pass, sample: 1, pinned: true }) : Promise.resolve(null);

  const runs: Promise<unknown>[] = [];
  if (enabled.includes("derivation")) runs.push(sampled(p, drawId, parts, "check-derivation", fill("checkDerivation", { brief, findingShape: shape }), S("derivation"), "derivation",
    (t) => ({ impossibility: tag(t, "impossibility"), ...findingsOf("derivation")(t) })).then((r) => { perChecker.push(r); }));
  // the extraction runs beside the other checkers; only the ledger checker waits for it
  if (enabled.includes("ledger")) runs.push(ledger.then((l) => sampled(p, drawId, parts, "check-ledger", fill("checkLedger", { brief, ledger: fill("pinnedLedger", { ledger: l! }), findingShape: shape }), S("ledger"), "ledger", findingsOf("ledger")))
    .then((r) => { perChecker.push(r); }));
  // structure and resemblance profile the premise, which a repair never changes: once per chain
  if (enabled.includes("structure")) runs.push(sampled(p, drawId, parts, "check-structure", fill("checkStructure", { brief }), S("structure"), "structure", (t) => ({ answers: parseQuestions(t, STRUCTURE_QUESTIONS) }),
    (step, value, sample) => p.artifact(step, "profile", JSON.stringify(value.answers), { pass, sample, source: "check", checker: "structure", answers: value.answers })));
  if (enabled.includes("resemblance")) runs.push(sampled(p, drawId, parts, "check-resemblance", fill("checkResemblance", { brief, list: loadPremiseList(opts.premisesPath) }), S("resemblance"), "resemblance", (t) => {
    const nearest = tag(t, "nearest");
    if (!nearest) throw new Error("no <nearest> tag");
    const matches = tags(t, "match").map((m) => ({ entry: tag(m, "entry") ?? "", span: tag(m, "span") ?? "" }));
    return { matches, nearest: { title: tag(nearest, "title") ?? "", author: tag(nearest, "author") ?? "", shared: tag(nearest, "shared") ?? "" } };
  }, (step, value, sample) => p.artifact(step, "profile", JSON.stringify(value), { pass, sample, source: "check", checker: "resemblance", ...value })));

  let claims: CheckResult["claims"] = "off";
  const { setting } = p.loadDrawSetting(parts.draw);
  // the list already holds claims only when the setting names an authority
  if (enabled.includes("claims") && setting?.claims) {
    claims = setting.claims;
    const reference = claims === "setting" ? distillate(setting) : "";
    runs.push(runClaims(p, drawId, parts, brief, claims, reference, pass, chain).then((r) => { perChecker.push(r); }));
  }
  await Promise.all(runs);

  const reported = perChecker.flatMap((c) => c.clusters.filter((x) => x.reported));
  const merged = excludeDismissed(merge(reported), dismissed);
  // the clusters under keep_if, merged as the gate reads them back, so one verify call grades the whole list
  const under = excludeDismissed(merge(perChecker.flatMap((c) => c.clusters.filter((x) => !x.reported))), dismissed)
    .filter((c) => !merged.some((m) => same(m, c)));
  const dropped = await verifyFindings(p, drawId, parts, brief, await ledger, [...merged, ...under]);
  // a clean pass leaves no finding or profile behind, so the pass is marked on its own: the gate reads the latest pass, not the latest with findings
  // with the samples each checker ran in this pass, which the score reads: an earlier pass may have run a different count.
  // Marked only once the verify reading is in: a pass whose verify failed would otherwise read as clean
  const samples = Object.fromEntries(perChecker.filter((c) => c.samples).map((c) => [c.checker, c.samples]));
  if (perChecker.length) p.artifact(perChecker[0].firstStep, "pass", pass, { pass, samples });
  const store = (c: Cluster, extra: Record<string, unknown>) => {
    const owner = perChecker.find((x) => x.checker === c.checkers[0])!;
    const { reported: _r, ...meta } = c;
    p.artifact(owner.firstStep, "finding", c.statement, { ...meta, pass, source: "check", ...extra });
  };
  for (const c of merged) { const why = dropped.get(c.id); store(c, why ? { sub_threshold: true, dropped: why } : {}); }
  // a finding under the bar is stored only when dropped, so the list read back later carries the reason
  for (const c of under) { const why = dropped.get(c.id); if (why) store(c, { sub_threshold: true, dropped: why }); }
  return { pass, findings: merged.filter((c) => !dropped.has(c.id)), claims };
}

/**
 * Verify readings per pass. A finding stays only when every reading keeps it.
 * One reading kept a borderline line about one time in five and dropped it the
 * rest ("12:41" against a noon break of no stated length, on the fresh draw);
 * over a chain of passes that was enough to repair it. Two readings that must
 * agree cut that to about one in twenty-five, and a real finding one reading
 * drops comes back on the next pass.
 */
export const VERIFY_READINGS = 2;

export const NOT_IN_PROSE = "the span is not in a vignette or the ending, which is all a reader of the story sees";

/**
 * The pairing step: a finding whose span is not in the prose is dropped with no
 * call, then one call reads every other finding back against the brief.
 * Returns the ids to drop, each with the reason. Claims have their own
 * verifier and are not read again.
 */
async function verifyFindings(p: Pipeline, drawId: string, parts: BriefParts, brief: string, ledger: string | null, all: Cluster[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const seen = prose(parts);
  const subject: Cluster[] = [];
  for (const c of all) {
    if (c.checkers.length === 1 && c.checkers[0] === "claims") continue;
    if (!quoted(seen, c.span, 1)) out.set(c.id, NOT_IN_PROSE); else subject.push(c);
  }
  if (!subject.length) return out;
  const findings = subject.map((c, i) => `${i + 1}. span: "${c.span}"\n   statement: ${c.statement}\n   result: ${c.result}\n   evidence: ${c.evidence}`).join("\n");
  const cap = String(50 + 40 * subject.length);
  const prompt = fill("checkVerify", { brief, ledger: ledger ? fill("pinnedLedger", { ledger }) : "", findings, cap });
  const readings = await Promise.all(Array.from({ length: VERIFY_READINGS }, () =>
    p.invoke(drawId, parts.outlineStepId, "check-verify", prompt, (t) => parseVerdicts(t, subject.length)).then((r) => r.value)));
  // dropped when any reading drops it; the first reading that drops it gives the reason
  subject.forEach((c, i) => { const drop = readings.map((r) => r[i]).find((v) => v.answer === "drop"); if (drop) out.set(c.id, drop.why); });
  return out;
}

export function parseVerdicts(text: string, n: number): { answer: "keep" | "drop"; why: string }[] {
  const byN = new Map<number, { answer: "keep" | "drop"; why: string }>();
  for (const m of text.matchAll(/<verdict\s+n="(\d+)"\s*>([\s\S]*?)<\/verdict>/gi)) {
    // drop is the only word that drops: a model that writes "Keep.", "drop (loose wording)" or, as on 2026-09-19,
    // a result word such as "underived" in the answer slot has still answered, and a kept finding costs nothing
    const answer = tag(m[2], "answer");
    if (answer === null) throw new Error(`verdict ${m[1]}: no <answer>`);
    byN.set(Number(m[1]), { answer: /\bdrop\b/i.test(answer) ? "drop" : "keep", why: tag(m[2], "why") ?? "" });
  }
  return Array.from({ length: n }, (_, i) => { const v = byN.get(i + 1); if (!v) throw new Error(`missing <verdict n="${i + 1}">`); return v; });
}

/** S concurrent samples of one checker; the parsed value goes on each step, the findings are clustered. */
async function sampled(p: Pipeline, drawId: string, parts: BriefParts, stage: any, prompt: string, s: { samples: number; keep_if: number }, checker: string,
  parse: (text: string) => any, store?: (step: StepRow, value: any, sample: number) => void): Promise<{ checker: string; clusters: Cluster[]; firstStep: StepRow; samples: number }> {
  const results = await samples(s.samples, () => p.invoke(drawId, parts.outlineStepId, stage, prompt, parse));
  const findings: Finding[] = [];
  for (const r of results) {
    store?.(r.step, r.value, r.sample);
    for (const f of (r.value.findings ?? []) as Finding[]) findings.push({ ...f, sample: r.sample });
  }
  return { checker, clusters: cluster(findings, s.keep_if, drawId), firstStep: results[0].step, samples: results.length };
}

const RESULTS = new Set(["supported", "contradicted", "unverifiable"]);

/** What a verified claim's artifact carries, written the same way for a fresh verdict and a cached one. */
const claimMeta = (v: { span: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string }, pass: string, authority: ClaimsAuthority, extra: Record<string, unknown> = {}) =>
  ({ pass, span: v.span, result: v.result, evidence: v.evidence, invalidates: v.invalidates, replacement: v.replacement, patch: v.patch, authority, ...extra });

async function runClaims(p: Pipeline, drawId: string, parts: BriefParts, brief: string, authority: ClaimsAuthority, reference: string, pass: string, chain: Chain) {
  const tpl = CLAIMS_PROMPTS[authority];
  const { step, value: claims } = await p.invoke(drawId, parts.outlineStepId, "check-claims-extract", fill(tpl.extract, { brief }), (t) =>
    tags(t, "claim").map((c) => ({ span: tag(c, "span") ?? "", statement: tag(c, "statement") ?? "" })).filter((c) => c.span && c.statement));
  // a claim already verified anywhere in this chain against the same authority is not re-verified:
  // the distillate does not change, so the verdict cannot. This was 12 calls a round, every round.
  const priorClaims = chain.claims(authority);
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
      p.artifact(r.step, "claim", r.value.statement, claimMeta(r.value, pass, authority));
      return r.value;
    });
  }));
  // the cached ones still belong to this pass, so the pane and the export show the whole set
  for (const v of verified as any[]) if (v.cached) p.artifact(step, "claim", v.statement, claimMeta(v, pass, authority, { cached_from: v.draw }));
  const contradicted = verified.filter((f) => f.result === "contradicted");
  const clusters: Cluster[] = contradicted.map((f) => ({
    id: findingId("claims", f.span, drawId), checkers: ["claims"], samples: [1], n: 1, span: f.span, statement: f.statement, result: f.result,
    evidence: f.evidence, invalidates: f.invalidates || "none", replacement: f.replacement, patch: f.patch ?? "", reported: true,
  }));
  return { checker: "claims", clusters, firstStep: step };
}
