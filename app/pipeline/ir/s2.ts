/**
 * S2: symbols and resolution (docs/specs/2026-09-28-story-ir.md §4.2, §5,
 * §13.3). Five lowering passes over a stored ledger, setting and schedule:
 *
 *   L1 symbolise  one model call, the ledger to typed `<sym>` tags
 *   L2 resolve    each symbol whose `from` names the setting, verified once
 *                 per chain, reusing `verifyClaims` (check.ts) and its cache
 *   L3 calendar   deterministic: day/date/hour and vote-count arithmetic
 *                 over L1's `time` and `count` symbols
 *   L4 plan       one model call, the schedule's raw text against the symbol
 *                 table, in the fixed `<finding>` shape
 *   L5 link       deterministic: entry(k) = exit(k-1), a table, no findings
 *
 * Real model calls only in L1 and L4; L2's calls are `check-claims-verify`,
 * cached by the chain the way a check pass already is. Nothing here writes a
 * new artifact kind: `artifacts.ts`'s `Kind` union is fixed (§13.1 treats the
 * `schedule` and `finding` shapes as given), and S2 is a standalone read —
 * the caller decides what, if anything, to persist.
 */
import type { Pipeline, StepRow } from "../draw.ts";
import { fill } from "../prompts.ts";
import { tags } from "../model.ts";
import { readClaims, verifyClaims, type Claim, type Verified } from "../check.ts";
import { distillate, type Setting } from "../settings.ts";
import { chainOf, type Chain } from "../chain.ts";
import { findingId, normalise, parseFindings, type Finding } from "../recur.ts";
import type { Schedule } from "../write.ts";
import type { FindingMeta } from "../artifacts.ts";
import { lintS1, parseWhen, serial } from "./s1.ts";

export type Sym = { id: string; kind: string; from: string; attrs: Record<string, string>; text: string; resolved?: "SUPPORTED" | "CONTRADICTED" | "SILENT" };

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

export function parseSyms(text: string): Sym[] {
  const out: Sym[] = [];
  for (const m of text.matchAll(/<sym\b([^>]*)>([\s\S]*?)<\/sym>/gi)) {
    const attrs = attrsOf(m[1]!);
    if (!attrs.id) continue;
    out.push({ id: attrs.id, kind: attrs.kind ?? "fact", from: attrs.from ?? "", attrs, text: m[2]!.trim() });
  }
  return out;
}

// --- L1 symbolise -------------------------------------------------------------

/** One call over the pinned ledger, emitting `<symbols>` (§3.2's shape). */
export async function l1Symbolize(p: Pipeline, drawId: string, parent: string | null, ledger: string, pass?: string): Promise<{ step: StepRow; symbols: Sym[] }> {
  const { step, value } = await p.invoke(drawId, parent, "ir-symbolize", fill("irSymbolize", { ledger }), (t) => {
    const syms = parseSyms(t);
    if (!syms.length) throw new Error("no <sym> tags");
    return syms;
  }, { pass });
  return { step, symbols: value };
}

// --- L2 resolve -----------------------------------------------------------------

/** A symbol whose provenance names the setting: `from="ledger:detail; setting:bodies/Armoury"`. */
const settingEligible = (s: Sym) => /\bsetting:/i.test(s.from);

/**
 * Every setting-eligible symbol verified once per chain, reusing `verifyClaims`
 * and its cache (`check.ts:258` at the time this was written) — the fix for
 * the wording-sensitivity bug in §4.2: one verdict per symbol, not one per the
 * sentence a checker or a screen happened to quote.
 */
export async function l2Resolve(p: Pipeline, drawId: string, extract: StepRow, symbols: Sym[], setting: Setting, pass: string, chain: Chain): Promise<Sym[]> {
  const eligible = symbols.filter(settingEligible);
  if (!eligible.length || !setting.claims) return symbols;
  const authority = setting.claims;
  const reference = authority === "setting" ? distillate(setting) : "";
  const claims: Claim[] = eligible.map((s) => ({ span: s.text, statement: s.text }));
  const verified: Verified[] = await verifyClaims(p, drawId, extract, claims, authority, reference, pass, chain, true);
  const byStatement = new Map(verified.map((v) => [v.statement, v]));
  const resolvedOf = (r: string): Sym["resolved"] => (r === "contradicted" ? "CONTRADICTED" : r === "supported" ? "SUPPORTED" : "SILENT");
  return symbols.map((s) => {
    if (!settingEligible(s)) return s;
    const v = byStatement.get(s.text);
    return v ? { ...s, resolved: resolvedOf(v.result) } : s;
  });
}

// --- L3 calendar and typed counts -----------------------------------------------

/** `question` marks a finding the ledger under-specifies rather than contradicts: a person answers it, no auto rule holds on it (§14.4). */
export type L3Finding = { kind: "calendar" | "count" | "membership"; message: string; symbols: string[]; question?: boolean };

/** Every calendar date the text writes, as "month-day", read with the same parser the schedule's `when` gets. */
export function datesStated(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    // every date on the line, not the first: a ledger line can state two ("3 March ... 14 March")
    for (const m of line.matchAll(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{4}-\d{2}-\d{2}\b/gi)) {
      const w = parseWhen(m[0]);
      if (w.date) out.add(`${w.date.month}-${w.date.day}`);
    }
  }
  return out;
}

/**
 * Deterministic arithmetic over L1's `time` and `count` symbols, and a
 * membership question over its `person` and vote symbols.
 *
 * Calendar: every pair of day→date anchors must agree on the distance
 * between them. With `ledger` given, an anchor whose date the ledger never
 * writes is dropped first: both models derived dates the L1 prompt told them
 * not to (§14.2), and a derived anchor can only echo or hide the stated ones.
 * Each distinct (day, date, day, date) disagreement is reported once, with
 * every symbol that states it.
 *
 * Count: `yes + no` against a stated `total`. Membership: a vote count that
 * names its `body` and its named voters; a named voter whose `member_of` is
 * another body is a question (Dace, the Guild's delegate, votes in the
 * Council: the ledger never says whether he holds a seat), not an error.
 */
export function l3Calendar(symbols: Sym[], ledger?: string): L3Finding[] {
  const out: L3Finding[] = [];
  const stated = ledger ? datesStated(ledger) : null;

  const anchors = symbols.filter((s) => s.kind === "time").map((s) => {
    const day = Number(s.attrs.day ?? s.id.replace(/^day\./, ""));
    const w = parseWhen(`${s.attrs.date ?? ""} ${s.attrs.hour ? `${s.attrs.hour} hour` : ""}`);
    if (!Number.isFinite(day) || !w.date) return null;
    if (stated && !stated.has(`${w.date.month}-${w.date.day}`)) return null;
    return { id: s.id, day, date: w.date, year: w.year, raw: s.attrs.date ?? "" };
  }).filter((a): a is NonNullable<typeof a> => a !== null);
  const key = (a: NonNullable<(typeof anchors)[number]>) => `${a.day}|${a.date.month}-${a.date.day}`;
  const seen = new Map<string, { message: string; symbols: Set<string> }>();
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
    const a = anchors[i]!, b = anchors[j]!;
    if (key(a) === key(b)) continue;
    const daysApart = b.day - a.day;
    const datesApart = (b.year !== null && a.year !== null ? (b.year - a.year) * 365 : 0) + serial(b.date) - serial(a.date);
    if (daysApart === datesApart) continue;
    const k = [key(a), key(b)].sort().join("||");
    const hit = seen.get(k) ?? seen.set(k, { message: `day ${a.day} is ${a.raw} and day ${b.day} is ${b.raw}: ${daysApart} day(s) apart by the day count, ${datesApart} by the calendar dates`, symbols: new Set() }).get(k)!;
    hit.symbols.add(a.id); hit.symbols.add(b.id);
  }
  for (const { message, symbols: ids } of seen.values()) out.push({ kind: "calendar", symbols: [...ids], message });

  const byId = new Map(symbols.map((s) => [s.id, s]));
  for (const s of symbols.filter((s) => s.kind === "count")) {
    const yes = num(s.attrs.yes), no = num(s.attrs.no), total = num(s.attrs.total);
    if (yes !== null && no !== null && total !== null && yes + no !== total) out.push({ kind: "count", symbols: [s.id], message: `${s.id}: ${yes} yes plus ${no} no is ${yes + no}, not the stated tally of ${total}` });

    const body = s.attrs.body?.trim();
    if (!body) continue;
    const named = [...ids(s.attrs.named_yes), ...ids(s.attrs.named_no)];
    for (const id of named) {
      const person = byId.get(id);
      const member = person?.attrs.member_of?.trim();
      if (!person) out.push({ kind: "membership", symbols: [s.id, id], question: true, message: `${s.id}: "${id}" votes but no symbol has that id` });
      else if (!member) out.push({ kind: "membership", symbols: [s.id, id], question: true, message: `${s.id}: ${id} votes and the ledger does not say what body ${id} belongs to` });
      else if (member !== body) {
        const seats = num(byId.get(body)?.attrs.seats ?? s.attrs.seats);
        const tally = yes !== null && no !== null ? yes + no : total;
        const room = seats !== null && tally !== null ? `; the tally is ${tally} against ${seats} seats, so ${seats + 1 - tally === 1 ? "one seat is" : `${seats + 1 - tally} seats are`} unaccounted for` : "";
        out.push({ kind: "membership", symbols: [s.id, id, body], question: true, message: `${s.id}: ${id} votes but is a member of ${member}, not of ${body}${room}` });
      }
    }
  }
  return out;
}
const num = (s: string | undefined): number | null => (s !== undefined && /^\d+$/.test(s.trim()) ? Number(s) : null);
const ids = (s: string | undefined): string[] => (s ?? "").split(/[,\s]+/).map((x) => x.trim()).filter((x) => x && !/^none$/i.test(x));

// --- L4 plan vs ledger ------------------------------------------------------------

const symsBlock = (symbols: Sym[]): string =>
  symbols.map((s) => `<sym id="${s.id}" kind="${s.kind}"${Object.entries(s.attrs).filter(([k]) => k !== "id" && k !== "kind").map(([k, v]) => ` ${k}="${v}"`).join("")}>${s.text}</sym>`).join("\n");

/**
 * L4 returns at most this many findings. A list this long may be short: the
 * view says so (`planCapped`). Ten clipped one plan in five with six known
 * conflicts (`evals/20260928-ir-s2prime.md`) while `unverifiable` findings
 * took a third of the slots; the prompt no longer asks for those.
 */
export const PLAN_CAP = 15;

/** One call over the plan and the symbol table; the fixed `<finding>` shape, parsed with `parseFindings`. */
export async function l4PlanVsLedger(p: Pipeline, drawId: string, parent: string | null, symbols: Sym[], schedule: Schedule, pass?: string, cap = PLAN_CAP): Promise<{ step: StepRow; findings: Finding[] }> {
  const { step, value } = await p.invoke(drawId, parent, "ir-plan-ledger", fill("irPlanLedger", { symbols: symsBlock(symbols), plan: schedule.raw, cap: String(cap) }), (t) => parseFindings(t, "plan-ledger", 1), { pass });
  return { step, findings: value };
}

// --- the plan check: S1 + L1 + L3 + L4, stored for gate 2 ---------------------------------

export type PlanCheck = { stored: number; questions: number; capped: boolean; l1: "done" | "failed"; l4: "done" | "failed" | "skipped"; claims: "done" | "failed" | "skipped" };

/**
 * The plan check (docs/specs/2026-09-28-story-ir.md §14.5, S3′): S1 on the
 * schedule, L1 over the ledger, L3 over the symbols, L4 over the plan. Every
 * finding is stored as a `finding` artifact with `source: "plan"` and its
 * kind in `screen` (`plan-static`, `plan-calendar`, `plan-membership`,
 * `plan-ledger`), so gate 2 lists it beside the beat's prose flags with no new
 * gate, no replan and no action. The findings reach a person; nothing acts on
 * them.
 *
 * It is informational, so it must not fail a draft: a model call that fails
 * leaves its failed step, and the $0 findings stand. Only L4's `contradicted`
 * findings are stored; a thing the table has no value for is not a finding
 * (the prompt says so too), and an L3 membership finding is stored as a
 * `question`, since the ledger under-specifies it rather than contradicts it.
 */
export async function planCheck(p: Pipeline, drawId: string, parent: string, ledger: string, schedule: Schedule, pass: string): Promise<PlanCheck> {
  const out: PlanCheck = { stored: 0, questions: 0, capped: false, l1: "failed", l4: "skipped", claims: "skipped" };
  const whenOf = (beat: number | null) => schedule.beats.find((b) => b.n === beat)?.when ?? "";
  const store = (step: StepRow, screen: string, f: { beat: number | null; span: string; statement: string; evidence: string; replacement?: string; patch?: string; question?: boolean }) => {
    const span = f.span || f.statement;
    const meta: FindingMeta = {
      id: findingId(screen, `${f.beat ?? ""}|${span}|${f.statement}`, `${drawId}/plan`), checkers: [screen], samples: [1], n: 1,
      span, statement: f.statement, result: f.question ? "question" : "contradicted", evidence: f.evidence, invalidates: f.beat === null ? "plan" : String(f.beat),
      replacement: f.replacement ?? "", patch: f.patch ?? "", pass, source: "plan", screen, ...(f.beat === null ? {} : { beat: f.beat }), ...(f.question ? { question: true } : {}),
    };
    p.artifact(step, "finding", f.statement, meta);
    out.stored++;
    if (f.question) out.questions++;
  };

  // the claims the plan makes about the setting (§15, T1′): gate 1's claims check, on the plan's text instead of the brief's.
  // Beside L1 and L4, and its own failure only. Under `world` verify searches the web, so it stays at gate 1 and on the scenes.
  const claims = planClaims(p, drawId, parent, schedule, pass).then((fs) => {
    out.claims = "done";
    for (const f of fs) store(f.step, "plan-claims", f);
  }, () => { out.claims = "failed"; });

  // S1, $0, on its own step: the findings stand when L1 fails
  const s1 = lintS1(schedule);
  const staticStep = p.recordStep(drawId, parent, "ir-static", "deterministic", { s1: s1.length });
  for (const f of s1) store(staticStep, "plan-static", { beat: f.beat, span: whenOf(f.beat), statement: f.message, evidence: f.check });

  // L1: the symbol table; a failure is its failed step, and the check ends here
  let l1: { step: StepRow; symbols: Sym[] };
  try {
    l1 = await l1Symbolize(p, drawId, parent, ledger, pass);
    out.l1 = "done";
  } catch {
    await claims;
    return out;
  }

  // L3, $0, on the L1 step it read
  for (const f of l3Calendar(l1.symbols, ledger)) {
    store(l1.step, `plan-${f.kind}`, { beat: null, span: f.symbols.join(", "), statement: f.message, evidence: f.symbols.join(", "), question: f.question });
  }

  // L4: contradictions only
  try {
    const { step, findings } = await l4PlanVsLedger(p, drawId, l1.step.id, l1.symbols, schedule, pass);
    out.l4 = "done";
    out.capped = findings.length >= PLAN_CAP;
    for (const f of findings) {
      if (!/^contradict/i.test(f.result.trim())) continue;
      const beat = /^\d+$/.test(f.invalidates.trim()) ? Number(f.invalidates.trim()) : null;
      store(step, "plan-ledger", { beat, span: f.span, statement: f.statement, evidence: f.evidence, replacement: f.replacement, patch: f.patch });
    }
  } catch {
    out.l4 = "failed";
  }
  await claims;
  return out;
}

/**
 * The plan's contradicted claims about the setting, each on the beat whose
 * field quotes its span. The text sent is each beat's fields as the schedule
 * holds them, so a span is a string of the schedule and `apply` can replace it.
 */
async function planClaims(p: Pipeline, drawId: string, parent: string, schedule: Schedule, pass: string) {
  const { setting } = p.loadDrawSetting(p.draw(drawId));
  if (setting?.claims !== "setting") return [];
  const fields = schedule.beats.flatMap((b) => [b.when, b.job, b.known, b.stakes, b.set_piece].filter(Boolean).map((text) => ({ beat: b.n, text })));
  const read = await readClaims(p, drawId, fields.map((f) => f.text).join("\n\n"), setting, pass, chainOf(p, drawId), parent);
  if (!read) return [];
  return read.verified.filter((v) => v.result === "contradicted").map((v) => ({
    step: read.step, beat: fields.find((f) => normalise(f.text).includes(normalise(v.span)))?.beat ?? null,
    span: v.span, statement: v.statement, evidence: v.evidence, replacement: v.replacement, patch: v.patch ?? "",
  }));
}

