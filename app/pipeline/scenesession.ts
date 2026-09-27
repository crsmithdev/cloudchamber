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
import { need, tag, tags, words, type SessionAsk } from "./model.ts";
import { RUN } from "./config.ts";
import { samplesFor } from "./draftconfig.ts";
import { clusterSamples, runSamples, voteAnswers } from "./sampled.ts";
import { findingId, parseFindings } from "./recur.ts";
import { applyPatches } from "./repair.ts";
import { record } from "./verdicts.ts";
import { eligiblePassages } from "./bank.ts";
import { loadLexicon, restated, slopScreen } from "./slop.ts";
import { atFault, listenScreen, loadNarrationPool, type Fault } from "./listen.ts";
import { parseQuestions, screenClaims } from "./check.ts";
import {
  FAULT_LINE, flagsOf, sceneContext, scenePrompt, structureScreen,
  type Beat, type Schedule, type Scene,
} from "./write.ts";

/** The fewest binds a base session pays for: the base costs about what four forks save (bindBase). */
const BASE_MIN_BINDS = 5;

/** A beat written again under a constraints block, marked as a rewrite, with the flag it answers when there is one. */
type Rewrite = { beat: number; kind: "rewrite"; constraints?: string; finding?: string };
/** A beat whose faulted sentences are swapped in place under the listen lines. */
type Edit = { beat: number; kind: "edit"; faults: Fault[] };
/** One change `revise` makes to a stored beat. The caller chooses the kind. */
export type Change = Rewrite | Edit;

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
  async write(b: Beat, soFar: string[], opts: { constraints?: string; rewrite?: { finding?: string }; session?: SessionAsk } = {}): Promise<Scene & { session?: string }> {
    const prompt = scenePrompt(this.parts, this.schedule, b, soFar, opts.constraints, this.cfg.structure);
    const { step, value, session } = await this.p.invoke(this.drawId, this.parent, "scene", prompt, (t) => need(t, "scene"), { context: this.context, session: opts.session });
    const n = words(value);
    const artifact_id = this.p.artifact(step, "scene", value, {
      beat: b.n, words: n, cap: b.words,
      warnings: n > b.words * (1 + RUN.sceneCapSlack) ? ["over_cap"] : [],
      ...(opts.rewrite ? { rewrite: true, ...(opts.rewrite.finding ? { rewrite_finding: opts.rewrite.finding } : {}) } : {}),
    });
    return { beat: b.n, text: value, artifact_id, step_id: step.id, ...(session ? { session } : {}) };
  }

  /**
   * Every beat from `from` on, written and bound; a sequential beat reads the
   * unbound text of the beats before it, then all beats bind at once. The beats
   * under `from` are the scenes this draw already stores, which a branch copied,
   * and they come back with the rest so the caller sees the whole story.
   *
   * The sequential beats are turns of one session: each forks the one before,
   * so the story so far is the session's history and is read from the cache,
   * not sent again in the ask (model.ts). Only the first beat carries the
   * stored scenes under `from` in its ask.
   */
  async all(from = 1): Promise<Scene[]> {
    const done = from > 1 ? this.scenes().filter((x) => x.beat < from) : [];
    const todo = this.schedule.beats.filter((b) => b.n >= from);
    if (this.cfg.scenes.order === "parallel") {
      const raw = await Promise.all(todo.map((b) => this.write(b, [])));
      const base = await this.bindBase([...done, ...raw], raw.length);
      return [...done, ...await Promise.all(raw.map((sc, i) => this.bind(sc, i ? raw[i - 1] : done.at(-1), base)))];
    }
    const raw: Scene[] = [];
    let session: string | undefined;
    for (const b of todo) {
      const { session: next, ...scene } = await this.write(b, session ? [] : done.map((x) => x.text), { session: session ? { resume: session } : {} });
      raw.push(scene);
      session = next;
    }
    const base = await this.bindBase([...done, ...raw], raw.length);
    return [...done, ...await Promise.all(raw.map((sc, i) => this.bind(sc, i ? raw[i - 1] : done.at(-1), base)))];
  }

  /**
   * A session that holds the ledger and every scene, for `binding` binds to
   * fork, so each bind reads the ledger and the scenes from the cache and sends
   * only its ask. The base writes the whole draft to the cache once, about
   * four binds' saving, so fewer binds than BASE_MIN_BINDS run fresh.
   */
  async bindBase(scenes: Scene[], binding: number): Promise<string | undefined> {
    if (!this.cfg.screens.enabled.includes("ledger") || binding < BASE_MIN_BINDS) return undefined;
    const prompt = fill("screenLedgerBase", { ledger: this.ledger, scenes: scenes.map((x) => `<scene n="${x.beat}">\n${x.text}\n</scene>`).join("\n\n") });
    const { session } = await this.p.invoke(this.drawId, scenes[0].step_id, "screen-ledger", prompt, (t) => t, { session: {} });
    return session;
  }

  /**
   * The listen screen's lines, applied in place: only the sentences a line
   * faults go to the model, and each comes back as a word-for-word swap, as a
   * bind's patch does. A swap whose sentence is not in the scene is left out.
   * Of 165 rewrites on 19-26 Sep, 80 were for length or numerals alone, and a
   * rewrite changes 45-80% of a scene.
   */
  async edit(scene: Scene, faults: Fault[]): Promise<Scene> {
    const sentences = atFault(scene.text, faults);
    const lines = faults.map((f) => FAULT_LINE[f]);
    if (!sentences.length) return scene;
    const prompt = fill("sceneEdit", { scene: scene.text, sentences: sentences.map((x) => `<sentence>${x}</sentence>`).join("\n"), lines: lines.join(" "), cap: String(Math.max(200, words(sentences.join(" ")) * 2)) });
    const { step, value: edits } = await this.p.invoke(this.drawId, scene.step_id, "scene-edit", prompt, (t) =>
      tags(t, "edit").map((e) => ({ from: tag(e, "from") ?? "", to: tag(e, "to") ?? "" })).filter((e) => e.from && e.to));
    let text = scene.text;
    for (const e of edits) if (text.split(e.from).length === 2) text = text.replace(e.from, () => e.to);
    if (text === scene.text) return scene;
    const { rewrite: _rw, rewrite_finding: _rf, ...meta } = chainOf(this.p, this.drawId).artifact(scene.artifact_id)!.meta as SceneMeta;
    const artifact_id = this.p.artifact(step, "scene", text, { ...meta, words: words(text), edited: lines });
    return { beat: scene.beat, text, artifact_id, step_id: step.id };
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
  async bind(scene: Scene, prev: Scene | undefined, base?: string): Promise<Scene> {
    if (!this.cfg.screens.enabled.includes("ledger")) return scene;
    const k = scene.beat;
    const { samples: n, keep_if } = samplesFor(this.cfg.screens, "ledger");
    const ask = fill("screenLedgerAsk", {});
    const prompt = base
      ? fill("screenLedgerFork", { n: String(k), previous: prev ? `, and the previous scene is <scene n="${prev.beat}">` : "", ask })
      : fill("screenLedger", { ledger: this.ledger, previous: prev ? `<previous-scene>\n${prev.text}\n</previous-scene>\n\n` : "", n: String(k), scene: scene.text, ask });
    const rs = await runSamples(this.p, {
      draw: this.drawId, parent: scene.step_id, stage: "screen-ledger", prompt, samples: n, ...(base ? { session: { resume: base } } : {}),
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

  /**
   * Change stored beats and hold the story to the ledger again. Edits go first,
   * in place; then rewrites in beat order, each from the text before it as it
   * now stands. A rewrite or a numeral edit can change a fact, so that beat is
   * bound to the one before it, and the beat after it, which read the old text,
   * is bound to the new one unless it changed too. A split sentence changes no
   * fact and binds nothing. All binds run at once, then the screens: every
   * screen over a rewrite and the neighbour it rebinds, the deterministic ones
   * over an edit and its neighbour, since a split or a rounded figure moves no
   * structure answer. The claims screen is the caller's.
   */
  async revise(changes: Change[]): Promise<void> {
    const M = this.schedule.beats.length;
    const facts = new Set<number>(), local = new Set<number>(), full = new Set<number>();

    await Promise.all(changes.filter((c): c is Edit => c.kind === "edit").map(async (c) => {
      const scene = this.scenes().find((s) => s.beat === c.beat)!;
      if (await this.edit(scene, c.faults) === scene) return;
      local.add(c.beat);
      if (c.faults.includes("numerals")) facts.add(c.beat);
    }));
    for (const c of changes.filter((c): c is Rewrite => c.kind === "rewrite").sort((a, b) => a.beat - b.beat)) {
      const before = this.scenes().filter((s) => s.beat < c.beat).map((s) => s.text);
      await this.write(this.schedule.beats[c.beat - 1], this.cfg.scenes.order === "sequential" ? before : [], { constraints: c.constraints, rewrite: { finding: c.finding } });
      facts.add(c.beat);
      full.add(c.beat);
    }

    const scenes = this.scenes();
    const at = (k: number) => scenes.find((s) => s.beat === k);
    const binding = new Map<number, Scene | undefined>();
    for (const k of facts) {
      binding.set(k, at(k - 1));
      if (k < M && !facts.has(k + 1)) {
        binding.set(k + 1, at(k));
        (full.has(k) ? full : local).add(k + 1);
      }
    }
    const base = await this.bindBase(scenes, binding.size);
    await Promise.all([...binding].map(([k, prev]) => this.bind(at(k)!, prev, base)));

    const beats = [...new Set([...full, ...local])].sort((a, b) => a - b);
    if (beats.length) await this.screen(this.scenes(), beats, { claims: false, structure: [...full] });
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

  /** Every enabled screen over `scenes`; `beats` narrows the per-beat ones after a rewrite, and `structure` narrows the structure screen further. */
  async screen(scenes: Scene[], beats: number[] = scenes.map((x) => x.beat), opts: { claims?: boolean; structure?: number[] } = {}): Promise<void> {
    const { enabled } = this.cfg.screens;
    const s = this.schedule;
    const M = s.beats.length;

    if (enabled.includes("structure")) await Promise.all((opts.structure ?? beats).map(async (k) => {
      const scene = scenes.find((x) => x.beat === k)!;
      const { samples: n, keep_if } = samplesFor(this.cfg.screens, "structure");
      const { prompt, names } = structureScreen(s, k, scene.text, this.cfg.structure.template);
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
