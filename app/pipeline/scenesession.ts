/**
 * The calls that write and screen one draft's scenes.
 *
 * Every scene ask carries the same fixed block — the examples, the outline, the
 * ledger and the schedule — in the system prompt, where the CLI caches it
 * (ADR-0010). A hit needs that block to match word for word, and it is 22.5k
 * tokens, so a miss costs about $0.22 a call. Before this module two call sites
 * assembled the block's inputs separately, the draft path from what it had in
 * hand and the repair path from the chain, and nothing held them to the same
 * answer.
 *
 * A session builds the block once, in its constructor, and is the only thing
 * that calls `sceneContext`. A caller says which beat to write; it cannot say
 * what context to write it against.
 */
import type { Pipeline, StepRow } from "./draw.ts";
import type { BriefParts } from "./briefparts.ts";
import type { DraftConfig } from "./draftconfig.ts";
import type { SceneMeta } from "./artifacts.ts";
import { briefParts } from "./briefparts.ts";
import { chainOf } from "./chain.ts";
import { fill } from "./prompts.ts";
import { need, tag, words } from "./model.ts";
import { RUN } from "./config.ts";
import { samplesFor } from "./draftconfig.ts";
import { clusterSamples, runSamples, voteAnswers } from "./sampled.ts";
import { findingId, parseFindings } from "./recur.ts";
import { applyPatches } from "./repair.ts";
import { record } from "./verdicts.ts";
import { eligiblePassages } from "./bank.ts";
import { loadLexicon, restated, slopScreen } from "./slop.ts";
import { listenScreen, loadNarrationPool } from "./listen.ts";
import { parseQuestions, screenClaims } from "./check.ts";
import {
  flagsOf, movedIn, sceneContext, scenePrompt, structurePrompt, structureQuestions,
  type Beat, type Schedule, type Scene,
} from "./write.ts";

/** Where the deterministic screens read their pools from; a test points them at fixtures. */
export type ScreenPaths = { lexiconPath?: string; narrationDir?: string };

/** What a draft fixes once. `parent` is the schedule step every scene hangs from. */
export type SceneSessionInit = {
  p: Pipeline;
  drawId: string;
  parent: string;
  parts: BriefParts;
  ledger: string;
  schedule: Schedule;
  cfg: DraftConfig;
  pass: string;
  paths?: ScreenPaths;
};

export class SceneSession {
  /** The cached system prompt, built once. Nothing else in the pipeline calls `sceneContext`. */
  readonly context: string;
  readonly p: Pipeline;
  readonly drawId: string;
  readonly schedule: Schedule;
  readonly cfg: DraftConfig;
  readonly pass: string;
  private parent: string;
  private parts: BriefParts;
  private ledger: string;
  private paths: ScreenPaths;

  constructor(init: SceneSessionInit) {
    this.p = init.p;
    this.drawId = init.drawId;
    this.parent = init.parent;
    this.parts = init.parts;
    this.ledger = init.ledger;
    this.schedule = init.schedule;
    this.cfg = init.cfg;
    this.pass = init.pass;
    this.paths = init.paths ?? {};
    this.context = sceneContext(init.parts, init.ledger, init.schedule);
  }

  /**
   * A session over a draw that is already drafted, for a gate-2 rewrite. It
   * resolves the brief, the pinned ledger and the schedule from the chain, so a
   * repair writes against the same block the first draft did.
   */
  static resume(p: Pipeline, drawId: string, cfg: DraftConfig, pass: string, paths?: ScreenPaths): SceneSession {
    const chain = chainOf(p, drawId);
    const schedule = chain.schedule()!;
    const parent = p.steps(drawId).find((s) => s.stage === "schedule" && s.status === "done")!.id;
    // the pinned one: a repaired draw carries no ledger of its own, the chain root holds it
    return new SceneSession({ p, drawId, parent, parts: briefParts(p, drawId), ledger: chain.ledger() ?? "", schedule, cfg, pass, paths });
  }

  /** The scenes this draw has stored, newest artifact per beat. */
  scenes(): Scene[] {
    return chainOf(this.p, this.drawId).scenes();
  }

  // --- writing ----------------------------------------------------------------

  /** One beat. `rewrite` marks a gate-2 rewrite, with the flag it answers when there is one. */
  async write(b: Beat, soFar: string[], opts: { constraints?: string; rewrite?: { finding?: string } } = {}): Promise<Scene> {
    const prompt = scenePrompt(this.parts, this.schedule, b, soFar, opts.constraints, this.cfg.structure);
    const { step, value } = await this.p.invoke(this.drawId, this.parent, "scene", prompt, (t) => need(t, "scene"), { context: this.context });
    const n = words(value);
    const artifact_id = this.p.artifact(step, "scene", value, {
      beat: b.n, words: n, cap: b.words,
      warnings: n > b.words * (1 + RUN.sceneCapSlack) ? ["over_cap"] : [],
      ...(opts.rewrite ? { rewrite: true, ...(opts.rewrite.finding ? { rewrite_finding: opts.rewrite.finding } : {}) } : {}),
    });
    return { beat: b.n, text: value, artifact_id, step_id: step.id };
  }

  /**
   * Every beat from `from` on, written and bound; a sequential beat reads the
   * corrected text of the beats before it. The beats under `from` are the
   * scenes this draw already stores, which a branch copied, and they come back
   * with the rest so the caller sees the whole story.
   */
  async all(from = 1): Promise<Scene[]> {
    const done = from > 1 ? this.scenes().filter((x) => x.beat < from) : [];
    const todo = this.schedule.beats.filter((b) => b.n >= from);
    if (this.cfg.scenes.order === "parallel") {
      const raw = await Promise.all(todo.map((b) => this.write(b, [])));
      return [...done, ...await Promise.all(raw.map((sc, i) => this.bind(sc, i ? raw[i - 1] : done.at(-1))))];
    }
    const out = [...done];
    for (const b of todo) out.push(await this.bind(await this.write(b, out.map((x) => x.text)), out.at(-1)));
    return out;
  }

  /**
   * Hold one scene to the ledger: screen it against the ledger and the scene
   * before it, store each flag, and put every flag's own patch into the scene
   * word for word. The scene that comes back is the one the next beat reads and
   * the one gate 2 shows. On two drafts of one seed the scenes contradicted the
   * ledger they were given about three times a beat, and a beat written after a
   * contradiction inherited it through the story so far; a patch costs no call,
   * so the ledger binds where the scene is written rather than at the gate. A
   * flag whose fix needs more than its span stays open for `rewrite k`.
   */
  async bind(scene: Scene, prev: Scene | undefined): Promise<Scene> {
    if (!this.cfg.screens.enabled.includes("ledger")) return scene;
    const k = scene.beat;
    const { samples: n, keep_if } = samplesFor(this.cfg.screens, "ledger");
    const prompt = fill("screenLedger", { ledger: this.ledger, previous: prev ? `<previous-scene>\n${prev.text}\n</previous-scene>\n\n` : "", n: String(k), scene: scene.text });
    const rs = await runSamples(this.p, {
      draw: this.drawId, parent: scene.step_id, stage: "screen-ledger", prompt, samples: n,
      // the examined account is for the reader, not a condition of the answer: Sonnet 5 opens the tag and never closes it (run 9)
      parse: (t, sample) => ({ findings: parseFindings(t, "ledger", sample), examined: tag(t, "examined") ?? "" }),
    });
    const flags = clusterSamples(rs, (v) => v.findings, keep_if, `${this.drawId}/${k}`).filter((c) => c.reported);
    for (const c of flags) {
      const { reported: _r, ...meta } = c;
      this.p.artifact(rs[0].step, "finding", c.statement, { ...meta, invalidates: String(k), pass: this.pass, source: "screen", screen: "ledger", beat: k });
    }
    const out = applyPatches(scene.text, flags);
    if (!out.applied.length) return scene;
    // the scene keeps its beat and cap, not the gate-2 record of the scene it patches: a patch is not a rewrite
    const { rewrite: _rw, rewrite_finding: _rf, ...meta } = chainOf(this.p, this.drawId).artifact(scene.artifact_id)!.meta as SceneMeta;
    const step = this.p.recordStep(this.drawId, scene.step_id, "scene", "patched");
    const artifact_id = this.p.artifact(step, "scene", out.text, { ...meta, words: words(out.text), patched: out.applied.map((f) => f.id) });
    for (const f of out.applied) record(this.p.db, { kind: "finding", target_id: f.id, verdict: "keep", method: "draw", note: "patched as written" });
    return { beat: k, text: out.text, artifact_id, step_id: step.id };
  }

  // --- screens ----------------------------------------------------------------

  /** The claims a scene makes about its setting: the checkers read the brief, and a scene invents past it. */
  async screenClaims(scenes: Scene[] = this.scenes()): Promise<void> {
    const { enabled } = this.cfg.screens;
    if (enabled.includes("claims")) {
      const { setting } = this.p.loadDrawSetting(this.p.draw(this.drawId));
      if (setting?.claims) await screenClaims(this.p, this.drawId, scenes.map((x) => ({ beat: x.beat, text: x.text })), setting, this.pass, chainOf(this.p, this.drawId), scenes[0]?.step_id ?? null);
    }
  }

  /** Every enabled screen over `scenes`; `beats` narrows the per-beat ones after a rewrite. */
  async screen(scenes: Scene[], beats: number[] = scenes.map((x) => x.beat), opts: { claims?: boolean } = {}): Promise<void> {
    const { enabled } = this.cfg.screens;
    const s = this.schedule;
    const M = s.beats.length;
    // the beat the schedule marked as paying, else the shaped default: the cost lands before the last beat, which is the aftermath
    const marked = s.beats.find((b) => b.pays)?.n;
    const paidBeat = this.cfg.structure.template === "auto" || M < 2 ? M : marked ?? M - 1;

    if (enabled.includes("structure")) await Promise.all(beats.map(async (k) => {
      const scene = scenes.find((x) => x.beat === k)!, b = s.beats[k - 1];
      const { samples: n, keep_if } = samplesFor(this.cfg.screens, "structure");
      const prev = s.beats[k - 2];
      const names = structureQuestions(k === M, k === paidBeat, k === 1, movedIn(b, prev));
      const prompt = structurePrompt(b, scene.text, k === M, M, k === paidBeat, k === 1, prev);
      const rs = await runSamples(this.p, { draw: this.drawId, parent: scene.step_id, stage: "screen-structure", prompt, samples: n, parse: (t) => parseQuestions(t, names) });
      const answers = voteAnswers(rs, names, keep_if);
      const flags = flagsOf(answers, k === M);
      this.p.artifact(rs[0].step, "profile", JSON.stringify(answers), { pass: this.pass, source: "screen", screen: "structure", beat: k, answers, flags, samples: n });
    }));

    // a sentence the beat says again is a flag with a location and no patch: rewrite k takes it as a constraint
    for (const k of beats) {
      const scene = scenes.find((x) => x.beat === k)!;
      // the told shape replays its cold open whole in the arrival beat: a sentence beat 1 said is meant to be said again
      const hits = restated(scenes, k).filter((h) => !(this.cfg.structure.template === "told" && h.earlier_beat === 1));
      if (!hits.length) continue;
      const step = this.p.recordStep(this.drawId, scene.step_id, "screen-restated", "deterministic", hits);
      for (const h of hits) {
        const meta = { id: findingId("restated", h.span, `${this.drawId}/${k}`), checkers: ["restated"], samples: [1], n: 1, span: h.span, statement: `beat ${k} says again what beat ${h.earlier_beat} said`,
          result: `restates:${h.earlier}`, evidence: h.earlier, invalidates: String(k), replacement: `Beat ${k} does not repeat what beat ${h.earlier_beat} already says: "${h.earlier}"`, patch: "" };
        this.p.artifact(step, "finding", meta.statement, { ...meta, pass: this.pass, source: "screen", screen: "restated", beat: k });
      }
    }

    // the deterministic reports cover the whole draft as it stands, however few beats were re-screened: a rewrite changes the story-wide figures too
    if (enabled.includes("slop")) {
      const pool = this.cfg.screens.slop_baseline === "pool" ? eligiblePassages(this.p.db).map((x) => x.text).join("\n\n") : "";
      const report = slopScreen(scenes.map((x) => ({ beat: x.beat, text: x.text })), pool, loadLexicon(this.paths.lexiconPath));
      const step = this.p.recordStep(this.drawId, scenes[0]?.step_id ?? null, "screen-slop", "deterministic", report);
      this.p.artifact(step, "slop", JSON.stringify(report), { pass: this.pass, source: "screen", screen: "slop" });
    }

    // the claims a scene makes about its setting: the checkers read the brief, and a scene invents past it
    // over the re-screened beats only: an unchanged beat keeps its flags under its own pass, and a second copy would show twice
    if (opts.claims ?? true) await this.screenClaims(scenes.filter((x) => beats.includes(x.beat)));

    if (enabled.includes("listen")) {
      const report = listenScreen(scenes.map((x) => ({ beat: x.beat, text: x.text })), loadNarrationPool(this.paths.narrationDir));
      const step = this.p.recordStep(this.drawId, scenes[0]?.step_id ?? null, "screen-listen", "deterministic", report);
      this.p.artifact(step, "listen", JSON.stringify(report), { pass: this.pass, source: "screen", screen: "listen" });
    }
  }
}
