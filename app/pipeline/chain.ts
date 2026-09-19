/**
 * A repair chain read once. Every question the gate, the checkers, the
 * repair and the draft ask about a chain — the latest check pass, the samples
 * it ran, the fixes settled in earlier rounds, the pinned ledger and outline,
 * the profiles, the claims, the findings and their scores, the schedule, the
 * scenes as they stand, each beat's latest screen pass, the auto run — is
 * answered from one load of that chain's draws, steps, artifacts and finding
 * verdicts. "Which one is current" is decided here and nowhere else.
 *
 * Read it through `chainOf(p, drawId)` and ask the chain, rather than calling a
 * function per question: each answer is computed once per chain, so a findings
 * view of an eight-round chain loads what it needs once instead of a hundred
 * times.
 */
import type { DrawRow, Pipeline, StepRow } from "./draw.ts";
import { latestAll, type Latest } from "./verdicts.ts";
import { cluster, excludeDismissed, merge, normalise, same, score, type Cluster, type Finding, type ScoreContext } from "./recur.ts";
import { briefParts, prose } from "./briefparts.ts";
import { latestOf, ofKind, type Artifact, type FindingMeta } from "./artifacts.ts";
import type { Profile, Scene, Schedule } from "./write.ts";
import type { AutoResult } from "./drafting.ts";
import type { SlopReport } from "./slop.ts";
import type { ListenReport } from "./listen.ts";
export type FindingView = FindingMeta & { artifact_id: string; decision: "accepted" | "dismissed" | "open"; note: string; score: number; samples_run: number; reported: boolean; relitigates?: Settled };
/** A finding accepted somewhere in this repair chain, and where. */
export type Settled = { finding: string; draw: string; round: number; replacement: string; span: string; statement: string };
export type CachedClaim = { statement: string; span: string; result: string; evidence: string; invalidates: string; replacement: string; patch: string; draw: string };

/** The model family of a model id: the second token of claude-<family>-... */
export const family = (model: string) => model.split("-")[1] ?? model;

const NO_CALL = ["copied", "deterministic", "patched"];

const amended = (base: string, amendments: Settled[]) => !amendments.length ? base
  : [base, "", "amended by the findings accepted since; where an amendment and a line above disagree, the amendment holds and the line above is void:", ...amendments.map((a) => `- ${a.replacement}`)].join("\n");

export class Chain {
  /** The draw and every brief it repairs, back to the root: newest first. */
  readonly ids: string[];
  private verdicts: Map<string, Latest> | null = null;
  private memo = new Map<string, unknown>();

  /** `rows` seeds the chain with draw rows already loaded, so a list of every draw walks no query per row. */
  constructor(private p: Pipeline, readonly drawId: string, rows?: Map<string, DrawRow>) {
    if (rows) for (const [id, r] of rows) this.memo.set(`row:${id}`, r);
    const ids: string[] = [];
    for (let id: string | null = drawId; id && !ids.includes(id); id = this.row(id).repaired_from) ids.push(id);
    this.ids = ids;
  }

  private once<T>(key: string, f: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, f());
    return this.memo.get(key) as T;
  }
  row(id: string): DrawRow { return this.once(`row:${id}`, () => this.p.draw(id)); }
  artifacts(id: string = this.drawId): Artifact[] { return this.once(`artifacts:${id}`, () => this.p.artifacts(id)); }
  steps(id: string = this.drawId): StepRow[] { return this.once(`steps:${id}`, () => this.p.steps(id)); }
  /** The gate decision on a finding: every finding verdict is read in one query. */
  decision(findingId: string): { decision: "accepted" | "dismissed" | "open"; note: string } {
    this.verdicts ??= latestAll(this.p.db, "finding");
    const l = this.verdicts.get(findingId);
    return l ? { decision: l.verdict === "keep" ? "accepted" : "dismissed", note: l.note } : { decision: "open", note: "" };
  }

  /** The first draw of the chain. */
  get root(): string { return this.ids.at(-1)!; }
  /** The chain as the list shows it: every round oldest first, this draw last. */
  get rounds(): string[] { return [...this.ids].reverse(); }

  /** The newest artifact of one kind on this draw, or undefined. */
  latest<K extends string>(kind: K): Artifact<K> | undefined { return latestOf(this.artifacts(), kind); }
  /** One artifact of this draw by id. */
  artifact(id: string): Artifact | undefined { return this.artifacts().find((a) => a.id === id); }
  /** The latest done step of this draw: what a gate-time step hangs from. */
  lastStep(): StepRow | undefined { return this.steps().filter((s) => s.status === "done").at(-1); }

  // --- the write half -------------------------------------------------------

  /** The latest schedule, or null before one is derived. */
  schedule(): Schedule | null {
    const a = this.latest("schedule");
    return a ? { form: a.meta.form as Schedule["form"], beats: a.meta.beats, raw: a.content } : null;
  }

  /** The latest scene artifact per beat, in beat order: the story as it stands, patches and rewrites included. */
  scenes(): Scene[] {
    return this.once("scenes", () => {
      const byBeat = new Map<number, Scene>();
      for (const a of ofKind(this.artifacts(), "scene")) byBeat.set(a.meta.beat, { beat: a.meta.beat, text: a.content, artifact_id: a.id, step_id: a.step_id });
      return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
    });
  }

  /** The latest screen pass on each beat, read off its structure profile; a beat never profiled has none. */
  private screenPasses(): Map<number, string> {
    return this.once("screenPasses", () => {
      const out = new Map<number, string>();
      for (const a of ofKind(this.artifacts(), "profile")) {
        const { beat, pass, source } = a.meta;
        if (source !== "screen" || beat === undefined) continue;
        if (!out.has(beat) || out.get(beat)! < pass) out.set(beat, pass);
      }
      return out;
    });
  }
  screenPass(beat: number): string | undefined { return this.screenPasses().get(beat); }

  /** Each beat's structure profile from its latest screen pass, in beat order. */
  screenProfiles(): Profile[] {
    return ofKind(this.artifacts(), "profile")
      .filter((a) => a.meta.source === "screen" && this.screenPass(a.meta.beat!) === a.meta.pass)
      .map((a) => a.meta as unknown as Profile)
      .sort((a, b) => a.beat - b.beat);
  }

  /**
   * The screen flags of each beat's latest pass, with their gate decisions and
   * scores, by beat then score. A screen's denominator is the highest sample
   * number it recurred in, the same figure the panes print; a flag carries a
   * verdict like a check finding does, and its patch settles it.
   */
  screenFindings(): FindingView[] {
    return this.once("screenFindings", () => this.findingArtifacts()
      .filter((f) => f.source === "screen" && (this.screenPass(f.beat!) ?? f.pass) === f.pass)
      .map((f) => { const samples_run = Math.max(f.n, ...f.samples); return { ...f, ...this.decision(f.id), samples_run, score: score(f, samples_run), reported: true }; })
      .sort((a, b) => a.beat! - b.beat! || b.score - a.score));
  }

  /** The latest slop report, or null. */
  slop(): SlopReport | null { const a = this.latest("slop"); return a ? (JSON.parse(a.content) as SlopReport) : null; }
  /** The latest listenability report, or null. */
  listen(): ListenReport | null { const a = this.latest("listen"); return a ? (JSON.parse(a.content) as ListenReport) : null; }

  /** The auto repair run recorded on this brief, or null. */
  auto(): AutoResult | null { const a = this.latest("auto"); return a ? (JSON.parse(a.content) as AutoResult) : null; }
  /** The draw this chain was read from. */
  get draw(): DrawRow { return this.row(this.drawId); }

  findingArtifacts(id: string = this.drawId): (FindingMeta & { artifact_id: string })[] {
    return ofKind(this.artifacts(id), "finding").map((a) => ({ ...a.meta, artifact_id: a.id }));
  }

  /** The distinct check pass ids on the draw, oldest first. */
  passes(): string[] {
    return this.once("passes", () => {
      const ids = this.artifacts()
        // a draft started without a check extracts a ledger of its own; that is not a pass
        .filter((a) => a.kind === "pass" || (a.kind === "ledger" && !a.meta.ledger_only) || ((a.kind === "finding" || a.kind === "profile") && a.meta.source === "check"))
        .map((a) => a.meta.pass as string).filter(Boolean);
      return [...new Set(ids)].sort();
    });
  }

  /** The latest check pass id, or null when none has run. Pass ids sort as strings in time order. */
  pass(): string | null { return this.passes().at(-1) ?? null; }

  /**
   * How many samples each checker ran in the latest pass, as the pass recorded
   * them rather than as the configuration says, so the score reflects what
   * actually happened. Claims run once per claim, not S times.
   */
  samples(): Record<string, number> {
    return this.once("samples", () => {
      const pass = this.pass();
      const recorded = ofKind(this.artifacts(), "pass").find((a) => a.content === pass && a.meta.samples);
      if (recorded) return { claims: 1, ...recorded.meta.samples };
      // a pass stored before the counts were recorded: the steps averaged over every pass
      const passes = Math.max(1, this.passes().length);
      const out: Record<string, number> = { claims: 1 };
      for (const s of this.steps().filter((s) => s.status === "done" && /^check-/.test(s.stage))) {
        const checker = s.stage.replace(/^check-/, "");
        if (checker.startsWith("claims") || checker === "verify") continue;
        out[checker] = (out[checker] ?? 0) + 1;
      }
      for (const k of Object.keys(out)) if (k !== "claims") out[k] = Math.max(1, Math.round(out[k] / passes));
      return out;
    });
  }

  /**
   * Every replacement accepted anywhere in this repair chain, oldest round
   * first. A dismissal was already remembered for ever; an accepted fix was
   * remembered for one round, so a later round was free to contradict it and the
   * checker was free to flag the fix as the defect. Measured at 35% of findings
   * over an eight-round chain.
   */
  settled(): Settled[] {
    return this.once("settled", () => {
      const out: Settled[] = [];
      [...this.ids].reverse().forEach((draw, i) => {
        for (const f of this.findingArtifacts(draw)) {
          if (f.source !== "check" || this.decision(f.id).decision !== "accepted") continue;
          if (!f.replacement.trim() || f.replacement.trim().toLowerCase() === "none") continue;
          if (out.some((o) => same(o, f))) continue;
          out.push({ finding: f.id, draw, round: i + 1, replacement: f.replacement, span: f.span, statement: f.statement });
        }
      });
      return out;
    });
  }

  /** Findings dismissed on this draw or any brief it repairs; a re-check does not raise them again. */
  dismissed(): { span: string; statement: string }[] {
    return this.once("dismissed", () => {
      const out: { span: string; statement: string }[] = [];
      for (const id of this.ids) {
        for (const f of this.findingArtifacts(id)) if (f.source === "check" && this.decision(f.id).decision === "dismissed") out.push({ span: f.span, statement: f.statement });
      }
      return out;
    });
  }

  /** A draw's ledgers, oldest pass first. */
  private ledgers(id: string): Artifact[] {
    return ofKind(this.artifacts(id), "ledger").sort((a, b) => a.meta.pass.localeCompare(b.meta.pass));
  }

  /**
   * The ledger this brief is held to: the one extracted at the root of the
   * repair chain, plus the replacements accepted since, in order.
   *
   * Re-extracting it every round was the reason a chain never converged. Over an
   * eight-round chain not one ledger line survived from one round to the next,
   * and the categories changed wholesale, so each round measured the brief
   * against a standard it had just invented. Pinned, the standard moves only
   * when Chris accepts a finding, and the amendment says so.
   *
   * An amendment overrides the base line it overturns; the base line is not
   * struck. On the pit chain the base said the copy of down points at the pit
   * and round 1 settled that it points at the person, and the checker held the
   * prose to both. The header now says which one holds.
   */
  ledger(): string | null {
    return this.once("ledger", () => {
      // the oldest brief of the chain that has one, and its first: the contract before any amendment
      const base = [...this.ids].reverse().map((id) => this.ledgers(id)[0]?.content).find(Boolean) ?? null;
      return base === null ? null : amended(base, this.settled());
    });
  }

  /**
   * The outline a check holds the prose to: the chain root's, with the fixes
   * accepted since appended the way the pinned ledger carries them. A repair
   * re-edits the outline every round, and what it adds there is not the
   * author's: on the pit chain it wrote "a single reading with no earlier survey
   * to compare against", and the next round rewrote the author's line about last
   * year's survey to match.
   */
  outline(): string {
    return this.once("outline", () => amended([...this.artifacts(this.root)].reverse().find((a) => a.kind === "outline")?.content ?? "", this.settled()));
  }

  /**
   * The profile each profile-only checker produced anywhere in this repair chain,
   * newest first. Structure and resemblance describe the premise, not the text a
   * repair rewrites, so their answers do not move between rounds. Running them
   * every round was about 5% of a chain's input tokens for an unchanging answer.
   */
  profile(checker: string): { pass: string; draw: string; meta: any } | null {
    return this.once(`profile:${checker}`, () => {
      for (const id of this.ids) {
        const hit = ofKind(this.artifacts(id), "profile")
          .map((a) => ({ draw: id, meta: a.meta as any }))
          .filter((x) => x.meta.source === "check" && x.meta.checker === checker)
          .sort((a, b) => String(a.meta.pass).localeCompare(String(b.meta.pass)));
        if (hit.length) { const last = hit.at(-1)!; return { pass: String(last.meta.pass), draw: last.draw, meta: last.meta }; }
      }
      return null;
    });
  }

  /**
   * Every claim verified anywhere in this repair chain under the same authority.
   * A lore setting's distillate does not change between rounds, so a claim's
   * verdict cannot either, and re-verifying it is the largest single slice of a
   * round's cost: one call per extracted claim, twelve on a typical brief.
   */
  claims(authority: string): CachedClaim[] {
    return this.once(`claims:${authority}`, () => {
      const out: CachedClaim[] = [];
      for (const id of this.ids) {
        for (const a of ofKind(this.artifacts(id), "claim")) {
          const m = a.meta;
          if (m.authority !== authority || !m.result) continue;
          if (out.some((o) => normalise(o.statement) === normalise(a.content))) continue;
          out.push({ statement: a.content, span: m.span ?? "", result: m.result, evidence: m.evidence ?? "none", invalidates: m.invalidates ?? "none", replacement: m.replacement ?? "", patch: m.patch ?? "", draw: id });
        }
      }
      return out;
    });
  }

  /** The texts a finding's quotes are scored against. Undefined when the draw has no brief yet. */
  scoreContext(): ScoreContext | undefined {
    return this.once("scoreContext", () => {
      try {
        const b = briefParts(this.p, this.drawId);
        return { prose: prose(b), outline: this.outline(), ledger: this.ledger() ?? "" };
      } catch { return undefined; }
    });
  }

  /** The sample count a merged cluster is scored against: the largest of its checkers'. */
  private samplesAgainst(f: { checkers: string[] }): number {
    const per = this.samples();
    return Math.max(1, ...f.checkers.map((c) => per[c] ?? 1));
  }

  /**
   * The settled fix a finding re-opens, or undefined. The test is whether this
   * is the same defect as one already accepted — the existing cluster rule, on
   * span and statement — not whether it quotes the replacement text. The repair
   * paraphrases its constraints, so matching against the replacement decays from
   * 31% of findings at 0.5 overlap to 9% at 0.7 and answers nothing.
   */
  relitigated(f: { span: string; statement: string }): Settled | undefined {
    return this.settled().find((sc) => same(f, sc));
  }

  withScore(f: FindingMeta & { artifact_id: string }, reported: boolean): FindingView {
    const samples_run = this.samplesAgainst(f);
    const re = this.relitigated(f);
    return { ...f, ...this.decision(f.id), score: score(f, samples_run, this.scoreContext()), samples_run, reported, relitigates: re };
  }

  /** The reported check findings of the latest pass, with their gate decisions and scores, highest score first. */
  reported(): FindingView[] {
    return this.once("reported", () => {
      const pass = this.pass();
      if (!pass) return [];
      return this.findingArtifacts().filter((f) => f.source === "check" && f.pass === pass)
        .map((f) => this.withScore(f, !f.sub_threshold))
        .sort((a, b) => b.score - a.score);
    });
  }

  /**
   * The clusters the latest pass found but did not report, because they recurred
   * in fewer than keep_if samples. They are reconstructed from each checker
   * step's parsed findings, so no call is made and every past pass can be read
   * this way. A cluster overlapping a reported or dismissed finding is dropped.
   */
  subThreshold(): FindingView[] {
    return this.once("subThreshold", () => {
      const pass = this.pass();
      if (!pass) return [];
      const per = this.samples();
      const reported = this.reported();
      const perChecker: Cluster[] = [];
      const stages = [...new Set(this.steps().filter((s) => /^check-/.test(s.stage)).map((s) => s.stage))];
      for (const stage of stages) {
        const checker = stage.replace(/^check-/, "");
        if (checker.startsWith("claims") || !per[checker]) continue;
        // the latest pass ran the last `samples` steps of this stage
        const steps = this.steps().filter((s) => s.stage === stage && s.status === "done" && s.parsed).slice(-per[checker]);
        const findings: Finding[] = [];
        steps.forEach((step, i) => {
          const parsed = JSON.parse(step.parsed!) as { findings?: Finding[] };
          for (const f of parsed.findings ?? []) if (f?.span) findings.push({ ...f, checker, sample: i + 1 });
        });
        if (findings.length) perChecker.push(...cluster(findings, 1, this.drawId));
      }
      // the same span from two checkers is one finding, as it is above the bar
      const hidden = excludeDismissed(merge(perChecker).filter((c) => !reported.some((r) => same(r, c))), this.dismissed());
      return hidden.map((c) => {
        const { reported: _r, ...meta } = c;
        return this.withScore({ ...meta, pass, source: "check", artifact_id: "" }, false);
      }).sort((a, b) => b.score - a.score);
    });
  }

  /** Every finding the gate can act on: the reported ones, and the sub-threshold ones when asked for. */
  findings(all = false): FindingView[] {
    return all ? [...this.reported(), ...this.subThreshold()].sort((a, b) => b.score - a.score) : this.reported();
  }

  /** Model calls spent on this repair chain, so a run cannot cost more than it is worth. */
  calls(): number {
    return this.ids.reduce((n, id) => n + this.steps(id).filter((s) => !NO_CALL.includes(s.model)).length, 0);
  }

  /**
   * The line every findings view carries when judge and generator share a
   * family, or null when at least one check ran on another family.
   */
  judge(): string | null {
    return this.once("judge", () => {
      const steps = this.steps().filter((s) => s.status === "done" && !NO_CALL.includes(s.model));
      const gen = new Set(steps.filter((s) => !/^(check|screen)-/.test(s.stage)).map((s) => family(s.model)));
      const judges = steps.filter((s) => /^(check|screen)-/.test(s.stage)).map((s) => family(s.model));
      if (!judges.length) return null;
      let genFamilies = gen;
      // a fully patched round makes no generation call of its own: the nearest brief up the chain that did sets the family
      for (const id of this.ids.slice(1)) {
        if (genFamilies.size) break;
        genFamilies = new Set(this.steps(id).filter((s) => s.status === "done" && !/^(check|screen)-/.test(s.stage) && !NO_CALL.includes(s.model)).map((s) => family(s.model)));
      }
      return judges.every((j) => genFamilies.has(j)) ? `checked on ${[...new Set(judges)].join(", ")}; judge and generator share a family` : null;
    });
  }
}

/** Read a repair chain from one of its draws. Each answer is computed once. */
export const chainOf = (p: Pipeline, drawId: string, rows?: Map<string, DrawRow>) => new Chain(p, drawId, rows);
