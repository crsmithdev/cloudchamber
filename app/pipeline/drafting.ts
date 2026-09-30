/**
 * The stages after a brief, and the two gates:
 *
 *   brief → draft: ledger ∥ structure, resemblance, reader ∥ schedule → plan check
 *         → PLAN GATE (apply | replan | instruct | mark | write)
 *         → scene ×M, each bound to the ledger as written → screen ×M → GATE 2 (keep | rewrite k)
 *         → drafts/<draw>/
 *
 * Statuses on the draw: done → drafting → awaiting_plan_gate → drafting →
 * awaiting_draft_gate → drafted. A draft not asked to stop passes the plan
 * gate. An instruction on the brief's prose is a repair: a new draw
 * (repaired_from), and the source becomes `repaired`. Gate 1 is gone (IR spec
 * §15, T3); draws that stand at its statuses keep them and can still draft.
 */
import { writeBrief } from "./brief.ts";
import { newDrawId, type DrawRow, type Pipeline } from "./draw.ts";
import { copyBrief, copyDraft } from "./branch.ts";
import { record, type DismissReason } from "./verdicts.ts";
import { act, commit, must, type Action, type Status } from "./lifecycle.ts";
import { loadDraftConfig, type DraftConfig, type Overrides, type Resolved } from "./draftconfig.ts";
import { extractLedger, runCheck, STRUCTURE_QUESTIONS, type CheckResult } from "./check.ts";
import { constraintsBlock, repair } from "./repair.ts";
import { briefBlock, briefParts, partsIn, partsOf, passId } from "./briefparts.ts";
import { chainOf, type Chain, type FindingView } from "./chain.ts";
import { BriefSession } from "./briefsession.ts";
import { faultsOver, type Fault } from "./listen.ts";
import { ofKind } from "./artifacts.ts";
import { FAULT_LINE, linesOf, parseSchedule, runSchedule, type Schedule } from "./write.ts";
import { parseSyms, planCheck, renderLedger, type PlanCheck } from "./ir/s2.ts";
import { now } from "./paths.ts";
import { SceneSession, type Change, type ScreenPaths } from "./scenesession.ts";
import { directionsOf, draftView, exportDraft, renderStory, type DraftView } from "./drafts.ts";
import { tag } from "./model.ts";
import { defaultPrinter, noPdf, writeReport, type PdfPrinter } from "./report.ts";
import { fill } from "./prompts.ts";
import { SCORE_MAX, cost, findingId, same } from "./recur.ts";

/** One brief of an auto run: its last check pass's open findings and their total, what auto accepted on it, and how many passes it had. */
export type AutoRound = { round: number; id: string; open: number; total: number; accepted: number; calls: number; passes: number };
export type AutoResult = { id: string; rounds: AutoRound[]; best: AutoRound; stopped: "floor" | "cap" | "patience" | "stalled"; floor: number; calls: number; left_open: number };
/** An operator's instruction on a brief at gate 1: what should change, the parts it is for ("vignette", "ending", "context 1"), and whether the ledger takes it as a fact. */
export type Instruction = { text: string; parts: string[]; kind: "fact" | "direction" };
/** `plan` stops the draft at the plan gate, with the plan checked, before any scene is written. */
export type DraftOpts = { profile?: string; overrides?: Overrides; plan?: boolean };
/** A branch takes the source's drafting configuration unless it names its own, and the beat to write from. */
export type BranchOpts = { atBeat?: number; profile?: string; overrides?: Overrides; models?: Record<string, string>; instruction?: string };
/** A finding as the gate reads it, with what it breaks. */
export type GateFinding = FindingView & { cost: number };
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

/** The checks that still read the brief: the rest of gate 1 went with T3 (IR spec §15.3). */
const BRIEF_CHECKS = ["structure", "resemblance", "reader"];
export { BODY_LINE, COST_LINE, LENGTH_LINE, NUMERAL_LINE, PRESENCE_LINE } from "./write.ts";

/**
 * The register rewrites a draft owes, by beat: the lines the structure screen's
 * flags map to, and the deterministic measures over the ceilings the config
 * sets (a beat a listener would lose the thread of). Pure: run it on the
 * scenes as they stand, and again after a rewrite.
 */
export function rewritePlan(profiles: { beat: number; flags: string[] }[], scenes: { beat: number; text: string }[], cfg: DraftConfig): Map<number, Owed> {
  const plan = new Map<number, Owed>();
  const at = (k: number) => plan.get(k) ?? plan.set(k, { register: [], faults: [] }).get(k)!;
  // a register line imposes a register, so it needs a template that asked for one; a ceiling is a measurement against the pool and does not
  if (cfg.structure.template !== "auto") for (const pr of profiles) {
    const lines = linesOf(pr.flags, true);
    if (lines.length) at(pr.beat).register.push(...lines.filter((l) => !at(pr.beat).register.includes(l)));
  }
  for (const sc of scenes) {
    const faults = faultsOver(sc.text, cfg.screens.listen);
    if (faults.length) at(sc.beat).faults.push(...faults);
  }
  return plan;
}
/** What one beat owes: the register lines its structure flags map to, and the listen faults over the ceilings. */
export type Owed = { register: string[]; faults: Fault[] };
/** Every line a beat owes, register lines first. */
const owedLines = (o: Owed) => [...o.register, ...o.faults.map((f) => FAULT_LINE[f])];

/** A <conflict> carries its two numbers as <a> and <b> children or as a and b attributes; either form is read. */
export function parseConflicts(block: string): { a: number; b: number; why: string }[] {
  const out: { a: number; b: number; why: string }[] = [];
  for (const m of block.matchAll(/<conflict((?:\s+[a-z]+="[^"]*")*)\s*>([\s\S]*?)<\/conflict>/gi)) {
    const attr = (name: string) => new RegExp(`\\b${name}="(\\d+)"`).exec(m[1])?.[1];
    out.push({ a: Number(tag(m[2], "a") ?? attr("a")), b: Number(tag(m[2], "b") ?? attr("b")), why: tag(m[2], "why") ?? "" });
  }
  return out;
}

/**
 * A config pinned before the plan check existed gets it: the plan check writes
 * no prose, so a branch keeps the arms comparable. A config that chose its
 * screens keeps its choice.
 */
function withPlan(r: Resolved): Resolved {
  const on = r.config.screens.enabled;
  if (on.includes("plan") || r.overridden.includes("screens.enabled")) return r;
  return { ...r, config: { ...r.config, screens: { ...r.config.screens, enabled: ["plan", ...on] } } };
}

/** One field of one beat, as the operator writes it at the plan gate. */
export type PlanEdit = { beat: number; field: "job" | "when" | "known" | "stakes" | "set_piece"; text: string };

/** The schedule with one beat's field replaced, or added when the beat has none; every other line stays as it was. */
export function editBeat(raw: string, e: PlanEdit): string {
  const beat = new RegExp(`(<beat\\s+n="${e.beat}"\\s+words="\\d+"\\s*>)([\\s\\S]*?)(</beat>)`, "i").exec(raw);
  if (!beat) throw new Error(`no beat ${e.beat} in the plan`);
  const field = new RegExp(`<${e.field}>[\\s\\S]*?</${e.field}>`, "i");
  const line = `<${e.field}>${e.text.trim()}</${e.field}>`;
  // a beat without the field gets it, last: the parser reads fields by tag, not by place
  const body = field.test(beat[2]) ? beat[2].replace(field, () => line) : `${beat[2].replace(/\s*$/, "")}\n${line}\n`;
  return raw.slice(0, beat.index) + beat[1] + body + beat[3] + raw.slice(beat.index + beat[0].length);
}

export class Drafting {
  constructor(public p: Pipeline, public opts: { draftsDir?: string; lexiconPath?: string; premisesPath?: string; narrationDir?: string; outputDir?: string; printPdf?: PdfPrinter } = {}) {}

  /** Where the deterministic screens read their pools from. */
  private screenPaths(): ScreenPaths {
    return { lexiconPath: this.opts.lexiconPath, narrationDir: this.opts.narrationDir };
  }

  /** The draw, when `action` is allowed on it now; otherwise the reason is thrown. */
  private must(drawId: string, action: Action): DrawRow {
    const d = this.p.draw(drawId);
    must(d, action);
    return d;
  }
  private resolved(draw: DrawRow, opts: DraftOpts = {}): Resolved {
    if (draw.draft_config && !opts.profile && !opts.overrides) return withPlan(JSON.parse(draw.draft_config) as Resolved);
    return loadDraftConfig(opts.profile, opts.overrides ?? {});
  }

  // --- stage 1 ---------------------------------------------------------------

  /**
   * Settle the drafting configuration a draw will use, before it drafts. `draft`
   * does this itself; a caller that wants the draw configured first (a form, a
   * test) does it here rather than writing the column.
   */
  configure(drawId: string, opts: { profile?: string; overrides?: Overrides } = {}): Resolved {
    const resolved = this.resolved(this.p.draw(drawId), opts);
    commit(this.p.db, { id: drawId, links: { draft_config: JSON.stringify(resolved) } });
    return resolved;
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
    const all: GateFinding[] = chain.findings(opts.all).map((f) => ({ ...f, cost: cost(f.invalidates) }));
    const offList = (f: FindingView) => !f.reported && f.decision === "open";
    const shown = opts.all ? all : all.filter((f) => !offList(f));
    const off = all.filter(offList);
    // an operator's instruction is not a checker's report: the counts and the total score are the checks'
    const rep = all.filter((f) => f.reported && f.source !== "operator");
    const summary: FindingsSummary | null = !pass && !rep.length ? null
      : { pass, reported: rep.length, accepted: rep.filter((f) => f.decision === "accepted").length, open: rep.filter((f) => f.decision === "open").length, total: rep.reduce((n, f) => n + f.score, 0) };
    return {
      pass, findings: shown,
      // a person reads what it breaks first and how sure the checks are second; auto reads `findings`, by score alone
      listed: shown.filter((f) => !f.relitigates && !offList(f)).sort((a, b) => b.cost - a.cost || b.score - a.score), reopened: shown.filter((f) => !!f.relitigates), left: shown.filter((f) => !f.relitigates && offList(f)), summary,
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

  // --- the plan gate: the brief's prose ---------------------------------------

  /**
   * An operator's instructions on the brief's prose, at the plan gate. Each is
   * stored as an accepted finding with no span; the repair writes the parts it
   * names as a new draw in the chain (ADR-0009), and the new draw drafts on to
   * the plan gate. A fix to the plan itself is `apply`, which makes no new draw.
   */
  async instruct(drawId: string, instructions: Instruction[], note = ""): Promise<DrawRow> {
    const draw = this.must(drawId, "instruct");
    if (!instructions.length) throw new Error("instructions required");
    const names = ["vignette", "ending", ...partsIn(partsOf(this.p, drawId), "context").map((c) => `context ${c.index}`)];
    for (const ins of instructions) {
      if (!ins.text.trim()) throw new Error("instruction text required");
      if (ins.kind !== "fact" && ins.kind !== "direction") throw new Error("instruction kind must be fact | direction");
      if (!ins.parts.length) throw new Error("instruction parts required");
      for (const x of ins.parts) if (!names.includes(x)) throw new Error(`instruction part must be ${names.join(" | ")}, got ${x}`);
    }
    // an instruction belongs to a pass; a draw whose draft ran no brief checker has none, so the instructions open one
    let pass = chainOf(this.p, drawId).pass();
    const ids = instructions.map((ins) => {
      const text = ins.text.trim();
      const id = findingId("operator", text, drawId);
      const step = this.p.recordStep(drawId, null, "instruction", "operator", { text, parts: ins.parts, kind: ins.kind });
      if (!pass) { pass = passId(); this.p.artifact(step, "pass", pass, { pass, samples: {} }); }
      this.p.artifact(step, "finding", text, {
        id, checkers: ["operator"], samples: [1], n: 1, span: "", statement: text, result: "", evidence: "", invalidates: "", replacement: text, patch: "",
        pass, source: "operator", parts: ins.parts, kind: ins.kind,
      });
      record(this.p.db, { kind: "finding", target_id: id, verdict: "keep", method: "gate", note });
      return id;
    });
    const accepted = chainOf(this.p, drawId).findings().filter((f) => ids.includes(f.id)).map((f) => ({ ...f, parts: f.parts! }));
    const next = await repair(this.p, drawId, accepted);
    if (draw.draft_config) commit(this.p.db, { id: next.id, links: { draft_config: draw.draft_config } });
    return this.draft(next.id, { plan: true });
  }

  // --- stages 3 to 5 ---------------------------------------------------------

  async draft(drawId: string, opts: DraftOpts = {}): Promise<DrawRow> {
    const draw = this.must(drawId, "draft");
    const resolved = this.resolved(draw, opts);
    commit(this.p.db, { id: drawId, links: { draft_config: JSON.stringify(resolved) } });
    if (chainOf(this.p, drawId).findings().some((f) => f.decision === "accepted")) throw new Error("accepted findings pending repair");
    const id = drawId;
    const stopped = await act(this.p.db, { id, during: "drafting", back: this.p.draw(id).status as Status }, () => this.write(id, resolved.config, !!opts.plan),
      (atGate) => ({ id, status: atGate ? "awaiting_plan_gate" : "awaiting_draft_gate" }));
    // HTML only: the PDF print is up to 60 s and no model reads it, so gate 2 starts it instead (`keep`)
    if (!stopped) await writeReport(this.p, drawId, this.opts.outputDir, noPdf);
    return this.p.draw(drawId);
  }

  /**
   * A whole draft from the brief: the schedule, then every scene. Under `stop`
   * it ends at the plan gate instead, with the plan checked and the brief's
   * text checks beside it; otherwise the plan is checked beside the scenes.
   * True when it stopped at the plan gate.
   */
  private async write(id: string, cfg: DraftConfig, stop: boolean): Promise<boolean> {
    const parts = briefParts(this.p, id);
    // structure, resemblance and the reader read the brief as text and are shown at the plan gate (IR spec §15.3);
    // runCheck runs each only where the chain has not had it, so a repaired brief runs none
    const brief = stop ? runCheck(this.p, id, cfg, { checks: cfg.checks.enabled.filter((c) => BRIEF_CHECKS.includes(c)), premisesPath: this.opts.premisesPath }) : null;
    const ledger = await this.ensureLedger(id);
    const { step, schedule } = await runSchedule(this.p, id, parts, briefBlock(parts), cfg);
    const pass = passId();
    if (stop) {
      await Promise.all([planCheck(this.p, id, step.id, ledger, schedule, pass), brief]);
      return true;
    }
    // the plan check runs beside the scenes: it is read at gate 2 and gates nothing, so the scenes do not wait for it
    const plan = this.planCheck(id, step.id, ledger, schedule, cfg, pass);
    const session = new SceneSession({ p: this.p, drawId: id, parent: step.id, parts, ledger, schedule, cfg, pass, paths: this.screenPaths() });
    await this.scenes(session, cfg, 1);
    await plan;
    return false;
  }

  // --- the plan gate (docs/specs/2026-09-28-story-ir.md §6, S3) --------------

  /**
   * Fix the plan: each ticked plan finding's span in the schedule is replaced
   * by the operator's note on it, or by the finding's own patch, and each edit
   * replaces one field of one beat. The new schedule is parsed as a model's
   * would be, and checked again. At the plan gate no scene exists yet. At gate
   * 2 (S5, §9) only the beats whose plan changed are written again, each under
   * the ticked findings on it and the instructions it was written under, and
   * the beat after each is screened again; a replan would write every beat
   * from the first change.
   */
  async applyPlan(drawId: string, o: { findings?: string[]; notes?: Record<string, string>; edits?: PlanEdit[] }): Promise<DrawRow> {
    const draw = this.must(drawId, "apply");
    const cfg = this.resolved(draw).config;
    const chain = chainOf(this.p, drawId);
    const was = chain.schedule()!;
    const open = chain.planFindings().filter((f) => f.decision === "open");
    let raw = was.raw;
    const applied: string[] = [];
    for (const id of o.findings ?? []) {
      const f = open.find((x) => x.id === id);
      if (!f) throw new Error(`no open plan finding ${id}`);
      const text = o.notes?.[id]?.trim() || (/^none\.?$/i.test(f.patch.trim()) ? "" : f.patch.trim());
      if (!text) throw new Error(`plan finding ${id} has no patch: write the fix as its note, edit the beat, or re-plan`);
      const n = raw.split(f.span).length - 1;
      if (n !== 1) throw new Error(`plan finding ${id}: its span is in the plan ${n} times, not once`);
      raw = raw.replace(f.span, text);
      applied.push(id);
    }
    for (const e of o.edits ?? []) raw = editBeat(raw, e);
    if (raw === was.raw) throw new Error("nothing to apply");
    const schedule = parseSchedule(raw, cfg);
    const at = draw.status as Status;
    // a beat's plan changed when any of its parsed fields did; beats are numbered 1..M in both
    const changed = schedule.beats.filter((b, i) => JSON.stringify(b) !== JSON.stringify(was.beats[i])).map((b) => b.n);
    await act(this.p.db, { id: drawId, during: "drafting", back: at }, async () => {
      const step = this.p.recordStep(drawId, chain.latest("schedule")!.step_id, "schedule", "operator", { applied, edits: o.edits ?? [] });
      this.p.artifact(step, "schedule", schedule.raw, { form: schedule.form, beats: schedule.beats, words: schedule.beats.reduce((a, b) => a + b.words, 0) });
      for (const id of applied) record(this.p.db, { kind: "finding", target_id: id, verdict: "keep", method: "gate", note: "applied to the plan" });
      const check = planCheck(this.p, drawId, step.id, chain.ledger() ?? "", schedule, passId());
      if (at === "awaiting_draft_gate" && changed.length) {
        const directions = directionsOf(this.p, drawId);
        const changes = changed.map((k): Change => {
          const mine = open.filter((f) => f.beat === k && applied.includes(f.id));
          const lines = [...mine.flatMap((f) => [f, ...(o.notes?.[f.id]?.trim() ? [{ replacement: o.notes[f.id]!.trim() }] : [])]), ...directions.filter((x) => x.beats.includes(k)).map((x) => ({ replacement: x.text }))];
          return { beat: k, kind: "rewrite", constraints: lines.length ? constraintsBlock(lines) : undefined, findings: mine.map((f) => f.id) };
        });
        const session = new SceneSession({ p: this.p, drawId, parent: step.id, parts: briefParts(this.p, drawId), ledger: chain.ledger() ?? "", schedule, cfg, pass: passId(), paths: this.screenPaths() });
        await session.revise(changes);
        const touched = new Set(changed.flatMap((k) => [k, k + 1]));
        await session.screenClaims(session.scenes().filter((x) => touched.has(x.beat)));
      }
      await check;
    }, () => ({ id: drawId, status: at }));
    if (at === "awaiting_draft_gate") await writeReport(this.p, drawId, this.opts.outputDir, noPdf);
    return this.p.draw(drawId);
  }

  /**
   * Plan the schedule again from beat `from` under the operator's instruction,
   * and check the new plan. Under other drafting settings (a profile or
   * overrides) the whole plan is made again from the first beat, since the
   * settings can change the beat count and the length; the instruction is
   * then optional.
   */
  async replan(drawId: string, from: number, instruction: string, settings: { profile?: string; overrides?: Overrides } = {}): Promise<DrawRow> {
    const draw = this.must(drawId, "replan");
    const resettle = !!(settings.profile || (settings.overrides && Object.keys(settings.overrides).length));
    const cfg = this.resolved(draw, resettle ? settings : {}).config;
    const chain = chainOf(this.p, drawId);
    const was = chain.schedule()!;
    if (!(Number.isInteger(from) && from >= 1 && from <= was.beats.length)) throw new Error(`beat ${from} is not in 1..${was.beats.length}`);
    if (resettle && from !== 1) throw new Error("other settings plan again from beat 1");
    if (!resettle && !instruction.trim()) throw new Error("instruction required");
    if (resettle) this.configure(drawId, settings);
    await act(this.p.db, { id: drawId, during: "drafting", back: "awaiting_plan_gate" }, async () => {
      const parts = briefParts(this.p, drawId);
      const replan = instruction.trim() ? { instruction: instruction.trim(), from, schedule: was } : undefined;
      const { step, schedule } = await runSchedule(this.p, drawId, parts, briefBlock(parts), cfg, replan);
      await planCheck(this.p, drawId, step.id, chain.ledger() ?? "", schedule, passId());
    }, () => ({ id: drawId, status: "awaiting_plan_gate" }));
    return this.p.draw(drawId);
  }

  /**
   * Record a person's reading of a plan finding: real or not (plan step 5).
   * The reading is an artifact on the finding's step, not a verdict, so it
   * does not settle the finding: a real finding stays open until a fix is
   * applied or a rewrite runs under it.
   */
  mark(drawId: string, findingId: string, real: boolean, note = ""): { finding: string; real: boolean } {
    this.must(drawId, "mark");
    const f = chainOf(this.p, drawId).planFindings().find((x) => x.id === findingId);
    if (!f) throw new Error(`no plan finding ${findingId} on draw ${drawId}`);
    const stepId = this.p.artifacts(drawId).find((a) => a.id === f.artifact_id)!.step_id;
    const step = this.p.steps(drawId).find((s) => s.id === stepId)!;
    this.p.artifact(step, "reading", real ? "real" : "not real", { finding: findingId, real, note, at: now() });
    return { finding: findingId, real };
  }

  /** Write every scene from the plan as it stands at the gate; the plan was checked there, so it is not checked again. */
  async writeScenes(drawId: string): Promise<DrawRow> {
    const draw = this.must(drawId, "write");
    const cfg = this.resolved(draw).config;
    await act(this.p.db, { id: drawId, during: "drafting", back: "awaiting_plan_gate" }, async () => {
      const chain = chainOf(this.p, drawId);
      const parts = briefParts(this.p, drawId);
      const session = new SceneSession({ p: this.p, drawId, parent: chain.latest("schedule")!.step_id, parts, ledger: chain.ledger() ?? "", schedule: chain.schedule()!, cfg, pass: passId(), paths: this.screenPaths() });
      await this.scenes(session, cfg, 1);
    }, () => ({ id: drawId, status: "awaiting_draft_gate" }));
    await writeReport(this.p, drawId, this.opts.outputDir, noPdf);
    return this.p.draw(drawId);
  }

  /**
   * The plan check (docs/specs/2026-09-28-story-ir.md §14.5, S3′): the schedule
   * against the pinned ledger, stored as `plan` findings for gate 2. Under
   * `screens.enabled` as `plan`; a failed model call leaves its step and the
   * draft goes on.
   */
  private planCheck(drawId: string, parent: string, ledger: string, schedule: Schedule, cfg: DraftConfig, pass: string): Promise<PlanCheck | null> {
    if (!cfg.screens.enabled.includes("plan")) return Promise.resolve(null);
    return planCheck(this.p, drawId, parent, ledger, schedule, pass);
  }

  /**
   * Another draft of the same brief, as a draw of its own: the brief and the
   * pinned ledger are carried over, and the schedule and every scene are
   * written again. Best of N drafts siblings; the source is untouched. The
   * source's drafting configuration holds unless `opts` names a profile or an
   * override, which resolves it again as it stands now.
   */
  async sibling(drawId: string, opts: DraftOpts = {}): Promise<DrawRow> {
    const src = this.p.draw(drawId);
    const newId = newDrawId();
    const oStep = copyBrief(this.p, src, newId);
    this.p.artifact(oStep, "brief", writeBrief(this.p.db, newId, this.p.briefsDir), {});
    const resolved = this.resolved(src, opts);
    commit(this.p.db, { id: newId, links: { draft_config: JSON.stringify(resolved) } });
    await act(this.p.db, { id: newId, during: "drafting", back: "failed" }, () => this.write(newId, resolved.config, false),
      () => ({ id: newId, status: "awaiting_draft_gate" }));
    await writeReport(this.p, newId, this.opts.outputDir, noPdf);
    return this.p.draw(newId);
  }

  /**
   * The scenes of a draft, from `from` on: written, bound, screened, and given
   * the rewrites the screens ask for. The beats under `from` were copied by a
   * branch and are held still — they carry the source's screen answers already,
   * and a second rewrite of them would move the material the branch pins.
   */
  private async scenes(session: SceneSession, cfg: DraftConfig, from: number, instruction?: string): Promise<void> {
    const scenes = await session.all(from, instruction);
    await session.screen(scenes, scenes.filter((x) => x.beat >= from).map((x) => x.beat), { claims: false });
    // one rewrite of each beat the screens flag: the register lines only under a shaped template, the ceilings always
    await this.registerRewrites(session.drawId, cfg, from);
    await session.screenClaims(session.scenes());
  }

  /**
   * Develop an existing draft from a beat as a draw of its own: the brief, the
   * pinned ledger, the schedule and the beats under `at_beat` are carried over
   * word for word, and the beats from there on are written again. The source is
   * untouched.
   *
   * Pinning the schedule is the largest variance cut a comparison has. With no
   * `at_beat` the branch writes every scene against the schedule the source
   * derived, so two arms differ by the change under test and not by their plans.
   */
  async branch(drawId: string, opts: BranchOpts = {}): Promise<DrawRow> {
    const src = this.must(drawId, "branch");
    const newId = newDrawId();
    const { from } = copyDraft(this.p, src, newId, opts.atBeat ?? 1);
    if (opts.models && Object.keys(opts.models).length) this.p.setModels(newId, opts.models);
    // the source's drafting configuration unless this branch names another: what is under test is the only thing that moves
    const resolved = this.resolved(src, opts);
    commit(this.p.db, { id: newId, links: { draft_config: JSON.stringify(resolved) } });
    const instruction = opts.instruction?.trim() || undefined;
    await act(this.p.db, { id: newId, during: "drafting", back: "failed" }, async () => {
      // under an instruction the branch plans the story again from `from`, and writes every beat from there under it
      const pass = passId();
      const ledger = chainOf(this.p, newId).ledger() ?? "";
      let plan: Promise<PlanCheck | null>;
      if (instruction) {
        const parts = briefParts(this.p, newId);
        const { step, schedule } = await runSchedule(this.p, newId, parts, briefBlock(parts), resolved.config, { instruction, from, schedule: chainOf(this.p, newId).schedule()! });
        // a replanned schedule is a new plan: checked again, beside the scenes
        plan = this.planCheck(newId, step.id, ledger, schedule, resolved.config, pass);
      } else {
        // a carried schedule is checked on this draw too: the source's plan findings are the source's, and it may have had none
        const carried = chainOf(this.p, newId).latest("schedule")!;
        plan = this.planCheck(newId, carried.step_id, ledger, chainOf(this.p, newId).schedule()!, resolved.config, pass);
      }
      const session = SceneSession.resume(this.p, newId, resolved.config, pass, this.screenPaths());
      await this.scenes(session, resolved.config, from, instruction);
      await plan;
    }, () => ({ id: newId, status: "awaiting_draft_gate" }));
    await writeReport(this.p, newId, this.opts.outputDir, noPdf);
    return this.p.draw(newId);
  }

  /**
   * The chain's ledger, pinned on the first draft: rendered from the table the
   * outline declared (T4), or, for a brief with none, one extraction.
   */
  private async ensureLedger(drawId: string): Promise<string> {
    const chain = chainOf(this.p, drawId);
    const have = chain.ledger();
    if (have) return have;
    const table = parseSyms(chain.outline());
    if (table.length) {
      const ledger = renderLedger(table);
      this.p.artifact(this.p.recordStep(drawId, null, "ledger-extract", "deterministic", { declared: table.length }), "ledger", ledger, { pass: passId(), sample: 1, ledger_only: true });
      return ledger;
    }
    const parts = briefParts(this.p, drawId);
    return extractLedger(new BriefSession(this.p, drawId, parts, "ledger-extract"), { pass: passId(), sample: 1, ledger_only: true });
  }

  // --- gate 2 ----------------------------------------------------------------

  /**
   * Write beats again at gate 2, in beat order. A beat the operator ticked
   * flags on carries those flags alone, each followed by the operator's note
   * on it; a beat named without ticked flags carries every open flag and its
   * structure lines. Either way it carries every instruction given for it
   * before, and the operator's `instruction` when there is one. A ticked flag
   * is a screen flag or a plan finding.
   */
  async rewrite(drawId: string, beats: number[], o: { findings?: string[]; notes?: Record<string, string>; instruction?: string } = {}): Promise<DrawRow> {
    const draw = this.must(drawId, "rewrite");
    const cfg = this.resolved(draw).config;
    const v = draftView(this.p, drawId);
    if (!v.schedule) throw new Error(`draw ${drawId}: no schedule`);
    const M = v.schedule.beats.length;
    if (!beats.length) throw new Error("beat required");
    for (const k of beats) if (!(Number.isInteger(k) && k >= 1 && k <= M)) throw new Error(`beat ${k} is not in 1..${M}`);
    // a flag a person dismissed, or one already patched in place, is not a constraint on the rewrite
    const open = [...v.screenFindings, ...v.planFindings].filter((f) => f.decision === "open" && f.beat !== undefined && beats.includes(f.beat));
    const ticked = o.findings ?? [];
    for (const id of ticked) if (!open.some((f) => f.id === id)) throw new Error(`no open flag ${id} on beat ${beats.join(", ")}`);
    const instruction = o.instruction?.trim() || undefined;
    const changes = [...new Set(beats)].map((k): Change => {
      const mine = open.filter((f) => f.beat === k && ticked.includes(f.id));
      const note = (id: string) => o.notes?.[id]?.trim();
      const chosen = mine.length
        ? mine.flatMap((f) => [f, ...(note(f.id) ? [{ replacement: note(f.id)! }] : [])])
        : [...open.filter((f) => f.beat === k && f.source === "screen"), ...linesOf(v.profiles.find((pr) => pr.beat === k)?.flags ?? []).map((replacement) => ({ replacement }))];
      // an instruction given for this beat before still holds: a rewrite for a flag must not undo it
      const earlier = v.directions.filter((x) => x.beats.includes(k) && x.text !== instruction).map((x) => ({ replacement: x.text }));
      const lines = [...chosen, ...earlier, ...(instruction ? [{ replacement: instruction }] : [])];
      return { beat: k, kind: "rewrite", constraints: lines.length ? constraintsBlock(lines) : undefined, findings: mine.map((f) => f.id), instruction };
    });
    await act(this.p.db, { id: drawId, during: "drafting", back: "awaiting_draft_gate" },
      () => this.regenerate(drawId, changes, cfg),
      () => ({ id: drawId, status: "awaiting_draft_gate" }));
    // a plan finding is on the schedule, not on a scene, so no new screen pass replaces it: the rewrite settles it
    for (const f of open) if (f.source === "plan" && ticked.includes(f.id)) record(this.p.db, { kind: "finding", target_id: f.id, verdict: "keep", method: "draw", note: "rewritten under it" });
    // HTML only: the PDF print is up to 60 s and no model reads it, so gate 2 starts it instead (`keep`)
    await writeReport(this.p, drawId, this.opts.outputDir, noPdf);
    return this.p.draw(drawId);
  }

  /** Write the beats again and hold the story to the ledger again. The caller holds the status. */
  private async regenerate(drawId: string, changes: Change[], cfg: DraftConfig): Promise<void> {
    const session = SceneSession.resume(this.p, drawId, cfg, passId(), this.screenPaths());
    await session.revise(changes);
    const touched = new Set(changes.flatMap((c) => [c.beat, c.beat + 1]));
    await session.screenClaims(session.scenes().filter((s) => touched.has(s.beat)));
  }

  /**
   * Under a shaped template the register is part of the draft, not a gate
   * decision: each beat the structure screen flags for it gets one rewrite
   * with the flag as its constraint, a body not named. In beat order; a beat
   * the rewrite flags again for the same line waits for a person. A rewrite
   * under one line can break another ceiling (run 7: a length rewrite put
   * the figures back, a presence rewrite pushed the long share over), so the
   * plan is computed again after the pass, and a beat that now needs a line
   * it has not had gets one more rewrite under everything that applies. A
   * restated flag is not a trigger: on two twelve-beat signal drafts it fired
   * twenty times a draft on motifs and callbacks, sent nine beats each back
   * for a rewrite, and the rewrites kept the motifs. It stays a gate-2 flag
   * for `rewrite k`.
   *
   * Each round hands its due beats to `SceneSession.revise`, which writes,
   * binds and screens them.
   */
  private async registerRewrites(drawId: string, cfg: DraftConfig, from = 1): Promise<void> {
    const done = new Map<number, Set<string>>();
    for (let round = 0; round < 2; round++) {
      const chain = chainOf(this.p, drawId);
      const plan = rewritePlan(chain.screenProfiles(), chain.scenes(), cfg);
      const due = [...plan].filter(([k, o]) => k >= from && owedLines(o).some((l) => !done.get(k)?.has(l))).sort((a, b) => a[0] - b[0]);
      if (!due.length) return;
      for (const [k, o] of due) done.set(k, new Set([...(done.get(k) ?? []), ...owedLines(o)]));

      const session = SceneSession.resume(this.p, drawId, cfg, passId(), this.screenPaths());
      const directions = directionsOf(this.p, drawId);
      // a beat owed only the listen lines is edited in place, sentence by sentence, under fix = "edit"
      const editing = cfg.screens.listen?.fix === "edit";
      await session.revise(due.map(([k, o]): Change => editing && !o.register.length
        ? { beat: k, kind: "edit", faults: o.faults }
        // an instruction the beat was written under holds through the rewrite the screens ask for
        : { beat: k, kind: "rewrite", constraints: constraintsBlock([...owedLines(o), ...directions.filter((x) => x.beats.includes(k)).map((x) => x.text)].map((replacement) => ({ replacement }))) }));
    }
  }

  keep(drawId: string, note = ""): { draw: DrawRow; dir: string } {
    const draw = this.must(drawId, "keep");
    record(this.p.db, { kind: "draft", target_id: drawId, verdict: "keep", method: "gate", note });
    const resolved = this.resolved(draw);
    const gate2 = ofKind(this.p.artifacts(drawId), "scene").filter((a) => a.meta.rewrite)
      .map((a) => `rewrite ${a.meta.beat}${a.meta.rewrite_finding ? ` ${a.meta.rewrite_finding}` : ""}${a.meta.instruction ? `: ${a.meta.instruction}` : ""}`);
    const dir = exportDraft(this.p, drawId, resolved, gate2, this.opts.draftsDir, this.p.briefsDir);
    commit(this.p.db, { id: drawId, status: "drafted", ended: true });
    // the one place the PDF is worth printing, and it is not waited on: the route says to run
    // `cloudchamber report <draw>` while it is missing, and a CLI keep may exit before it lands
    void writeReport(this.p, drawId, this.opts.outputDir, this.opts.printPdf ?? defaultPrinter()).catch(() => {});
    return { draw: this.p.draw(drawId), dir };
  }

  // --- reads -----------------------------------------------------------------

  story(drawId: string): string { return renderStory(draftView(this.p, drawId)); }
  view(drawId: string): DraftView { return draftView(this.p, drawId); }
}
