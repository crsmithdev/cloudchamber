/**
 * The stages after a brief, and the two gates:
 *
 *   brief → check → GATE 1 (accept | dismiss | hold | flag | draft)
 *         → repair → check again → GATE 1
 *         → schedule → scene ×M, each bound to the ledger as written → screen ×M → GATE 2 (keep | rewrite k)
 *         → drafts/<draw>/
 *
 * Statuses on the draw: done → awaiting_check_gate → repairing | drafting →
 * awaiting_draft_gate → drafted. A repaired brief is a new draw
 * (repaired_from) and the source becomes `repaired`. `--auto` works gate 1 by
 * the mechanical rule and stops at gate 2.
 */
import type { DrawRow, Pipeline } from "./draw.ts";
import { record } from "./verdicts.ts";
import { must, settle, under, type Action, type Status } from "./lifecycle.ts";
import { loadDraftConfig, type DraftConfig, type Overrides, type Resolved } from "./draftconfig.ts";
import { extractLedger, runCheck, STRUCTURE_QUESTIONS, type CheckResult } from "./check.ts";
import { constraintsBlock, repair } from "./repair.ts";
import { briefBlock, briefParts, passId } from "./briefparts.ts";
import { chainOf, type Chain, type FindingView } from "./chain.ts";
import { ofKind } from "./artifacts.ts";
import { bindScene, runScenes, runSchedule, runScreens, writeScene, type Schedule } from "./write.ts";
import { draftView, exportDraft, renderStory, type DraftView } from "./drafts.ts";
import { tag } from "./model.ts";
import { fill } from "./prompts.ts";
import { SCORE_MAX } from "./recur.ts";

/** One brief of an auto run: its last check pass's open findings and their total, what auto accepted on it, and how many passes it had. */
export type AutoRound = { round: number; id: string; open: number; total: number; accepted: number; calls: number; passes: number };
export type AutoResult = { id: string; rounds: AutoRound[]; best: AutoRound; stopped: "floor" | "cap" | "patience" | "budget"; floor: number; calls: number; left_open: number };
export type DraftOpts = { profile?: string; overrides?: Overrides; auto?: boolean };
/** A finding as the gate reads it: `auto_eligible` says whether the auto rule would consider it, whatever it scores. */
export type GateFinding = FindingView & { auto_eligible: boolean };
/** The latest pass in four numbers, for a list row. */
export type FindingsSummary = { pass: string | null; reported: number; accepted: number; open: number; total: number };
/**
 * The gate's reading of a brief's findings, partitioned once. `findings` is
 * every finding the gate can act on; `listed` is the gate's own list (reported,
 * or already ruled on, and not re-opening a settled fix); `reopened` would undo
 * a fix accepted in an earlier round; `left` is what the verify pass or the
 * sample bar took off the list and is still open, present only when asked for.
 */
export type FindingsView = {
  pass: string | null; findings: GateFinding[]; listed: GateFinding[]; reopened: GateFinding[]; left: GateFinding[]; summary: FindingsSummary | null;
  off_list: { dropped: number; rare: number | null }; claims: unknown[]; profiles: unknown[]; examined: { stage: string; sample: number; examined: string }[];
  judge: string | null; score_max: number; structure: string[];
};

/**
 * An unattended repair needs a quote to work from, and only the three
 * checkers that report findings can supply one; structure and resemblance
 * store profiles. A finding failing either test is left for a person, whatever
 * it scores.
 */
const AUTO_CHECKERS = ["derivation", "ledger", "claims"];
/** A floor stop needs this many clean passes in a row on one brief: one sample set can miss what the next one finds. */
const CLEAN_PASSES = 2;
const autoEligible = (f: FindingView) =>
  f.checkers.some((c) => AUTO_CHECKERS.includes(c)) && !!f.evidence.trim() && f.evidence.trim().toLowerCase() !== "none"
  && !f.relitigates;

/** A <conflict> carries its two numbers as <a> and <b> children or as a and b attributes; either form is read. */
export function parseConflicts(block: string): { a: number; b: number; why: string }[] {
  const out: { a: number; b: number; why: string }[] = [];
  for (const m of block.matchAll(/<conflict((?:\s+[a-z]+="[^"]*")*)\s*>([\s\S]*?)<\/conflict>/gi)) {
    const attr = (name: string) => new RegExp(`\\b${name}="(\\d+)"`).exec(m[1])?.[1];
    out.push({ a: Number(tag(m[2], "a") ?? attr("a")), b: Number(tag(m[2], "b") ?? attr("b")), why: tag(m[2], "why") ?? "" });
  }
  return out;
}

export class Drafting {
  constructor(public p: Pipeline, public opts: { draftsDir?: string; lexiconPath?: string; premisesPath?: string } = {}) {}

  /** The draw, when `action` is allowed on it now; otherwise the reason is thrown. */
  private must(drawId: string, action: Action): DrawRow {
    const d = this.p.draw(drawId);
    must(d, action);
    return d;
  }
  private resolved(draw: DrawRow, opts: DraftOpts = {}): Resolved {
    if (draw.draft_config && !opts.profile && !opts.overrides) return JSON.parse(draw.draft_config) as Resolved;
    return loadDraftConfig(opts.profile, opts.overrides ?? {});
  }

  // --- stage 1 ---------------------------------------------------------------

  async check(drawId: string, opts: { checks?: string[]; samples?: number; profile?: string; overrides?: Overrides } = {}): Promise<CheckResult> {
    const draw = this.must(drawId, "check");
    return this.recheck(drawId, this.resolved(draw, opts).config, { checks: opts.checks, samples: opts.samples });
  }

  /** A check pass under `checking`; the draw comes back to where it stood if the pass fails, and waits at gate 1 when it succeeds. */
  private async recheck(drawId: string, cfg: DraftConfig, opts: { back?: Status; checks?: string[]; samples?: number } = {}): Promise<CheckResult> {
    const back = opts.back ?? (this.p.draw(drawId).status as Status);
    const r = await under(this.p.db, drawId, "checking", back, () => runCheck(this.p, drawId, cfg, { checks: opts.checks, samples: opts.samples, premisesPath: this.opts.premisesPath }));
    settle(this.p.db, drawId, "awaiting_check_gate");
    return r;
  }

  /** A finding by id among what the gate can act on: the reported list first, the reconstruction under the bar only when it is not there. */
  private finding(chain: Chain, id: string): FindingView {
    const f = chain.reported().find((x) => x.id === id) ?? chain.subThreshold().find((x) => x.id === id);
    if (!f) throw new Error(`draw ${chain.drawId}: no reported finding ${id}`);
    return f;
  }

  findings(drawId: string, opts: { all?: boolean } = {}): FindingsView {
    this.p.draw(drawId);
    const chain = chainOf(this.p, drawId);
    const pass = chain.pass();
    const arts = chain.artifacts();
    const steps = chain.steps().filter((s) => /^check-/.test(s.stage) && s.status === "done");
    const examined = steps.map((s, i) => ({ stage: s.stage, sample: i + 1, examined: String((JSON.parse(s.parsed ?? "{}") as any).examined ?? "") })).filter((x) => x.examined);
    // the gate lists what it will act on: a finding the verify pass dropped is withheld
    // until it is asked for, and stays in the list once it has been ruled on
    const all: GateFinding[] = chain.findings(opts.all).map((f) => ({ ...f, auto_eligible: autoEligible(f) }));
    const offList = (f: FindingView) => !f.reported && f.decision === "open";
    const shown = opts.all ? all : all.filter((f) => !offList(f));
    const off = all.filter(offList);
    const rep = all.filter((f) => f.reported);
    const summary: FindingsSummary | null = !pass && !rep.length ? null
      : { pass, reported: rep.length, accepted: rep.filter((f) => f.decision === "accepted").length, open: rep.filter((f) => f.decision === "open").length, total: rep.reduce((n, f) => n + f.score, 0) };
    return {
      pass, findings: shown,
      listed: shown.filter((f) => !f.relitigates && !offList(f)), reopened: shown.filter((f) => !!f.relitigates), left: shown.filter((f) => !f.relitigates && offList(f)), summary,
      // dropped: the verify pass took it off the list and said why. rare: seen in too few samples,
      // which only the reconstruction behind `all` can count, so it is null without it.
      off_list: { dropped: off.filter((f) => !!f.dropped).length, rare: opts.all ? off.filter((f) => !f.dropped).length : null },
      claims: arts.filter((a) => a.kind === "claim" && a.meta.pass === pass).map((a) => ({ statement: a.content, ...a.meta })),
      // a repair round runs neither profile checker, so the chain's own profile stands in
      profiles: ["structure", "resemblance"].flatMap((c) => {
        const here = arts.filter((a) => a.kind === "profile" && a.meta.source === "check" && a.meta.checker === c && a.meta.pass === pass).map((a) => a.meta);
        if (here.length) return here;
        const up = chain.profile(c);
        return up ? [{ ...up.meta, from_draw: up.draw }] : [];
      }),
      examined, judge: chain.judge(),
      // what the page needs to read a finding and a profile: the score it is out of, and the profile's questions in order
      score_max: SCORE_MAX, structure: STRUCTURE_QUESTIONS,
    };
  }

  // --- gate 1 ----------------------------------------------------------------

  /** Accept findings by id and run the repair, then the re-check. Returns the repaired draw. */
  async accept(drawId: string, ids: string[], opts: { method?: "gate" | "draw"; note?: string } = {}): Promise<DrawRow> {
    const draw = this.must(drawId, "accept");
    const chain = chainOf(this.p, drawId);
    for (const id of ids) {
      const f = this.promote(drawId, this.finding(chain, id));
      record(this.p.db, { kind: "finding", target_id: f.id, verdict: "keep", method: opts.method ?? "gate", note: opts.note ?? "" });
    }
    // read back once the verdicts are down: the whole accepted set of this pass, the ones just promoted included
    const accepted = chainOf(this.p, drawId).findings(true).filter((f) => f.decision === "accepted");
    const cfg = this.resolved(draw).config;
    const next = await repair(this.p, drawId, accepted);
    if (draw.draft_config) this.p.db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(draw.draft_config, next.id);
    // the new round is a brief nobody has checked: a check that fails leaves it there
    await this.recheck(next.id, cfg, { back: "done" });
    return this.p.draw(next.id);
  }

  dismiss(drawId: string, id: string, note = "", method: "gate" | "draw" = "gate"): FindingView {
    this.must(drawId, "dismiss");
    return this.dismissFound(drawId, this.finding(chainOf(this.p, drawId), id), note, method);
  }
  private dismissFound(drawId: string, f: FindingView, note: string, method: "gate" | "draw"): FindingView {
    this.promote(drawId, f);
    record(this.p.db, { kind: "finding", target_id: f.id, verdict: "pass", method, note });
    return { ...f, decision: "dismissed", note };
  }

  /**
   * A sub-threshold finding has no artifact until it is decided on. Storing it
   * then keeps the record complete: the trail shows what the repair was given,
   * and a re-check does not raise a dismissed one again.
   */
  private promote(drawId: string, f: FindingView): FindingView {
    if (f.artifact_id) return f;
    const steps = this.p.steps(drawId).filter((s) => s.stage === `check-${f.checkers[0]}` && s.status === "done");
    const step = steps.at(-1);
    if (!step) return f;
    const { artifact_id: _a, decision: _d, note: _n, score: _s, samples_run: _r, reported: _rep, ...meta } = f;
    return { ...f, artifact_id: this.p.artifact(step, "finding", f.statement, { ...meta, sub_threshold: true }) };
  }

  hold(drawId: string): DrawRow { return this.must(drawId, "hold"); }

  // --- stages 3 to 5 ---------------------------------------------------------

  async draft(drawId: string, opts: DraftOpts = {}): Promise<DrawRow> {
    let draw = this.must(drawId, "draft");
    const resolved = this.resolved(draw, opts);
    if (resolved.config.structure.template !== "auto") throw new Error(`structure mode not built: ${resolved.config.structure.template}`);
    this.p.db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(JSON.stringify(resolved), drawId);
    if (opts.auto) {
      const next = await this.autoGate(drawId, resolved.config);
      if (next !== drawId) { drawId = next; draw = this.p.draw(drawId); }
    }
    if (chainOf(this.p, drawId).findings().some((f) => f.decision === "accepted")) throw new Error("accepted findings pending repair");
    const id = drawId;
    await under(this.p.db, id, "drafting", this.p.draw(id).status as Status, async () => {
      const parts = briefParts(this.p, id);
      const ledger = await this.ensureLedger(id);
      const pass = passId();
      const { step, schedule } = await runSchedule(this.p, id, parts, briefBlock(parts), resolved.config);
      const scenes = await runScenes(this.p, id, step, parts, ledger, schedule, resolved.config, pass);
      await runScreens(this.p, id, schedule, scenes, resolved.config, pass, undefined, { lexiconPath: this.opts.lexiconPath });
    });
    settle(this.p.db, drawId, "awaiting_draft_gate");
    return this.p.draw(drawId);
  }

  /** A draft started without a check has no ledger; one extraction supplies it. */
  private async ensureLedger(drawId: string): Promise<string> {
    const have = chainOf(this.p, drawId).ledger();
    if (have) return have;
    const parts = briefParts(this.p, drawId);
    return extractLedger(this.p, drawId, parts, briefBlock(parts), { pass: passId(), sample: 1, ledger_only: true });
  }

  /**
   * Repair rounds without a gate. Each round accepts every open reported
   * finding scoring `repair.stop_score` or more that it can read a quote
   * against, repairs and re-checks. It stops when no finding reaches the
   * floor, when the rounds run out, or when the total open score has not
   * fallen for `repair.patience` rounds — the loop does not converge on zero
   * findings, so a round cap and a patience are what end it.
   *
   * What auto does not act on it leaves alone. A finding under the floor, one
   * with no evidence to read it against, one that re-opens a settled fix, or
   * one under `keep_if` stays open for a person: recorded as dismissed, it was
   * excluded from every later pass, so a defect a later rewrite made real was
   * never raised again. With two samples a lone debt-audit contradiction
   * scored 7 and rewrote the pit chain's physics on one sample, and round 2
   * accepted two lone findings that contradict each other; so a finding under
   * `keep_if` is not auto's, and when a round accepts two or more fixes, one
   * call reads them against each other and the lower-scoring side of every
   * conflicting pair is dismissed before the repair.
   *
   * A clean pass is one sample set. The floor stop waits for `CLEAN_PASSES`
   * clean passes in a row on the same brief, each a fresh check, so a pass
   * that missed a defect does not end the chain. One row per brief: a re-check
   * overwrites the brief's row, so every row holds its brief's last pass and
   * the lowest total is a brief's, not a pass's.
   *
   * The round with the lowest total score is reported but not restored: an
   * earlier round is superseded, and reviving it would leave the chain in two
   * places at once. When `best` is not `last`, read the brief it names.
   *
   * Only a `floor` stop leaves nothing to do. Every other stop breaks after
   * the last round has chosen what to accept and before it is applied, so
   * `left_open` counts findings at or above the floor that a person still has
   * to rule on at the gate.
   */
  async autoRounds(drawId: string, opts: { cfg?: DraftConfig; note?: string } = {}): Promise<AutoResult> {
    const draw = this.must(drawId, "auto");
    const cfg = opts.cfg ?? this.resolved(draw).config;
    const floor = cfg.repair.stop_score;
    let id = drawId;
    if (!chainOf(this.p, id).pass()) await this.recheck(id, cfg);
    const rounds: AutoRound[] = [];
    let stopped: AutoResult["stopped"];
    let clean = 0;
    let accept: GateFinding[] = [];
    for (;;) {
      // a finding the verify pass dropped is stored under the bar and open: not auto's either
      const open = this.findings(id).findings.filter((f) => f.decision === "open" && f.reported);
      accept = open.filter((f) => f.score >= floor && f.auto_eligible);
      const calls = chainOf(this.p, id).calls();
      let row = rounds.find((r) => r.id === id);
      if (!row) rounds.push((row = { round: rounds.length + 1, id, open: 0, total: 0, accepted: 0, calls, passes: 0 }));
      Object.assign(row, { open: open.length, total: open.reduce((a, f) => a + f.score, 0), calls, passes: row.passes + 1 });
      if (!accept.length) {
        if (++clean >= CLEAN_PASSES) { stopped = "floor"; break; }
        // one clean pass is not convergence: out of calls before the second, the budget stopped it
        if (calls >= cfg.repair.max_calls) { stopped = "budget"; break; }
        await this.recheck(id, cfg); continue;
      }
      clean = 0;
      const best = Math.min(...rounds.map((r) => r.total));
      const since = rounds.length - 1 - rounds.findIndex((r) => r.total === best);
      // patience, the cap and the budget all stop before this round's accepted set is applied:
      // the row claims no repair, and the findings stay open for the gate
      if (since >= cfg.repair.patience) { stopped = "patience"; break; }
      if (rounds.length > cfg.repair.rounds) { stopped = "cap"; break; }
      if (calls >= cfg.repair.max_calls) { stopped = "budget"; break; }
      accept = await this.reconcile(id, accept);
      row.accepted = accept.length;
      id = (await this.accept(id, accept.map((f) => f.id), { method: "draw", note: opts.note ?? "auto" })).id;
    }
    const best = rounds.reduce((a, r) => (r.total < a.total ? r : a), rounds[0]);
    // what the last round would have repaired had the loop gone on: the gate's work, not auto's
    const result: AutoResult = { id, rounds, best, stopped, floor, calls: rounds.at(-1)!.calls, left_open: accept.length };
    // the round table belongs to the brief auto stopped on, so the gate can show how it got there
    const last = chainOf(this.p, id).lastStep();
    if (last) this.p.artifact(last, "auto", JSON.stringify(result), { rounds: rounds.length, stopped, best: best.id });
    return result;
  }

  /**
   * The accepted set with every conflicting pair reduced to its higher-scoring
   * side. One call, only when there are two or more fixes; `accept` is sorted
   * by score, so on a tie the earlier one is kept.
   */
  private async reconcile<F extends FindingView>(drawId: string, accept: F[]): Promise<F[]> {
    if (accept.length < 2) return accept;
    const parent = chainOf(this.p, drawId).lastStep()?.id ?? null;
    // the patch goes in too: on the pit chain a fix moved Ruth off the block and another patched the table for her being on it,
    // and read as sentences the second was conditional on the first, so nothing conflicted
    const fixes = accept.map((f, i) => `${i + 1}. ${f.replacement}${f.patch?.trim() ? `\n   patch: "${f.patch.trim()}"` : ""}`).join("\n");
    const prompt = fill("reconcile", { fixes });
    // the call is the start of the repair: while it runs the gate is closed, so no second accept, auto or draft starts
    const { value: pairs } = await under(this.p.db, drawId, "repairing", "awaiting_check_gate", () => this.p.invoke<{ a: number; b: number; why: string }[]>(drawId, parent, "reconcile", prompt, (t) => {
      const block = tag(t, "conflicts");
      if (block === null) throw new Error("no <conflicts> tag");
      return parseConflicts(block).filter((x) => x.a >= 1 && x.a <= accept.length && x.b >= 1 && x.b <= accept.length && x.a !== x.b);
    }));
    settle(this.p.db, drawId, "awaiting_check_gate");
    const dropped = new Map<string, FindingView>();
    for (const { a, b } of pairs) {
      const [hi, lo] = a < b ? [a, b] : [b, a];
      // the list is sorted by score, so the earlier index is the higher score or the tie-break
      const keep = accept[hi - 1], drop = accept[lo - 1];
      if (!dropped.has(keep.id) && !dropped.has(drop.id)) dropped.set(drop.id, keep);
    }
    for (const [id, keep] of dropped) this.dismissFound(drawId, accept.find((f) => f.id === id)!, `auto: conflicts with ${keep.id}`, "draw");
    return accept.filter((f) => !dropped.has(f.id));
  }

  /** `draft --auto` works gate 1 by the same rule and drafts from where it stops. What auto left open stays open: a draft is blocked only by an accepted finding no repair has applied. */
  private async autoGate(drawId: string, cfg: DraftConfig): Promise<string> {
    return (await this.autoRounds(drawId, { cfg })).id;
  }

  // --- gate 2 ----------------------------------------------------------------

  async rewrite(drawId: string, k: number, findingId?: string): Promise<DrawRow> {
    const draw = this.must(drawId, "rewrite");
    const cfg = this.resolved(draw).config;
    const v = draftView(this.p, drawId);
    if (!v.schedule) throw new Error(`draw ${drawId}: no schedule`);
    const M = v.schedule.beats.length;
    if (!(k >= 1 && k <= M)) throw new Error(`beat ${k} is not in 1..${M}`);
    // a flag a person dismissed, or one already patched in place, is not a constraint on the rewrite
    const flags = v.screenFindings.filter((f) => f.beat === k && f.decision === "open");
    const chosen = findingId ? flags.filter((f) => f.id === findingId) : flags;
    if (findingId && !chosen.length) throw new Error(`beat ${k}: no screen finding ${findingId} that is open`);
    const constraints = chosen.length ? constraintsBlock(chosen) : undefined;
    const schedule: Schedule = { form: v.schedule.form as Schedule["form"], beats: v.schedule.beats, raw: v.schedule.raw };
    await under(this.p.db, drawId, "drafting", "awaiting_draft_gate", async () => {
      const parts = briefParts(this.p, drawId);
      // the pinned one: a repaired draw carries no ledger of its own, the chain root holds it
      const ledger = chainOf(this.p, drawId).ledger() ?? "";
      const scheduleStep = this.p.steps(drawId).find((s) => s.stage === "schedule" && s.status === "done")!;
      const before = v.scenes.filter((s) => s.beat < k).map((s) => s.text);
      const pass = passId();
      // the scene carries the gate-2 record: which beat was rewritten, and under which flag
      const written = await writeScene(this.p, drawId, scheduleStep.id, parts, ledger, schedule, schedule.beats[k - 1], cfg.scenes.order === "sequential" ? before : [], constraints, { finding: findingId });
      const bound = await bindScene(this.p, drawId, ledger, written, v.scenes[k - 2], cfg, pass);
      // the beat after it read the old text: it is held to the new one, as it was when first written
      if (k < M) await bindScene(this.p, drawId, ledger, v.scenes[k], bound, cfg, pass);
      await runScreens(this.p, drawId, schedule, chainOf(this.p, drawId).scenes(), cfg, pass, k < M ? [k, k + 1] : [k], { lexiconPath: this.opts.lexiconPath });
    });
    settle(this.p.db, drawId, "awaiting_draft_gate");
    return this.p.draw(drawId);
  }

  keep(drawId: string, note = ""): { draw: DrawRow; dir: string } {
    const draw = this.must(drawId, "keep");
    record(this.p.db, { kind: "draft", target_id: drawId, verdict: "keep", method: "gate", note });
    const resolved = this.resolved(draw);
    const gate2 = ofKind(this.p.artifacts(drawId), "scene").filter((a) => a.meta.rewrite)
      .map((a) => `rewrite ${a.meta.beat}${a.meta.rewrite_finding ? ` ${a.meta.rewrite_finding}` : ""}`);
    const dir = exportDraft(this.p, drawId, resolved, gate2, this.opts.draftsDir, this.p.briefsDir);
    settle(this.p.db, drawId, "drafted", { ended: true });
    return { draw: this.p.draw(drawId), dir };
  }

  // --- reads -----------------------------------------------------------------

  story(drawId: string): string { return renderStory(draftView(this.p, drawId)); }
  view(drawId: string): DraftView { return draftView(this.p, drawId); }
}
