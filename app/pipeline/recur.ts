/**
 * Recurrence instead of confidence. A checker runs S times with sampling on;
 * its findings are clustered by span overlap and a cluster is reported when
 * it recurs in at least keep_if distinct samples. The same rule merges
 * clusters across checkers and excludes findings Chris has dismissed.
 *
 * Tokens are the lowercase [a-z0-9]+ runs of a string; overlap is
 * |A ∩ B| / min(|A|, |B|) over the token sets. A finding joins the first
 * cluster whose first member's span overlaps its span at 0.5, or whose
 * statement overlaps at 0.6.
 */
import { createHash } from "node:crypto";
import { tag, tags } from "./model.ts";

export const SPAN_OVERLAP = 0.5;
export const STATEMENT_OVERLAP = 0.6;
export const INVALIDATES_ORDER = ["departure", "particulars", "knowledge"];

export type Finding = {
  checker: string;
  sample: number;
  span: string;
  statement: string;
  result: string;
  evidence: string;
  invalidates: string;
  replacement: string;
  /** The span rewritten to stand in its place verbatim, or "" when the fix needs more than the span. */
  patch: string;
};

export type Cluster = {
  id: string;
  checkers: string[];
  samples: number[];
  n: number;
  span: string;
  statement: string;
  result: string;
  evidence: string;
  invalidates: string;
  replacement: string;
  patch: string;
  reported: boolean;
};

export function toks(s: string): Set<string> { return new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []); }

export function overlap(a: string, b: string): number {
  const A = toks(a), B = toks(b);
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / Math.max(1, Math.min(A.size, B.size));
}

export function same(a: { span: string; statement: string }, b: { span: string; statement: string }): boolean {
  return overlap(a.span, b.span) >= SPAN_OVERLAP || overlap(a.statement, b.statement) >= STATEMENT_OVERLAP;
}

export const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Stable across re-checks of one draw: the same checker quoting the same span
 * gets the same id. Scoped by draw, so a repaired brief that keeps a sentence
 * does not inherit the verdicts recorded against its source.
 */
export function findingId(checker: string, span: string, scope = ""): string {
  return "f-" + createHash("sha1").update(`${scope}|${checker}|${normalise(span)}`).digest("hex").slice(0, 8);
}

/** Parse every <finding> in a checker's response. Missing fields are empty strings; a finding with no span is dropped. */
export function parseFindings(text: string, checker: string, sample: number): Finding[] {
  return tags(text, "finding").map((f) => ({
    checker, sample,
    span: tag(f, "span") ?? "", statement: tag(f, "statement") ?? "", result: tag(f, "result") ?? "",
    evidence: tag(f, "evidence") ?? "none", invalidates: (tag(f, "invalidates") ?? "none").toLowerCase(), replacement: tag(f, "replacement") ?? "",
    patch: (() => { const x = (tag(f, "patch") ?? "").trim(); return x.toLowerCase() === "none" ? "" : x; })(),
  })).filter((f) => f.span);
}

export function invalidatesRank(inv: string): number {
  const i = INVALIDATES_ORDER.indexOf(inv.toLowerCase());
  return i >= 0 ? i : inv === "none" || !inv ? INVALIDATES_ORDER.length + 1 : INVALIDATES_ORDER.length;
}

/**
 * A finding's score, 0 to 10, from what is already stored: how often it
 * recurred, whether a second checker found it, what it invalidates, what kind
 * of result it is, and whether it quotes evidence. The gate sorts by this and
 * can accept above a floor; the auto rounds stop on one.
 *
 * Recurrence and severity are deliberately worth the same: a contradiction in
 * the debt audit seen twice of three is worth reading, and a full-recurrence
 * finding with no evidence behind it is not.
 */
/**
 * The debt audit is the story's own mechanism, so a contradiction there is
 * what a reader notices. The target is major inconsistency, not correctness.
 *
 * Arithmetic sat at 1 for one run and that over-corrected. On a brief whose
 * plot is the money, three contradicted arithmetic findings scored 6, fell
 * under the floor of 7, and their defects reached the drafted story. The
 * pedantry those findings were demoted for is already handled by HEDGED
 * below, which zeroes severity on an estimate, so the weight can carry the
 * real ones. Measured on chain 20260915204445-b776.
 */
/**
 * Lowered on 2026-09-17: at 3/2/2 the sums and the geometry reached the floor
 * and the contradictions a reader sees did not. What a reader sees now carries
 * its own term below, and the section weights only break ties.
 */
export const INVALIDATES_WEIGHT: Record<string, number> = { departure: 2, knowledge: 1, particulars: 1 };
export const SCORE_MAX = 10;

/**
 * A hedge immediately before a number, or a trailing "or so", marks a
 * character's estimate rather than a claim. Doing long division on "roughly
 * 1,200 steps a day" is pedantry, so an arithmetic finding quoting one scores
 * no severity at all. The outline's own sums are not estimates: "about 19
 * days" in the arithmetic section zeroed a real dose error on the pit chain,
 * so a span quoted from the outline keeps its severity.
 */
export const HEDGED = /\b(roughly|approximately|about|around|nearly|almost|some|upwards of|maybe)\s+[\d,.]+|\bor so\b|\bgive or take\b/i;

export type Scorable = { n: number; checkers: string[]; invalidates: string; result: string; evidence: string; span?: string };

/** The texts a finding's quotes are read against: the prose a reader sees, the outline, and the pinned ledger. */
export type ScoreContext = { prose: string; outline: string; ledger: string };

/** The quotes a finding rests on besides its span: the second quote of a contradicts: result, and anything the evidence quotes. */
export function quotesOf(f: Pick<Scorable, "result" | "evidence">): string[] {
  const out: string[] = [];
  const m = /^contradicts:\s*([\s\S]+)$/i.exec(f.result.trim());
  if (m) out.push(m[1]);
  for (const q of f.evidence.matchAll(/["“]([^"”]{12,})["”]/g)) out.push(q[1]);
  return out.map((q) => q.trim().replace(/^["“]|["”]$/g, "").replace(/^\*+|\*+$/g, ""));
}

/** Whether a quote is in a text, read across an ellipsis, on words alone. `minWords` is the shortest part that counts. */
export function quoted(text: string, quote: string, minWords = 3): boolean {
  const t = loose(text);
  const parts = quote.split(/…|\.\.\./).map(loose).filter((x) => x && x.split(" ").length >= minWords);
  return parts.length > 0 && parts.every((x) => t.includes(x));
}

/**
 * The brief is loosened once per text, not once per finding: a score reads the
 * same prose, outline and ledger for every finding of a pass, and loosening a
 * brief is the most expensive part of scoring one.
 */
const looseCache = new Map<string, string>();
const loose = (s: string) => {
  if (s.length < 512) return looseOf(s);
  const hit = looseCache.get(s);
  if (hit !== undefined) return hit;
  const out = looseOf(s);
  if (looseCache.size > 16) looseCache.clear();
  looseCache.set(s, out);
  return out;
};
const looseOf = (s: string) => s.toLowerCase().replace(/[*_`"“”'’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * What a reader sees is worth two: the span and a second quote both in the
 * prose. A quote that lands in the outline or the ledger is worth one. A
 * finding that quotes nothing the brief or the ledger says is a chain of
 * inference, and costs two: on the pit chain those were the sums and the
 * geometry that auto fixed while the name in two registries waited.
 */
export function visibility(f: Scorable, ctx: ScoreContext): number {
  const prose = ctx.prose, outline = ctx.outline, ledger = ctx.ledger;
  const span = f.span ?? "";
  const qs = quotesOf(f);
  if (quoted(prose, span) && qs.some((q) => quoted(prose, q))) return 2;
  if (qs.some((q) => quoted(prose, q) || quoted(outline, q) || quoted(ledger, q))) return 1;
  // the outline's own sum, checked: the span is the stated figure and the evidence is the arithmetic
  if (quoted(outline, span) && /\d/.test(f.evidence)) return 1;
  return -2;
}

export function score(f: Scorable, samples: number, ctx?: ScoreContext): number {
  const recurrence = f.n >= samples ? 3 : f.n === samples - 1 ? 2 : 1;
  const crossChecker = f.checkers.length > 1 ? 2 : 0;
  const inv = f.invalidates.toLowerCase();
  const weight = INVALIDATES_WEIGHT[inv] ?? 0;
  const inOutline = !!f.span && !!ctx?.outline && normalise(ctx.outline).includes(normalise(f.span));
  const severity = inv === "particulars" && !inOutline && HEDGED.test(f.span ?? "") ? 0 : weight;
  const r = f.result.toLowerCase().trim();
  const kind = r.startsWith("contradict") ? 2 : r.includes("underived") ? 1 : 0;
  const unevidenced = !f.evidence.trim() || f.evidence.trim().toLowerCase() === "none" ? -2 : 0;
  const visible = ctx && !unevidenced ? visibility(f, ctx) : 0;
  return Math.max(0, Math.min(SCORE_MAX, recurrence + crossChecker + severity + kind + unevidenced + visible));
}

/** Cluster one checker's findings across its samples. Sorted by n descending, then by what the finding invalidates. */
export function cluster(findings: Finding[], keepIf: number, scope = ""): Cluster[] {
  const groups: Finding[][] = [];
  for (const f of findings) {
    const g = groups.find((c) => same(c[0], f));
    if (g) g.push(f); else groups.push([f]);
  }
  const out = groups.map((g) => {
    const samples = [...new Set(g.map((f) => f.sample))].sort((a, b) => a - b);
    const first = g[0];
    return {
      id: findingId(first.checker, first.span, scope), checkers: [first.checker], samples, n: samples.length,
      span: first.span, statement: first.statement, result: first.result, evidence: first.evidence, invalidates: first.invalidates, replacement: first.replacement,
      // a patch only counts when every sample that saw this cluster offered the same one
      patch: g.every((x) => x.patch && normalise(x.patch) === normalise(first.patch)) ? first.patch : "",
      reported: samples.length >= keepIf,
    };
  });
  return order(out);
}

export function order(cs: Cluster[]): Cluster[] {
  return [...cs].sort((a, b) => b.n - a.n || invalidatesRank(a.invalidates) - invalidatesRank(b.invalidates));
}

/** Merge reported clusters from several checkers: the first kept, both checkers listed, n the greater. */
export function merge(all: Cluster[]): Cluster[] {
  const out: Cluster[] = [];
  for (const c of order(all)) {
    const hit = out.find((o) => same(o, c));
    if (!hit) { out.push({ ...c, checkers: [...c.checkers] }); continue; }
    for (const k of c.checkers) if (!hit.checkers.includes(k)) hit.checkers.push(k);
    hit.n = Math.max(hit.n, c.n);
    if (hit.evidence === "none" && c.evidence !== "none") hit.evidence = c.evidence;
  }
  return order(out);
}

/** Drop clusters that overlap a dismissed finding by the same rule. */
export function excludeDismissed<T extends { span: string; statement: string }>(cs: T[], dismissed: { span: string; statement: string }[]): T[] {
  return cs.filter((c) => !dismissed.some((d) => same(c, d)));
}
