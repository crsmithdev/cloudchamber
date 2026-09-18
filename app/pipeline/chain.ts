/**
 * A repair chain read once. Every question the gate, the checkers and the
 * repair ask about a chain — the latest check pass, the samples it ran, the
 * fixes settled in earlier rounds, the pinned ledger and outline, the profiles,
 * the claims, the findings and their scores — is answered from one load of that
 * chain's draws, steps, artifacts and finding verdicts.
 *
 * Read it through `chainOf(p, drawId)` and ask the chain, rather than calling a
 * function per question: each answer is computed once per chain, so a findings
 * view of an eight-round chain loads what it needs once instead of a hundred
 * times.
 */
import { RUN } from "./config.ts";
import type { DrawRow, Pipeline, StepRow } from "./draw.ts";
import { latestAll, type Latest } from "./verdicts.ts";
import { cluster, excludeDismissed, merge, normalise, same, score, type Cluster, type Finding, type ScoreContext } from "./recur.ts";
import { briefParts, type Artifact } from "./briefparts.ts";

/** `dropped` is the verify pass's reason for taking a finding off the reported list; it rides on the artifact's meta. */
export type FindingMeta = Omit<Cluster, "reported"> & { pass: string; source: "check" | "screen"; screen?: string; beat?: number; sub_threshold?: boolean; dropped?: string };
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
  private rows = new Map<string, DrawRow>();
  private arts = new Map<string, Artifact[]>();
  private stepRows = new Map<string, StepRow[]>();
  private verdicts: Map<string, Latest> | null = null;
  private memo = new Map<string, unknown>();

  constructor(private p: Pipeline, readonly drawId: string) {
    const ids: string[] = [];
    for (let id: string | null = drawId; id && !ids.includes(id); id = this.row(id).repaired_from) ids.push(id);
    this.ids = ids;
  }

  private once<T>(key: string, f: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, f());
    return this.memo.get(key) as T;
  }
  row(id: string): DrawRow {
    if (!this.rows.has(id)) this.rows.set(id, this.p.draw(id));
    return this.rows.get(id)!;
  }
  artifacts(id: string = this.drawId): Artifact[] {
    if (!this.arts.has(id)) this.arts.set(id, this.p.artifacts(id));
    return this.arts.get(id)!;
  }
  steps(id: string = this.drawId): StepRow[] {
    if (!this.stepRows.has(id)) this.stepRows.set(id, this.p.steps(id));
    return this.stepRows.get(id)!;
  }
  /** The gate decision on a finding: every finding verdict is read in one query. */
  decision(findingId: string): { decision: "accepted" | "dismissed" | "open"; note: string } {
    this.verdicts ??= latestAll(this.p.db, "finding");
    const l = this.verdicts.get(findingId);
    return l ? { decision: l.verdict === "keep" ? "accepted" : "dismissed", note: l.note } : { decision: "open", note: "" };
  }

  /** The first draw of the chain. */
  get root(): string { return this.ids.at(-1)!; }
  /** The draw this chain was read from. */
  get draw(): DrawRow { return this.row(this.drawId); }

  findingArtifacts(id: string = this.drawId): (FindingMeta & { artifact_id: string })[] {
    return this.artifacts(id).filter((a) => a.kind === "finding").map((a) => ({ ...(JSON.parse(a.meta) as FindingMeta), artifact_id: a.id }));
  }

  /** The distinct check pass ids on the draw, oldest first. */
  passes(): string[] {
    return this.once("passes", () => {
      const ids = this.artifacts()
        .filter((a) => a.kind === "pass" || a.kind === "ledger" || ((a.kind === "finding" || a.kind === "profile") && JSON.parse(a.meta).source === "check"))
        .map((a) => JSON.parse(a.meta).pass as string).filter(Boolean);
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
      const recorded = this.artifacts().find((a) => a.kind === "pass" && a.content === pass && JSON.parse(a.meta).samples);
      if (recorded) return { claims: 1, ...(JSON.parse(recorded.meta).samples as Record<string, number>) };
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
    return this.artifacts(id).filter((a) => a.kind === "ledger").sort((a, b) => (JSON.parse(a.meta).pass as string).localeCompare(JSON.parse(b.meta).pass));
  }
  /** The first ledger extracted on a draw: the contract, before any amendment. */
  firstLedger(id: string = this.drawId): string | null { return this.ledgers(id)[0]?.content ?? null; }
  /** The ledger the latest check extracted on a draw, or null. */
  latestLedger(id: string = this.drawId): string | null { return this.ledgers(id).at(-1)?.content ?? null; }

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
      const base = this.firstLedger(this.root) ?? this.latestLedger();
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
        const hit = this.artifacts(id).filter((a) => a.kind === "profile")
          .map((a) => ({ draw: id, meta: JSON.parse(a.meta) as any }))
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
        for (const a of this.artifacts(id).filter((x) => x.kind === "claim")) {
          const m = JSON.parse(a.meta) as { span?: string; result?: string; evidence?: string; authority?: string; invalidates?: string; replacement?: string; patch?: string };
          if (m.authority !== authority || !m.result) continue;
          if (out.some((o) => normalise(o.statement) === normalise(a.content))) continue;
          out.push({ statement: a.content, span: m.span ?? "", result: m.result, evidence: m.evidence ?? "none", invalidates: m.invalidates ?? "none", replacement: m.replacement ?? "", patch: m.patch ?? "", draw: id });
        }
      }
      return out;
    });
  }

  /** The setting jobs of the draw's outline, for the score's severity term. Empty when the draw has no brief yet. */
  settingJobs(): string[] {
    return this.once("settingJobs", () => {
      const outline = [...this.artifacts()].reverse().find((a) => a.kind === "outline");
      const jobs = (outline ? (JSON.parse(outline.meta).jobs as string[] | undefined) : undefined) ?? [];
      return jobs.filter((j) => !(RUN.coreJobs as readonly string[]).includes(j));
    });
  }

  /** The texts a finding's quotes are scored against. Undefined when the draw has no brief yet. */
  scoreContext(): ScoreContext | undefined {
    return this.once("scoreContext", () => {
      try {
        const b = briefParts(this.p, this.drawId);
        return { prose: [b.vignette, ...b.contexts, b.ending].join("\n\n"), outline: this.outline(), ledger: this.ledger() ?? "" };
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
    return { ...f, ...this.decision(f.id), score: score(f, samples_run, this.settingJobs(), this.scoreContext()), samples_run, reported, ...(re ? { relitigates: re } : {}) };
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
      const jobs = this.settingJobs();
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
        if (findings.length) perChecker.push(...cluster(findings, 1, jobs, this.drawId));
      }
      // the same span from two checkers is one finding, as it is above the bar
      const hidden = excludeDismissed(merge(perChecker, jobs).filter((c) => !reported.some((r) => same(r, c))), this.dismissed());
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
      if (!genFamilies.size) {
        // a repaired draw's generation may be copied; look at the brief it repairs
        const from = this.draw.repaired_from;
        if (from) genFamilies = new Set(this.steps(from).filter((s) => s.status === "done" && !/^(check|screen)-/.test(s.stage) && s.model !== "copied").map((s) => family(s.model)));
      }
      return judges.every((j) => genFamilies.has(j)) ? `checked on ${[...new Set(judges)].join(", ")}; judge and generator share a family` : null;
    });
  }
}

/** Read a repair chain from one of its draws. Each answer is computed once. */
export const chainOf = (p: Pipeline, drawId: string) => new Chain(p, drawId);
