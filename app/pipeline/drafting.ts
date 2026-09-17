/**
 * The stages after a brief, and the two gates:
 *
 *   brief → check → GATE 1 (accept | dismiss | hold | flag | draft)
 *         → repair → check again → GATE 1
 *         → schedule → scene ×M → screen ×M → GATE 2 (keep | patch | rewrite k)
 *         → drafts/<draw>/
 *
 * Statuses on the draw: done → awaiting_check_gate → repairing | drafting →
 * awaiting_draft_gate → drafted. A repaired brief is a new draw
 * (repaired_from) and the source becomes `repaired`. `--auto` works gate 1 by
 * the mechanical rule and stops at gate 2.
 */
import type { DrawRow, Pipeline } from "./draw.ts";
import { record } from "./verdicts.ts";
import { now } from "./paths.ts";
import { loadDraftConfig, type DraftConfig, type Overrides, type Resolved } from "./draftconfig.ts";
import { extractLedger, runCheck, type CheckResult } from "./check.ts";
import { applyPatches, constraintsBlock, repair, type Accepted } from "./repair.ts";
import { briefBlock, briefParts, chainIds, chainProfile, checkFindings, gateFindings, judgeNote, latestCheckPass, passId, pinnedLedger, type FindingView } from "./briefparts.ts";
import { currentScenes, runScenes, runSchedule, runScreens, writeScene, type Schedule } from "./write.ts";
import { draftView, exportDraft, renderStory, type DraftView } from "./drafts.ts";
import { tag, words } from "./model.ts";
import { fill } from "./prompts.ts";

export const CHECKABLE = new Set(["done", "awaiting_check_gate"]);
export type AutoRound = { round: number; id: string; open: number; total: number; accepted: number; calls: number };
export type AutoResult = { id: string; rounds: AutoRound[]; best: AutoRound; stopped: "floor" | "cap" | "patience" | "budget"; floor: number; calls: number; left_open: number };
export type DraftOpts = { profile?: string; overrides?: Overrides; auto?: boolean };

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

  private status(drawId: string, status: string) { this.p.db.query("UPDATE draws SET status = ? WHERE id = ?").run(status, drawId); }
  private must(drawId: string, ...statuses: string[]): DrawRow {
    const d = this.p.draw(drawId);
    if (!statuses.includes(d.status)) throw new Error(`draw ${drawId} is ${d.status}, not ${statuses.join(" | ")}`);
    return d;
  }
  private resolved(draw: DrawRow, opts: DraftOpts = {}): Resolved {
    if (draw.draft_config && !opts.profile && !opts.overrides) return JSON.parse(draw.draft_config) as Resolved;
    return loadDraftConfig(opts.profile, opts.overrides ?? {});
  }

  // --- stage 1 ---------------------------------------------------------------

  async check(drawId: string, opts: { checks?: string[]; samples?: number; profile?: string; overrides?: Overrides } = {}): Promise<CheckResult> {
    const draw = this.must(drawId, ...CHECKABLE);
    const cfg = this.resolved(draw, opts).config;
    this.status(drawId, "checking");
    try {
      const r = await runCheck(this.p, drawId, cfg, { checks: opts.checks, samples: opts.samples, premisesPath: this.opts.premisesPath });
      this.status(drawId, "awaiting_check_gate");
      return r;
    } catch (e) {
      this.p.fail(drawId, e);
      throw e;
    }
  }

  findings(drawId: string, opts: { all?: boolean } = {}): { pass: string | null; findings: FindingView[]; claims: unknown[]; profiles: unknown[]; examined: { stage: string; sample: number; examined: string }[]; judge: string | null } {
    this.p.draw(drawId);
    const pass = latestCheckPass(this.p, drawId);
    const arts = this.p.artifacts(drawId);
    const meta = (a: { meta: string }) => JSON.parse(a.meta);
    const steps = this.p.steps(drawId).filter((s) => /^check-/.test(s.stage) && s.status === "done");
    const examined = steps.map((s, i) => ({ stage: s.stage, sample: i + 1, examined: String((JSON.parse(s.parsed ?? "{}") as any).examined ?? "") })).filter((x) => x.examined);
    return {
      pass, findings: gateFindings(this.p, drawId, opts.all),
      claims: arts.filter((a) => a.kind === "claim" && meta(a).pass === pass).map((a) => ({ statement: a.content, ...meta(a) })),
      // a repair round runs neither profile checker, so the chain's own profile stands in
      profiles: ["structure", "resemblance"].flatMap((c) => {
        const here = arts.filter((a) => a.kind === "profile" && meta(a).source === "check" && meta(a).checker === c && meta(a).pass === pass).map((a) => meta(a));
        if (here.length) return here;
        const up = chainProfile(this.p, drawId, c);
        return up ? [{ ...up.meta, from_draw: up.draw }] : [];
      }),
      examined, judge: judgeNote(this.p, drawId),
    };
  }

  // --- gate 1 ----------------------------------------------------------------

  /** Accept findings by id and run the repair, then the re-check. Returns the repaired draw. */
  async accept(drawId: string, ids: string[], opts: { method?: "gate" | "draw"; note?: string } = {}): Promise<DrawRow> {
    const draw = this.must(drawId, "awaiting_check_gate");
    const open = gateFindings(this.p, drawId, true);
    const chosen = ids.map((id) => { const f = open.find((x) => x.id === id); if (!f) throw new Error(`draw ${drawId}: no reported finding ${id}`); return this.promote(drawId, f); });
    for (const f of chosen) record(this.p.db, { kind: "finding", target_id: f.id, verdict: "keep", method: opts.method ?? "gate", note: opts.note ?? "" });
    const accepted: Accepted[] = [...open.filter((f) => f.decision === "accepted"), ...chosen].filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i);
    const cfg = this.resolved(draw).config;
    const next = await repair(this.p, drawId, accepted);
    if (draw.draft_config) this.p.db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(draw.draft_config, next.id);
    await runCheck(this.p, next.id, cfg, { premisesPath: this.opts.premisesPath }).catch((e) => { this.p.fail(next.id, e); throw e; });
    this.status(next.id, "awaiting_check_gate");
    return this.p.draw(next.id);
  }

  dismiss(drawId: string, id: string, note = "", method: "gate" | "draw" = "gate"): FindingView {
    this.must(drawId, "awaiting_check_gate");
    const f = gateFindings(this.p, drawId, true).find((x) => x.id === id);
    if (!f) throw new Error(`draw ${drawId}: no reported finding ${id}`);
    this.promote(drawId, f);
    record(this.p.db, { kind: "finding", target_id: id, verdict: "pass", method, note });
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

  hold(drawId: string): DrawRow { return this.must(drawId, "awaiting_check_gate"); }

  // --- stages 3 to 5 ---------------------------------------------------------

  async draft(drawId: string, opts: DraftOpts = {}): Promise<DrawRow> {
    let draw = this.must(drawId, "done", "awaiting_check_gate");
    const resolved = this.resolved(draw, opts);
    if (resolved.config.structure.template !== "auto") throw new Error(`structure mode not built: ${resolved.config.structure.template}`);
    this.p.db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(JSON.stringify(resolved), drawId);
    if (opts.auto) {
      const next = await this.autoGate(drawId, resolved.config);
      if (next !== drawId) { drawId = next; draw = this.p.draw(drawId); }
    }
    if (checkFindings(this.p, drawId).some((f) => f.decision === "accepted")) throw new Error("accepted findings pending repair");
    this.status(drawId, "drafting");
    try {
      const parts = briefParts(this.p, drawId);
      const ledger = await this.ensureLedger(drawId);
      const { step, schedule } = await runSchedule(this.p, drawId, parts, briefBlock(parts), resolved.config);
      const scenes = await runScenes(this.p, drawId, step, parts, ledger, schedule, resolved.config);
      await runScreens(this.p, drawId, ledger, schedule, scenes, resolved.config, undefined, { lexiconPath: this.opts.lexiconPath });
    } catch (e) {
      this.p.fail(drawId, e);
      throw e;
    }
    this.status(drawId, "awaiting_draft_gate");
    return this.p.draw(drawId);
  }

  /** A draft started without a check has no ledger; one extraction supplies it. */
  private async ensureLedger(drawId: string): Promise<string> {
    const have = pinnedLedger(this.p, drawId);
    if (have) return have;
    const parts = briefParts(this.p, drawId);
    return extractLedger(this.p, drawId, parts, briefBlock(parts), { pass: passId(), sample: 1, ledger_only: true });
  }

  /**
   * Repair rounds without a gate. Each round accepts every open reported
   * finding scoring `repair.stop_score` or more, dismisses the rest as `auto`,
   * repairs and re-checks. It stops when no finding reaches the floor, when the
   * rounds run out, or when the total open score has not fallen for
   * `repair.patience` rounds — the loop does not converge on zero findings, so
   * a round cap and a patience are what end it.
   *
   * A finding under `keep_if` is not auto's to act on: with two samples a lone
   * debt-audit contradiction scored 7 and rewrote the pit chain's physics on
   * one sample, and round 2 accepted two lone findings that contradict each
   * other. Sub-threshold findings stay open for a person and are neither
   * accepted nor dismissed here. When a round accepts two or more fixes, one
   * call reads them against each other and the lower-scoring side of every
   * conflicting pair is dismissed before the repair.
   *
   * A clean pass is one sample set. The floor stop waits for `CLEAN_PASSES`
   * clean passes in a row on the same brief, each a fresh check, so a pass
   * that missed a defect does not end the chain. The re-check is its own row
   * with the same id.
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
    const draw = this.must(drawId, ...CHECKABLE);
    const cfg = opts.cfg ?? this.resolved(draw).config;
    let id = drawId;
    if (!latestCheckPass(this.p, id)) await this.recheck(id, cfg);
    const rounds: AutoRound[] = [];
    let stopped: AutoResult["stopped"] = "cap";
    let clean = 0;
    for (let round = 1; ; round++) {
      // a finding the verify pass dropped is stored under the bar and open: not auto's either
      const open = gateFindings(this.p, id).filter((f) => f.decision === "open" && f.reported);
      let accept = open.filter((f) => f.score >= cfg.repair.stop_score && autoEligible(f));
      const total = open.reduce((a, f) => a + f.score, 0);
      const calls = this.chainCalls(id);
      const row: AutoRound = { round, id, open: open.length, total, accepted: accept.length, calls };
      rounds.push(row);
      // a finding auto will never act on is dismissed with the reason, whatever ends the loop
      for (const f of open.filter((f) => !accept.includes(f))) {
        const why = f.relitigates ? `auto: re-opens the fix accepted in round ${f.relitigates.round}`
          : autoEligible(f) ? `auto: scored ${f.score}, under ${cfg.repair.stop_score}`
          : "auto: no evidence to read it against";
        this.dismiss(id, f.id, why, "draw");
      }
      if (!accept.length) {
        if (++clean < CLEAN_PASSES && calls < cfg.repair.max_calls) { await this.recheck(id, cfg); continue; }
        stopped = "floor"; break;
      }
      clean = 0;
      const best = Math.min(...rounds.map((r) => r.total));
      const since = rounds.length - 1 - rounds.findIndex((r) => r.total === best);
      // patience, the cap and the budget all stop before this round's accepted set is applied.
      // The row must not claim a repair that never ran: these findings stay open for the gate.
      if (since >= cfg.repair.patience) { row.accepted = 0; stopped = "patience"; break; }
      if (round > cfg.repair.rounds) { row.accepted = 0; stopped = "cap"; break; }
      if (calls >= cfg.repair.max_calls) { row.accepted = 0; stopped = "budget"; break; }
      accept = await this.reconcile(id, accept);
      row.accepted = accept.length;
      id = (await this.accept(id, accept.map((f) => f.id), { method: "draw", note: opts.note ?? "auto" })).id;
    }
    const best = rounds.reduce((a, r) => (r.total < a.total ? r : a), rounds[0]);
    this.p.db.query("UPDATE draws SET draft_config = (SELECT draft_config FROM draws WHERE id = ?) WHERE id = ?").run(drawId, id);
    // what the last round would have repaired had the loop gone on: the gate's work, not auto's
    const left = gateFindings(this.p, id).filter((f) => f.decision === "open" && f.reported && f.score >= cfg.repair.stop_score && autoEligible(f));
    const result: AutoResult = { id, rounds, best, stopped, floor: cfg.repair.stop_score, calls: this.chainCalls(id), left_open: left.length };
    // the round table belongs to the brief auto stopped on, so the gate can show how it got there
    const last = this.p.steps(id).filter((s) => s.status === "done").at(-1);
    if (last) this.p.artifact(last, "auto", JSON.stringify(result), { rounds: rounds.length, stopped, best: best.id });
    return result;
  }

  /** A fresh check pass on a brief that already has one. */
  private async recheck(drawId: string, cfg: DraftConfig): Promise<void> {
    this.status(drawId, "checking");
    await runCheck(this.p, drawId, cfg, { premisesPath: this.opts.premisesPath }).catch((e) => { this.p.fail(drawId, e); throw e; });
    this.status(drawId, "awaiting_check_gate");
  }

  /**
   * The accepted set with every conflicting pair reduced to its higher-scoring
   * side. One call, only when there are two or more fixes; `accept` is sorted
   * by score, so on a tie the earlier one is kept.
   */
  private async reconcile(drawId: string, accept: FindingView[]): Promise<FindingView[]> {
    if (accept.length < 2) return accept;
    const parent = this.p.steps(drawId).filter((s) => s.status === "done").at(-1)?.id ?? null;
    // the patch goes in too: on the pit chain a fix moved Ruth off the block and another patched the table for her being on it,
    // and read as sentences the second was conditional on the first, so nothing conflicted
    const fixes = accept.map((f, i) => `${i + 1}. ${f.replacement}${f.patch?.trim() ? `\n   patch: "${f.patch.trim()}"` : ""}`).join("\n");
    const prompt = fill("reconcile", { fixes });
    const { value: pairs } = await this.p.invoke<{ a: number; b: number; why: string }[]>(drawId, parent, "reconcile", prompt, (t) => {
      const block = tag(t, "conflicts");
      if (block === null) throw new Error("no <conflicts> tag");
      return parseConflicts(block).filter((x) => x.a >= 1 && x.a <= accept.length && x.b >= 1 && x.b <= accept.length && x.a !== x.b);
    });
    const dropped = new Map<string, FindingView>();
    for (const { a, b } of pairs) {
      const [hi, lo] = a < b ? [a, b] : [b, a];
      // the list is sorted by score, so the earlier index is the higher score or the tie-break
      const keep = accept[hi - 1], drop = accept[lo - 1];
      if (!dropped.has(keep.id) && !dropped.has(drop.id)) dropped.set(drop.id, keep);
    }
    for (const [id, keep] of dropped) this.dismiss(drawId, id, `auto: conflicts with ${keep.id}`, "draw");
    return accept.filter((f) => !dropped.has(f.id));
  }

  /** Model calls spent on this repair chain, so a run cannot cost more than it is worth. */
  private chainCalls(drawId: string): number {
    return chainIds(this.p, drawId).reduce((n, id) => n + this.p.steps(id).filter((s) => !["copied", "deterministic", "patched"].includes(s.model)).length, 0);
  }

  /** `draft --auto` works gate 1 by the same rule and drafts from where it stops. */
  private async autoGate(drawId: string, cfg: DraftConfig): Promise<string> {
    const r = await this.autoRounds(drawId, { cfg });
    // whatever is still open at the last round is not going to be repaired
    for (const f of gateFindings(this.p, r.id, true).filter((f) => f.decision === "open")) this.dismiss(r.id, f.id, `auto: stopped on ${r.stopped}`, "draw");
    return r.id;
  }

  // --- gate 2 ----------------------------------------------------------------

  /**
   * Apply screen flags to the scenes they sit in, word for word, with no model
   * call. A ledger screen emits a `<patch>`: the span rewritten so the
   * contradiction is gone. Before this, the only way to act on a flag was
   * `rewrite k`, which regenerates a whole scene and re-screens two — so a
   * one-number correction cost more than it was worth and nobody paid it.
   *
   * A flag whose patch is empty, or whose span has moved, is reported back
   * untouched: those are what `rewrite k` is still for.
   */
  patch(drawId: string, ids?: string[], note = ""): { applied: FindingView[]; skipped: { finding: FindingView; why: string }[] } {
    this.must(drawId, "awaiting_draft_gate");
    const flags = draftView(this.p, drawId).screenFindings.filter((f) => f.decision === "open");
    const wanted = ids?.length ? ids.map((id) => {
      const f = flags.find((x) => x.id === id);
      if (!f) throw new Error(`no open screen finding ${id} on ${drawId}`);
      return f;
    }) : flags;

    const applied: FindingView[] = [];
    const skipped: { finding: FindingView; why: string }[] = [];
    const scenes = new Map(currentScenes(this.p, drawId).map((s) => [s.beat, s]));
    const byBeat = new Map<number, FindingView[]>();
    for (const f of wanted) {
      const scene = scenes.get(f.beat!);
      if (!f.patch?.trim()) { skipped.push({ finding: f, why: "no patch: the fix needs more than the span" }); continue; }
      if (!scene) { skipped.push({ finding: f, why: `no scene for beat ${f.beat}` }); continue; }
      byBeat.set(f.beat!, [...(byBeat.get(f.beat!) ?? []), f]);
    }

    for (const [beat, fs] of [...byBeat].sort((a, b) => a[0] - b[0])) {
      const scene = scenes.get(beat)!;
      const out = applyPatches(scene.text, fs as unknown as Accepted[]);
      for (const f of fs) if (!out.applied.some((a) => a.id === f.id)) skipped.push({ finding: f, why: "the span is no longer in the scene" });
      if (!out.applied.length) continue;
      const meta = JSON.parse(this.p.artifacts(drawId).find((a) => a.id === scene.artifact_id)!.meta);
      const step = this.p.recordStep(drawId, scene.step_id, "scene", "patched");
      this.p.artifact(step, "scene", out.text, { ...meta, words: words(out.text), patched: out.applied.map((f) => f.id) });
      for (const f of out.applied) applied.push(f as unknown as FindingView);
    }

    for (const f of applied) record(this.p.db, { kind: "finding", target_id: f.id, verdict: "keep", method: "gate", note: note || "patched in place" });
    return { applied, skipped };
  }

  async rewrite(drawId: string, k: number, findingId?: string): Promise<DrawRow> {
    const draw = this.must(drawId, "awaiting_draft_gate");
    const cfg = this.resolved(draw).config;
    const v = draftView(this.p, drawId);
    if (!v.schedule) throw new Error(`draw ${drawId}: no schedule`);
    const M = v.schedule.beats.length;
    if (!(k >= 1 && k <= M)) throw new Error(`beat ${k} is not in 1..${M}`);
    const flags = v.screenFindings.filter((f) => f.beat === k);
    const chosen = findingId ? flags.filter((f) => f.id === findingId) : flags;
    if (findingId && !chosen.length) throw new Error(`beat ${k}: no screen finding ${findingId}`);
    const constraints = chosen.length ? constraintsBlock(chosen) : undefined;
    this.status(drawId, "drafting");
    try {
      const parts = briefParts(this.p, drawId);
      // the pinned one: a repaired draw carries no ledger of its own, the chain root holds it
      const ledger = pinnedLedger(this.p, drawId) ?? "";
      const schedule: Schedule = { form: v.schedule.form as Schedule["form"], beats: v.schedule.beats, raw: v.schedule.raw };
      const scheduleStep = this.p.steps(drawId).find((s) => s.stage === "schedule" && s.status === "done")!;
      const before = v.scenes.filter((s) => s.beat < k).map((s) => s.text);
      await writeScene(this.p, drawId, scheduleStep.id, parts, ledger, schedule, schedule.beats[k - 1], cfg.scenes.order === "sequential" ? before : [], constraints);
      const scenes = currentScenes(this.p, drawId);
      await runScreens(this.p, drawId, ledger, schedule, scenes, cfg, k < M ? [k, k + 1] : [k], { lexiconPath: this.opts.lexiconPath });
    } catch (e) {
      this.p.fail(drawId, e);
      throw e;
    }
    this.status(drawId, "awaiting_draft_gate");
    this.p.db.query("UPDATE draws SET flag_note = ? WHERE id = ?").run(`${draw.flag_note ? draw.flag_note + "\n" : ""}rewrite ${k}${findingId ? ` ${findingId}` : ""}`, drawId);
    return this.p.draw(drawId);
  }

  keep(drawId: string, note = ""): { draw: DrawRow; dir: string } {
    const draw = this.must(drawId, "awaiting_draft_gate");
    record(this.p.db, { kind: "draft", target_id: drawId, verdict: "keep", method: "gate", note });
    const resolved = this.resolved(draw);
    const gate2 = draw.flag_note.split("\n").filter((l) => l.startsWith("rewrite "));
    const dir = exportDraft(this.p, drawId, resolved, gate2, this.opts.draftsDir, this.p.briefsDir);
    this.p.db.query("UPDATE draws SET status = 'drafted', ended_at = ? WHERE id = ?").run(now(), drawId);
    return { draw: this.p.draw(drawId), dir };
  }

  // --- reads -----------------------------------------------------------------

  story(drawId: string): string { return renderStory(draftView(this.p, drawId)); }
  view(drawId: string): DraftView { return draftView(this.p, drawId); }
}
