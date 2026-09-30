/**
 * The checks that read a brief as text, run by `draft` beside the schedule and
 * shown at the plan gate (IR spec §15.3). Each checker is its own headless
 * call, none seeing another's output, each run S times. Structure and
 * resemblance produce profiles, never findings, and run once for the whole
 * repair chain. The reader's questions are clustered by recurrence, and each
 * one goes back to the model against the story; a question the story answers
 * in a line it quotes is stored under the bar with the reason.
 *
 * Gate 1's ledger, derivation and claims checkers went with T3: the bind holds
 * each scene to the ledger, and the plan check reads the plan's claims against
 * the setting (T1′). `readClaims` and `screenClaims` are the claims calls those
 * use.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pipeline, StepRow } from "./draw.ts";
import { fill, type TemplateName } from "./prompts.ts";
import { need, tag, tags } from "./model.ts";
import { distillate, type ClaimsAuthority, type Setting } from "./settings.ts";
import { samplesFor, type DraftConfig } from "./draftconfig.ts";
import { excludeDismissed, findingId, merge, normalise, parseFindings, quoted, same, type Cluster, type Finding } from "./recur.ts";
import { briefBlock, briefParts, passId, prose, type BriefParts } from "./briefparts.ts";
import { chainOf, type Chain } from "./chain.ts";
import { clusterSamples } from "./sampled.ts";
import { BriefSession } from "./briefsession.ts";
import type { LedgerMeta } from "./artifacts.ts";
import { RUN, type CheckStageName } from "./config.ts";

const PREMISES_PATH = resolve(import.meta.dir, "premises.md");
const CHECKERS = ["structure", "resemblance", "reader"] as const;
export type Checker = (typeof CHECKERS)[number];
export const STRUCTURE_QUESTIONS = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];

export type CheckResult = { pass: string; findings: Cluster[] };

/**
 * The checkers a brief pass would run on this draw now. Structure and
 * resemblance profile the premise, which a repair never changes, so they run
 * once per chain; the reader runs once, on the chain's first brief.
 */
export function checkersNext(p: Pipeline, drawId: string, enabled: readonly string[], chain: Chain = chainOf(p, drawId)): Checker[] {
  return (CHECKERS as readonly Checker[]).filter((c) => {
    if (!enabled.includes(c)) return false;
    if (c === "structure" || c === "resemblance") return !chain.profile(c);
    // the reader's plot holes are the story's, and a repair rewrites two or three sentences: once, in round 1
    if (c === "reader") return !p.draw(drawId).repaired_from && !chain.steps().some((s) => s.stage === "check-reader" && s.status === "done");
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

function loadPremiseList(path: string = PREMISES_PATH): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").split("\n").filter((l) => /^\d+\.\s/.test(l)).join("\n");
}

const findingShape = () => fill("findingShape", { sections: RUN.coreJobs.join(" | ") });

/** Extract a brief's ledger in one call and store it under `meta`. */
export async function extractLedger(session: BriefSession, meta: LedgerMeta): Promise<string> {
  const { step, value } = await session.call("ledger-extract", fill("ledgerExtract", {}), (t) => need(t, "ledger"));
  session.p.artifact(step, "ledger", String(value), meta);
  return String(value);
}

/** A reader's question: a gap for a person, never merged with a contradiction or taken by auto. */
const isQuestion = (c: { checkers: string[] }) => c.checkers.every((x) => x === "reader");

/** Run every enabled checker over the brief. The draw must hold a brief; status is the caller's. */
export async function runCheck(p: Pipeline, drawId: string, cfg: DraftConfig, opts: { checks?: string[]; premisesPath?: string } = {}): Promise<CheckResult> {
  const parts = briefParts(p, drawId);
  const chain = chainOf(p, drawId);
  const brief = briefBlock(parts);
  const pass = passId();
  const enabled = checkersNext(p, drawId, opts.checks ?? cfg.checks.enabled, chain);
  const S = (name: string) => samplesFor(cfg.checks, name);
  const perChecker: { checker: string; clusters: Cluster[]; firstStep: StepRow; samples?: number }[] = [];
  // every call of the pass reads the brief from one cached system prompt; the session holds it and the lead (ADR-0010)
  const session = new BriefSession(p, drawId, parts, enabled[0] ? `check-${enabled[0]}` : "check-reader", pass);

  const runs: Promise<unknown>[] = [];
  // <examined> is the checker's own account of what it compared, kept for the reader; a reply without it has still answered
  if (enabled.includes("reader")) runs.push(sampled(session, "check-reader", fill("checkReader", { sections: RUN.coreJobs.join(" | ") }), S("reader"), "reader",
    (t) => ({ findings: parseFindings(t, "reader", 0), examined: tag(t, "examined") ?? "" })).then((r) => { perChecker.push(r); }));
  // structure and resemblance profile the premise, which a repair never changes: once per chain
  if (enabled.includes("structure")) runs.push(sampled(session, "check-structure", fill("checkStructure", { brief }), S("structure"), "structure", (t) => ({ answers: parseQuestions(t, STRUCTURE_QUESTIONS) }),
    (step, value, sample) => p.artifact(step, "profile", JSON.stringify(value.answers), { pass, sample, source: "check", checker: "structure", answers: value.answers })));
  if (enabled.includes("resemblance")) runs.push(sampled(session, "check-resemblance", fill("checkResemblance", { brief, list: loadPremiseList(opts.premisesPath) }), S("resemblance"), "resemblance", (t) => {
    const nearest = tag(t, "nearest");
    if (!nearest) throw new Error("no <nearest> tag");
    const matches = tags(t, "match").map((m) => ({ entry: tag(m, "entry") ?? "", span: tag(m, "span") ?? "" }));
    return { matches, nearest: { title: tag(nearest, "title") ?? "", author: tag(nearest, "author") ?? "", shared: tag(nearest, "shared") ?? "" } };
  }, (step, value, sample) => p.artifact(step, "profile", JSON.stringify(value), { pass, sample, source: "check", checker: "resemblance", ...value })));
  await Promise.all(runs);

  const questions = perChecker.flatMap((c) => c.clusters);
  const merged = merge(questions.filter((x) => x.reported));
  const under = merge(questions.filter((x) => !x.reported)).filter((c) => !merged.some((m) => same(m, c)));
  const dropped = await verifyQuestions(session, parts, [...merged, ...under]);
  // a clean pass leaves no finding behind, so the pass is marked on its own, with the samples each checker ran
  const samples = Object.fromEntries(perChecker.filter((c) => c.samples).map((c) => [c.checker, c.samples!]));
  if (perChecker.length) p.artifact(perChecker[0].firstStep, "pass", pass, { pass, samples });
  const store = (c: Cluster, extra: Record<string, unknown>) => {
    const owner = perChecker.find((x) => x.checker === c.checkers[0])!;
    const { reported: _r, ...meta } = c;
    p.artifact(owner.firstStep, "finding", c.statement, { ...meta, pass, source: "check", ...extra });
  };
  for (const c of merged) { const why = dropped.get(c.id); store(c, why ? { sub_threshold: true, dropped: why } : {}); }
  // a question under the bar is stored only when dropped, so the list read back later carries the reason
  for (const c of under) { const why = dropped.get(c.id); if (why) store(c, { sub_threshold: true, dropped: why }); }
  return { pass, findings: merged.filter((c) => !dropped.has(c.id)) };
}

/**
 * Verify readings per pass. A finding stays only when every reading keeps it.
 * One reading kept a borderline line about one time in five and dropped it the
 * rest ("12:41" against a noon break of no stated length, on the fresh draw);
 * over a chain of passes that was enough to repair it. Two readings that must
 * agree cut that to about one in twenty-five, and a real finding one reading
 * drops comes back on the next pass.
 */
const VERIFY_READINGS = 2;

export const NOT_IN_PROSE = "the span is not in a vignette or the ending, which is all a reader of the story sees";

/**
 * A question whose span is not in the prose is dropped with no call; one call
 * per reading reads every other question back against the story. Returns the
 * ids to drop, each with the reason.
 */
async function verifyQuestions(session: BriefSession, parts: BriefParts, all: Cluster[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const story = prose(parts);
  const subject: Cluster[] = [];
  for (const c of all) if (!quoted(story, c.span, 1)) out.set(c.id, NOT_IN_PROSE); else subject.push(c);
  if (!subject.length) return out;
  // a question is dropped only on a line the story says, and not on the question's own span: without the quote, a drop explained a plot hole away (plants 2026-09-26)
  const answered = (why: string, c: Cluster) => [...why.matchAll(/["“]([^"”]{12,})["”]/g)].some((m) => quoted(story, m[1]!) && !quoted(c.span, m[1]!));
  const findings = subject.map((c, i) => `${i + 1}. span: "${c.span}"\n   question: ${c.statement}`).join("\n");
  const prompt = fill("readerVerify", { findings, cap: String(50 + 40 * subject.length) });
  const readings = await Promise.all(Array.from({ length: VERIFY_READINGS }, () =>
    session.call("check-verify", prompt, (t) => parseVerdicts(t, subject.length)).then((r) => r.value)));
  // dropped when any reading drops it; the first reading that drops it gives the reason
  subject.forEach((c, i) => { const drop = readings.map((r) => r[i]).find((v) => v.answer === "drop" && answered(v.why, c)); if (drop) out.set(c.id, drop.why); });
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
async function sampled<T>(session: BriefSession, stage: CheckStageName, prompt: string, s: { samples: number; keep_if: number }, checker: string,
  parse: (text: string) => T, store?: (step: StepRow, value: T, sample: number) => void): Promise<{ checker: string; clusters: Cluster[]; firstStep: StepRow; samples: number }> {
  const results = await session.samples(stage, prompt, parse, s.samples);
  for (const r of results) store?.(r.step, r.value, r.sample);
  return { checker, clusters: clusterSamples(results, (v) => (v as { findings?: Finding[] }).findings ?? [], s.keep_if, session.drawId), firstStep: results[0].step, samples: results.length };
}

const RESULTS = new Set(["supported", "contradicted", "unverifiable"]);

/** What a verified claim's artifact carries, written the same way for a fresh verdict and a cached one. */
const claimMeta = (v: { span: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string }, pass: string, authority: ClaimsAuthority, extra: Record<string, unknown> = {}) =>
  ({ pass, span: v.span, result: v.result, evidence: v.evidence, invalidates: v.invalidates, replacement: v.replacement, patch: v.patch, authority, ...extra });

export type Claim = { span: string; statement: string };
/** A claim's verdict: fresh, or `cached` from the chain claim it repeats, with the draw that verified it. */
export type Verified = { span: string; statement: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string; draw?: string; cached?: boolean; confirm?: string };

/** The claims an extract call listed. */
const claimsIn = (t: string): Claim[] =>
  tags(t, "claim").map((c) => ({ span: tag(c, "span") ?? "", statement: tag(c, "statement") ?? "" })).filter((c) => c.span && c.statement);

/**
 * Each claim verified against the authority. A claim already verified anywhere
 * in this chain against the same authority is not verified again: the
 * reference does not change, so the verdict cannot. This was 12 calls a round,
 * every round. A fresh verdict is stored on its verify step; a cached one
 * comes back marked. Under a check pass the verify steps carry the pass; a
 * screen's claims carry `source: "screen"`.
 *
 * Exported for the story IR's L2 resolve (`ir/s2.ts`, docs/specs/2026-09-28-story-ir.md
 * §4.2): "reuse `verifyClaims` with the chain cache, one call per symbol per chain."
 */
export async function verifyClaims(p: Pipeline, drawId: string, extract: StepRow, claims: Claim[], authority: ClaimsAuthority, reference: string, pass: string, chain: Chain, screen: boolean): Promise<Verified[]> {
  const tpl = CLAIMS_PROMPTS[authority];
  const prior = chain.claims(authority);
  return Promise.all(claims.map((c) => {
    const known = prior.find((v) => normalise(v.statement) === normalise(c.statement));
    if (known) return Promise.resolve<Verified>({ ...known, cached: true });
    return p.invoke(drawId, extract.id, "check-claims-verify", fill(tpl.verify, { reference, span: c.span, statement: c.statement }), (t) => {
      const f = parseFindings(t, "claims", 1)[0];
      if (!f) throw new Error("no <finding> tag");
      const result = f.result.toLowerCase().trim();
      if (!RESULTS.has(result)) throw new Error(`result must be supported | contradicted | unverifiable, got ${f.result}`);
      return { ...f, result, span: f.span || c.span, statement: f.statement || c.statement };
      // the web is the authority only under `world`; every other authority reads the reference in the prompt
    }, { tools: authority === "world" ? undefined : "", ...(screen ? {} : { pass }) }).then(async (r) => {
      const v: Verified = r.value.result === "contradicted" ? await confirmClaim(p, drawId, r.step, r.value, screen ? null : pass) : r.value;
      p.artifact(r.step, "claim", v.statement, claimMeta(v, pass, authority, { ...(screen ? { source: "screen" } : {}), ...(v.confirm ? { confirm: v.confirm } : {}) }));
      return v;
    });
  }));
}

/**
 * A second reading of a contradicted claim: does the line cited against it
 * state a different value for the same thing? The verify prompt already says
 * a claim the setting does not settle is unverifiable, and one reading still
 * called invented detail contradicted: on draw 20260928000554-01c5 two of
 * three claims cited a line about something else (the year orichalcum was
 * found, against a claim about when production began). A "no" makes the
 * claim unverifiable, and the reason stays on the claim.
 */
async function confirmClaim(p: Pipeline, drawId: string, verify: StepRow, v: Verified, pass: string | null): Promise<Verified> {
  const r = await p.invoke(drawId, verify.id, "check-claims-confirm", fill("claimsConfirm", { span: v.span, statement: v.statement, evidence: v.evidence }), (t) => {
    const answer = tag(t, "answer");
    if (answer === null) throw new Error("no <answer>");
    return { yes: /^\s*yes\b/i.test(answer), why: tag(t, "why") ?? "" };
  }, { tools: "", ...(pass ? { pass } : {}) });
  return r.value.yes ? v : { ...v, result: "unverifiable", replacement: "none", patch: "", confirm: r.value.why };
}

// the setting extractor reads the setting, so it pulls the claims the setting settles and not the ones it guesses at
const extractPrompt = (authority: ClaimsAuthority, reference: string) =>
  fill(CLAIMS_PROMPTS[authority].extract, authority === "setting" ? { reference } : {});

/**
 * Extract the claims a text makes about the setting or the world, and verify
 * each one; a claim this chain already verified keeps its verdict. Null when
 * the setting names no authority or there is no text.
 */
export async function readClaims(p: Pipeline, drawId: string, text: string, setting: Setting, pass: string, chain: Chain, parent: string | null): Promise<{ step: StepRow; verified: Verified[] } | null> {
  const authority: ClaimsAuthority | null = setting.claims;
  if (!authority || !text.trim()) return null;
  const reference = authority === "setting" ? distillate(setting) : "";
  const { step, value: claims } = await p.invoke(drawId, parent, "check-claims-extract", extractPrompt(authority, reference), claimsIn, { context: text });
  return { step, verified: await verifyClaims(p, drawId, step, claims, authority, reference, pass, chain, true) };
}

/**
 * The claims a draft makes about its setting, checked after it is written.
 * The checkers read the brief, and a scene invents past it: on one draft of a
 * setting that declares an authority, twelve claims came out of the scenes,
 * two of them contradicting the setting (a twelfth suit-wearer where the
 * setting says twelve became nine; Holy Smoke given to every soldier where the
 * setting makes it a chaplain's). Neither was in the brief, so no check pass
 * could have seen them. A contradiction is a flag on the beat whose scene says
 * it, for `rewrite k` to answer.
 */
export async function screenClaims(p: Pipeline, drawId: string, scenes: { beat: number; text: string }[], setting: Setting, pass: string, chain: Chain, parent: string | null): Promise<Cluster[]> {
  const read = await readClaims(p, drawId, scenes.map((s) => s.text).join("\n\n"), setting, pass, chain, parent);
  if (!read) return [];
  const { step, verified } = read;
  const beatOf = (span: string) => scenes.find((s) => normalise(s.text).includes(normalise(span)))?.beat ?? scenes[0].beat;
  const flags: Cluster[] = [];
  for (const f of verified.filter((v) => v.result === "contradicted")) {
    const beat = beatOf(f.span);
    const c: Cluster = {
      id: findingId("claims", f.span, `${drawId}/${beat}`), checkers: ["claims"], samples: [1], n: 1, span: f.span, statement: f.statement,
      result: f.result, evidence: f.evidence, invalidates: String(beat), replacement: f.replacement, patch: f.patch ?? "", reported: true,
    };
    const { reported: _r, ...meta } = c;
    p.artifact(step, "finding", c.statement, { ...meta, pass: chain.screenPass(beat) ?? pass, source: "screen", screen: "claims", beat });
    flags.push(c);
  }
  return flags;
}

