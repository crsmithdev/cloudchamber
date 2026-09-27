/**
 * What the check loop would have reported with fewer samples or one checker,
 * read from calls already paid for. No model call.
 *
 * usage: bun evals/stored/checks.ts [since, default 2026-09-24] > out.json
 *
 * 1. Samples. Every stored pass that ran 4 derivation and 4 ledger samples is
 *    clustered again from its stored replies: the pass as it ran (4, keep 3,
 *    both checkers) against every subset an arm would have run. A finding is
 *    kept by an arm when the arm reports one `same()` as it. Before verify,
 *    which reads each finding apart from the others.
 * 2. Rounds. Every stored auto table: how many rounds, why it stopped, and how
 *    often a brief's second clean-looking pass found a finding its first missed.
 */
import { openDb } from "../../app/pipeline/store/db.ts";
import { cluster, merge, parseFindings, same, type Cluster, type Finding } from "../../app/pipeline/recur.ts";

const since = process.argv[2] ?? "2026-09-24";
const db = openDb();

type Step = { id: string; draw_id: string; stage: string; started_at: string; raw_response: string | null };
const steps = db.query(`SELECT id, draw_id, stage, started_at, raw_response FROM steps
  WHERE stage IN ('check-derivation', 'check-ledger') AND status = 'done' AND started_at >= ? ORDER BY draw_id, started_at`).all(since) as Step[];
const text = (raw: string | null) => { try { return String(JSON.parse(raw ?? "").result ?? ""); } catch { return ""; } };

// the samples of one pass start together; a gap of a minute starts the next pass
const passes = new Map<string, Record<string, Step[]>>();
for (const s of steps) {
  const t = Date.parse(s.started_at);
  const key = [...passes.keys()].find((k) => k.startsWith(s.draw_id + "@") && Math.abs(Number(k.split("@")[1]) - t) < 60_000) ?? `${s.draw_id}@${t}`;
  const p = passes.get(key) ?? {};
  (p[s.stage] ??= []).push(s);
  passes.set(key, p);
}

const findingsOf = (s: Step, checker: string, sample: number): Finding[] => parseFindings(text(s.raw_response), checker, sample);
const reportedBy = (arms: { stage: string; checker: string; take: number[]; keep: number }[], p: Record<string, Step[]>, scope: string): Cluster[] =>
  merge(arms.flatMap((a) => cluster(a.take.flatMap((i, j) => findingsOf(p[a.stage][i]!, a.checker, j + 1)), a.keep, scope).filter((c) => c.reported)));
const subsets = (n: number, k: number): number[][] => k === 0 ? [[]] : n < k ? [] : [...subsets(n - 1, k - 1).map((s) => [...s, n - 1]), ...subsets(n - 1, k)];

const D = "check-derivation", L = "check-ledger";
const ARMS: Record<string, (take: number[]) => { stage: string; checker: string; take: number[]; keep: number }[]> = {
  "both 2 keep 2": (t) => [{ stage: D, checker: "derivation", take: t, keep: 2 }, { stage: L, checker: "ledger", take: t, keep: 2 }],
  "both 3 keep 2": (t) => [{ stage: D, checker: "derivation", take: t, keep: 2 }, { stage: L, checker: "ledger", take: t, keep: 2 }],
  "ledger 4 keep 3": () => [{ stage: L, checker: "ledger", take: [0, 1, 2, 3], keep: 3 }],
  "derivation 4 keep 3": () => [{ stage: D, checker: "derivation", take: [0, 1, 2, 3], keep: 3 }],
  "ledger 4 keep 2": () => [{ stage: L, checker: "ledger", take: [0, 1, 2, 3], keep: 2 }],
};
const takes: Record<string, number[][]> = { "both 2 keep 2": subsets(4, 2), "both 3 keep 2": subsets(4, 3) };

const tally: Record<string, { base: number; kept: number; extra: number; strongBase: number; strongKept: number; runs: number }> = {};
let full = 0;
for (const [key, p] of passes) {
  if (p[D]?.length !== 4 || p[L]?.length !== 4) continue;
  full++;
  const scope = key.split("@")[0]!;
  const base = reportedBy([{ stage: D, checker: "derivation", take: [0, 1, 2, 3], keep: 3 }, { stage: L, checker: "ledger", take: [0, 1, 2, 3], keep: 3 }], p, scope);
  // a finding both checkers raised is the kind auto repairs: the merged ones scored 9 and 10 on 26 September
  const strong = base.filter((c) => c.checkers.length > 1);
  for (const [name, arm] of Object.entries(ARMS)) {
    for (const t of takes[name] ?? [[0, 1, 2, 3]]) {
      const got = reportedBy(arm(t), p, scope);
      const x = (tally[name] ??= { base: 0, kept: 0, extra: 0, strongBase: 0, strongKept: 0, runs: 0 });
      x.runs++;
      x.base += base.length;
      x.kept += base.filter((b) => got.some((g) => same(g, b))).length;
      x.extra += got.filter((g) => !base.some((b) => same(g, b))).length;
      x.strongBase += strong.length;
      x.strongKept += strong.filter((b) => got.some((g) => same(g, b))).length;
    }
  }
}
const samplesResult = Object.fromEntries(Object.entries(tally).map(([k, x]) => [k, {
  recall: +(x.kept / x.base).toFixed(2), strongRecall: +(x.strongKept / x.strongBase).toFixed(2),
  extraPerPass: +(x.extra / x.runs).toFixed(2), baseFindingsPerPass: +(x.base / x.runs).toFixed(2), runs: x.runs,
}]));

// the auto tables: one per auto run, on the brief it stopped on
const autos = (db.query(`SELECT a.content FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE a.kind = 'auto' AND s.started_at >= ?`).all(since) as { content: string }[])
  .map((r) => JSON.parse(r.content) as { stopped: string; rounds: { passes: number; accepted: number }[] });
const stopped: Record<string, number> = {}, rounds: Record<number, number> = {};
let confirmRows = 0, confirmFound = 0;
for (const a of autos) {
  stopped[a.stopped] = (stopped[a.stopped] ?? 0) + 1;
  rounds[a.rounds.length] = (rounds[a.rounds.length] ?? 0) + 1;
  // a brief read more than once: a later pass accepted after an earlier one found nothing to accept
  for (const r of a.rounds) if (r.passes > 1) { confirmRows++; if (r.accepted > 0) confirmFound++; }
}

console.log(JSON.stringify({ since, passes: full, samples: samplesResult,
  auto: { runs: autos.length, stopped, rounds, briefsReadTwice: confirmRows, secondPassFoundMore: confirmFound } }, null, 1));

// what became of the findings only the derivation checker raised: the stored finding on the same draw, and the verdict on it
const fate: Record<string, number> = {};
for (const [key, p] of passes) {
  if (p[D]?.length !== 4 || p[L]?.length !== 4) continue;
  const scope = key.split("@")[0]!;
  const base = reportedBy([{ stage: D, checker: "derivation", take: [0, 1, 2, 3], keep: 3 }, { stage: L, checker: "ledger", take: [0, 1, 2, 3], keep: 3 }], p, scope);
  const ledgerOnly = reportedBy(ARMS["ledger 4 keep 3"]!([]), p, scope);
  for (const b of base.filter((c) => !ledgerOnly.some((g) => same(g, c)))) {
    const stored = (db.query(`SELECT a.id, a.meta FROM artifacts a JOIN steps s ON s.id = a.step_id WHERE s.draw_id = ? AND a.kind = 'finding'`).all(scope) as { id: string; meta: string }[])
      .map((a) => ({ id: a.id, meta: JSON.parse(a.meta) })).find((a) => same({ span: a.meta.span ?? "", statement: a.meta.statement ?? "" }, b) || a.meta.span === b.span);
    const verdict = stored && (db.query(`SELECT verdict, method FROM verdicts WHERE target_id = ? ORDER BY rowid DESC LIMIT 1`).get(stored.id) as { verdict: string; method: string } | null);
    const k = !stored ? "not stored" : stored.meta.dropped ? "dropped by verify" : verdict ? `${verdict.verdict} (${verdict.method})` : "open";
    fate[k] = (fate[k] ?? 0) + 1;
  }
}
console.log(JSON.stringify({ derivationOnlyFate: fate }));
