/**
 * The stages after a brief, and the two gates:
 *
 *   brief → check → GATE 1 (accept | dismiss | hold | pass | flag | draft)
 *         → repair → check again → GATE 1
 *         → schedule → scene ×M → screen ×M → GATE 2 (keep | rewrite k | pass)
 *         → drafts/<draw>/
 *
 * Statuses on the draw: done → awaiting_check_gate → repairing | drafting →
 * awaiting_draft_gate → drafted | passed. A repaired brief is a new draw
 * (repaired_from) and the source becomes `repaired`. `--auto` works gate 1 by
 * the mechanical rule and stops at gate 2.
 */
import type { DrawRow, Pipeline } from "./draw.ts";
import { record } from "./verdicts.ts";
import { now } from "./paths.ts";
import { loadDraftConfig, samplesFor, type DraftConfig, type Overrides, type Resolved } from "./draftconfig.ts";
import { runCheck, type CheckResult } from "./check.ts";
import { constraintsBlock, repair, type Accepted } from "./repair.ts";
import { briefBlock, briefParts, checkFindings, judgeNote, latestCheckPass, latestLedger, passId, type FindingView } from "./briefparts.ts";
import { currentScenes, runScenes, runSchedule, runScreens, writeScene, type Schedule } from "./write.ts";
import { draftView, exportDraft, renderStory, type DraftView } from "./drafts.ts";
import { tag } from "./model.ts";
import { fill } from "./prompts.ts";

export const CHECKABLE = new Set(["done", "awaiting_check_gate"]);
export type DraftOpts = { profile?: string; overrides?: Overrides; auto?: boolean; lexiconPath?: string; premisesPath?: string };

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

  findings(drawId: string): { pass: string | null; findings: FindingView[]; claims: unknown[]; profiles: unknown[]; examined: { stage: string; sample: number; examined: string }[]; judge: string | null } {
    this.p.draw(drawId);
    const pass = latestCheckPass(this.p, drawId);
    const arts = this.p.artifacts(drawId);
    const meta = (a: { meta: string }) => JSON.parse(a.meta);
    const steps = this.p.steps(drawId).filter((s) => /^check-/.test(s.stage) && s.status === "done");
    const examined = steps.map((s, i) => ({ stage: s.stage, sample: i + 1, examined: String((JSON.parse(s.parsed ?? "{}") as any).examined ?? "") })).filter((x) => x.examined);
    return {
      pass, findings: checkFindings(this.p, drawId),
      claims: arts.filter((a) => a.kind === "claim" && meta(a).pass === pass).map((a) => ({ statement: a.content, ...meta(a) })),
      profiles: arts.filter((a) => a.kind === "profile" && meta(a).source === "check" && meta(a).pass === pass).map((a) => meta(a)),
      examined, judge: judgeNote(this.p, drawId),
    };
  }

  // --- gate 1 ----------------------------------------------------------------

  /** Accept findings by id and run the repair, then the re-check. Returns the repaired draw. */
  async accept(drawId: string, ids: string[], opts: { method?: "gate" | "draw"; note?: string } = {}): Promise<DrawRow> {
    const draw = this.must(drawId, "awaiting_check_gate");
    const open = checkFindings(this.p, drawId);
    const chosen = ids.map((id) => { const f = open.find((x) => x.id === id); if (!f) throw new Error(`draw ${drawId}: no reported finding ${id}`); return f; });
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
    const f = checkFindings(this.p, drawId).find((x) => x.id === id);
    if (!f) throw new Error(`draw ${drawId}: no reported finding ${id}`);
    record(this.p.db, { kind: "finding", target_id: id, verdict: "pass", method, note });
    return { ...f, decision: "dismissed", note };
  }

  hold(drawId: string): DrawRow { return this.must(drawId, "awaiting_check_gate"); }

  passBrief(drawId: string, note = ""): DrawRow {
    this.must(drawId, "awaiting_check_gate", "done");
    record(this.p.db, { kind: "brief", target_id: drawId, verdict: "pass", method: "gate", note });
    this.p.db.query("UPDATE draws SET status = 'passed', ended_at = ? WHERE id = ?").run(now(), drawId);
    return this.p.draw(drawId);
  }

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
      const ledger = await this.ensureLedger(drawId, resolved.config);
      const { step, schedule } = await runSchedule(this.p, drawId, parts, briefBlock(parts), resolved.config);
      const scenes = await runScenes(this.p, drawId, step, parts, ledger, schedule, resolved.config);
      await runScreens(this.p, drawId, parts, ledger, schedule, scenes, resolved.config, undefined, { lexiconPath: this.opts.lexiconPath });
    } catch (e) {
      this.p.fail(drawId, e);
      throw e;
    }
    this.status(drawId, "awaiting_draft_gate");
    return this.p.draw(drawId);
  }

  /** A draft started without a check has no ledger; one ledger extraction supplies it. */
  private async ensureLedger(drawId: string, cfg: DraftConfig): Promise<string> {
    const have = latestLedger(this.p, drawId);
    if (have) return have;
    const parts = briefParts(this.p, drawId);
    const pass = passId();
    const { step, value } = await this.p.invoke(drawId, parts.outlineStepId, "check-ledger", fill("checkLedger", { brief: briefBlock(parts), findingShape: fill("findingShape", { sections: "debt audit | arithmetic | custody" }) }), (t) => {
      const l = tag(t, "ledger"); if (!l) throw new Error("no <ledger> tag"); return { ledger: l, examined: tag(t, "examined") ?? "" };
    });
    this.p.artifact(step, "ledger", value.ledger, { pass, sample: 1, ledger_only: true });
    void cfg;
    return value.ledger;
  }

  /**
   * The auto rule: run the check if none has, accept every finding from
   * derivation, ledger and claims recurring in all of that checker's samples
   * with evidence, dismiss the rest as `auto`, repair and re-check
   * `repair.rounds` times. Returns the draw to draft from.
   */
  private async autoGate(drawId: string, cfg: DraftConfig): Promise<string> {
    let id = drawId;
    if (!latestCheckPass(this.p, id)) { this.status(id, "checking"); await runCheck(this.p, id, cfg, { premisesPath: this.opts.premisesPath }).catch((e) => { this.p.fail(id, e); throw e; }); this.status(id, "awaiting_check_gate"); }
    for (let round = 0; round <= cfg.repair.rounds; round++) {
      const open = checkFindings(this.p, id).filter((f) => f.decision === "open");
      const accept: string[] = [];
      for (const f of open) {
        const eligible = f.checkers.some((c) => ["derivation", "ledger", "claims"].includes(c));
        const needed = Math.max(...f.checkers.map((c) => c === "claims" ? 1 : samplesFor(cfg.checks, c).samples));
        if (eligible && f.n >= needed && f.evidence.trim().toLowerCase() !== "none" && f.evidence.trim()) accept.push(f.id);
        else this.dismiss(id, f.id, "auto", "draw");
      }
      if (!accept.length || round === cfg.repair.rounds) {
        for (const a of accept) this.dismiss(id, a, "auto: rounds exhausted", "draw");
        break;
      }
      id = (await this.accept(id, accept, { method: "draw", note: "auto" })).id;
    }
    this.p.db.query("UPDATE draws SET draft_config = (SELECT draft_config FROM draws WHERE id = ?) WHERE id = ?").run(drawId, id);
    return id;
  }

  // --- gate 2 ----------------------------------------------------------------

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
      const ledger = latestLedger(this.p, drawId) ?? "";
      const schedule: Schedule = { form: v.schedule.form as Schedule["form"], formLines: [], beats: v.schedule.beats, raw: v.schedule.raw };
      const scheduleStep = this.p.steps(drawId).find((s) => s.stage === "schedule" && s.status === "done")!;
      const before = v.scenes.filter((s) => s.beat < k).map((s) => s.text);
      await writeScene(this.p, drawId, scheduleStep.id, parts, ledger, schedule, schedule.beats[k - 1], cfg.scenes.order === "sequential" ? before : [], constraints);
      const scenes = currentScenes(this.p, drawId);
      await runScreens(this.p, drawId, parts, ledger, schedule, scenes, cfg, k < M ? [k, k + 1] : [k], { lexiconPath: this.opts.lexiconPath });
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

  passDraft(drawId: string, note = ""): DrawRow {
    this.must(drawId, "awaiting_draft_gate");
    record(this.p.db, { kind: "draft", target_id: drawId, verdict: "pass", method: "gate", note });
    this.p.db.query("UPDATE draws SET status = 'passed', ended_at = ? WHERE id = ?").run(now(), drawId);
    return this.p.draw(drawId);
  }

  // --- reads -----------------------------------------------------------------

  story(drawId: string): string { return renderStory(this.p, drawId); }
  view(drawId: string): DraftView { return draftView(this.p, drawId); }
}
