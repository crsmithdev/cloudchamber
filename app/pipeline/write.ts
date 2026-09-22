/**
 * Stages 3 to 5: schedule, scenes, screens. One call derives the beat sheet;
 * one fresh call writes each beat; each scene is screened against the ledger
 * as it is written and the screen's own patches go in before the next beat
 * reads it; every scene is then screened for a fixed list of structural tells,
 * each is screened for a sentence an earlier beat already said, and the joined
 * draft is run through the deterministic slop screen.
 */
import type { Pipeline, StepRow } from "./draw.ts";
import { fill, type TemplateName } from "./prompts.ts";
import { need, samples, tag, words } from "./model.ts";
import { RUN } from "./config.ts";
import { eligiblePassages } from "./bank.ts";
import { FORM_VALUES, samplesFor, type DraftConfig, type FormAxis } from "./draftconfig.ts";
import { cluster, findingId, parseFindings, type Finding } from "./recur.ts";
import { loadLexicon, restated, slopScreen } from "./slop.ts";
import { listenScreen, loadNarrationPool } from "./listen.ts";
import { parseQuestions, type Answer } from "./check.ts";
import type { BriefParts } from "./briefparts.ts";
import { applyPatches } from "./repair.ts";
import { record } from "./verdicts.ts";
import { chainOf } from "./chain.ts";

/** `until` is the beat that reveals the item; one past the last beat means the story never does. */
export type Withheld = { item: string; until: number };
export type Beat = { n: number; words: number; job: string; when: string; known: string; withheld: Withheld[]; stakes: string; set_piece: string; absorbs: string; pays: boolean };
export type Schedule = { form: Record<FormAxis, string>; beats: Beat[]; raw: string };
export type Scene = { beat: number; text: string; artifact_id: string; step_id: string };

export const ABSORBABLE = ["chosen", "context-1", "context-2", "ending"];
/** The schedule ask each shaped template adds; `auto` adds none. */
const SHAPE_TEMPLATE: Record<string, TemplateName> = { told: "scheduleTold", signal: "scheduleSignal", listen: "scheduleListen" };
/** The constraint a beat flagged bodily-emotion is rewritten under. */
export const BODY_LINE = "When a thing happens in this beat, the narrator says what the body did before saying what it meant: the chest, the hands, the breath, the stomach.";
/** The paying beat: the withheld thing comes in and does harm, and the loss happens on the page. Three outside judges put these two first, and every presence pass they gave the channel named a barrier or a thing that only stood there. */
export const PRESENCE_LINE = "In this beat the thing the story withholds is in the same place as a character with nothing between them, and it acts: it touches, moves, breaks or takes a person or a thing, on the page, at the time. It does not stand behind glass, in a doorway, or on a channel, and it does not only get looked at.";
export const COST_LINE = "In this beat the loss happens as it happens, on the page, in the moment, with the person who pays it present; the narrator does not report it afterward.";
export const TIME_LINE = "This beat happens at a different point in the story's chronology from the beat before it. Its opening places the listener in the new time, in its own words, before the beat's events begin.";
export const THEME_LINE = "No sentence in this beat says what the story means or what its lesson is; the events carry it, and nobody names it.";
export const WITHHELD_LINE = "What the schedule lists as withheld after this beat stays withheld: the beat may imply it and may not state it.";
export const WRONG_LINE = "The point-of-view character is allowed to be mistaken, unfair or at fault somewhere in this beat, and the beat lets it stand.";
export const RESOLVED_LINE = "This beat settles nothing the story still withholds: the questions it has raised are open at the end of the beat.";
export const OPEN_LINE = "The last beat leaves at least one question the story raised open; it does not close every one.";
/** Three outside judges gave the source people, momentum and the hook on the clean text (evals/20260920-clean-judge.md): a cast told apart by ear, one visible event a beat, and what is wrong said first. */
export const VOICES_LINE = "The people in this beat speak in quoted lines and are told apart by how they talk, as the schedule's cast says; no two sound alike, and no line could be moved from one mouth to another.";
export const EVENT_LINE = "Something happens in this beat that a second person present could see or hear: an act, an arrival, a breakage, a refusal said aloud. It is not thought, recollection or measurement alone.";
export const HOOK_LINE = "The first 150 words of this beat say what is wrong: the thing the story is about, or its first effect, named or shown before any routine, setting or history.";

/**
 * A screen rule is one row: the question, which answer is the flag, which
 * beats it is asked of, whether the flag sends the beat back for a register
 * rewrite on its own, and the line a rewrite carries. The prompt text is in
 * prompts.ts under the same names.
 */
export type ScreenRule = { name: string; flag: "present" | "absent"; asked: "every" | "first" | "not-last" | "last" | "paying" | "moved"; register?: boolean; line: string };
export const STRUCTURE_RULES: ScreenRule[] = [
  { name: "theme-stated", flag: "present", asked: "every", line: THEME_LINE },
  { name: "bodily-emotion", flag: "absent", asked: "every", register: true, line: BODY_LINE },
  { name: "withheld-revealed", flag: "present", asked: "every", line: WITHHELD_LINE },
  { name: "protagonist-never-wrong", flag: "present", asked: "every", line: WRONG_LINE },
  { name: "one-voice", flag: "present", asked: "every", register: true, line: VOICES_LINE },
  { name: "nothing-happens", flag: "present", asked: "every", register: true, line: EVENT_LINE },
  { name: "hook-late", flag: "present", asked: "first", register: true, line: HOOK_LINE },
  // asked only of a beat the schedule puts at a different time from the one before it: run 9 lost clarity on an unsignposted jump
  { name: "time-unplaced", flag: "present", asked: "moved", register: true, line: TIME_LINE },
  { name: "resolved", flag: "present", asked: "not-last", line: RESOLVED_LINE },
  { name: "resolves-everything", flag: "present", asked: "last", line: OPEN_LINE },
  // asked of the beat that pays: what a listener needs the story to have paid by its end
  { name: "presence-arrives", flag: "absent", asked: "paying", register: true, line: PRESENCE_LINE },
  { name: "cost-paid", flag: "absent", asked: "paying", register: true, line: COST_LINE },
  { name: "presence-in-room", flag: "absent", asked: "paying", register: true, line: PRESENCE_LINE },
  { name: "cost-in-scene", flag: "absent", asked: "paying", register: true, line: COST_LINE },
];
const RULE = new Map(STRUCTURE_RULES.map((r) => [r.name, r]));
/** The lines the flags of one beat carry, each once, in rule order; `register` keeps only the flags that send a beat back on their own. */
export const linesOf = (flags: string[], register = false) =>
  STRUCTURE_RULES.filter((r) => flags.includes(r.name) && (!register || r.register)).map((r) => r.line).filter((l, i, a) => a.indexOf(l) === i);

// --- schedule -------------------------------------------------------------------

const NEVER = Number.MAX_SAFE_INTEGER;

export function parseSchedule(text: string, cfg: DraftConfig): Schedule {
  const formText = tag(text, "form");
  if (!formText) throw new Error("no <form> tag");
  const formLines = formText.split("\n").map((l) => l.trim()).filter(Boolean);
  const form = {} as Record<FormAxis, string>;
  (Object.keys(FORM_VALUES) as FormAxis[]).forEach((axis, i) => {
    const line = formLines.find((l) => new RegExp(`^${axis}\\s*[:=]`, "i").test(l)) ?? formLines[i] ?? "";
    form[axis] = line.replace(new RegExp(`^${axis}\\s*[:=]\\s*`, "i"), "").trim();
    if (!form[axis]) throw new Error(`<form> has no ${axis} line`);
    const fixed = cfg.form[axis];
    if (fixed !== "auto" && !form[axis].toLowerCase().includes(fixed)) throw new Error(`form ${axis} is fixed to ${fixed}, schedule said ${form[axis]}`);
  });
  const beats: Beat[] = [];
  for (const m of text.matchAll(/<beat\s+n="(\d+)"\s+words="(\d+)"\s*>([\s\S]*?)<\/beat>/gi)) {
    const b = m[3];
    const withheld: Withheld[] = [];
    for (const raw of (tag(b, "withheld") ?? "").split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter(Boolean)) {
      if (/^none\.?$/i.test(raw)) continue;
      // "item — beat N", "item (beat N)", with anything after the number; or "item — never", "item —", "item": never revealed
      const w = /^(.*?)\s*[—–-]+\s*beat\s*(\d+)\b.*$/i.exec(raw) ?? /^(.*?)\s*\(\s*beat\s*(\d+)\b[^)]*\)\.?$/i.exec(raw);
      const never = w ? null : /^(.*?)\s*(?:[—–-]+\s*(?:never|not revealed|unresolved)?\.?)?$/i.exec(raw);
      if (w) { withheld.push({ item: w[1].trim(), until: Number(w[2]) }); continue; }
      if (!never?.[1].trim()) throw new Error(`beat ${m[1]}: withheld line without an item: ${raw.slice(0, 60)}`);
      withheld.push({ item: never[1].trim(), until: NEVER });
    }
    const setPiece = (tag(b, "set_piece") ?? "").trim();
    // a shaped schedule marks the beat where the withheld thing arrives and the cost is paid; the screen asks that beat
    const pays = /<pays\s*\/?>/i.test(b) || /^(yes|true)\b/i.test((tag(b, "pays") ?? "").trim());
    beats.push({ n: Number(m[1]), words: Number(m[2]), job: tag(b, "job") ?? "", when: cleanWhen(tag(b, "when")), known: tag(b, "known") ?? "", withheld, stakes: tag(b, "stakes") ?? "", set_piece: /^none\.?$/i.test(setPiece) ? "" : setPiece, absorbs: (tag(b, "absorbs") ?? "none").toLowerCase().trim(), pays });
  }
  if (!beats.length) throw new Error("no <beat> tags");
  beats.sort((a, b) => a.n - b.n);
  // an item the story never reveals stays withheld past the last beat
  for (const b of beats) for (const w of b.withheld) if (w.until === NEVER) w.until = beats.length + 1;
  beats.forEach((b, i) => { if (b.n !== i + 1) throw new Error(`beats are not numbered 1..M: found ${b.n} at position ${i + 1}`); if (!b.job) throw new Error(`beat ${b.n}: no <job>`); });
  const { count, min, max, words_min, words_max } = cfg.beats;
  if (count === "auto" ? beats.length < min || beats.length > max : beats.length !== count) throw new Error(`${beats.length} beats; config asks ${count === "auto" ? `${min}..${max}` : count}`);
  for (const b of beats) if (b.words < words_min || b.words > words_max) throw new Error(`beat ${b.n} cap ${b.words} outside ${words_min}..${words_max}`);
  const sum = beats.reduce((a, b) => a + b.words, 0);
  const { words: target, tolerance } = cfg.length;
  if (sum > target * (1 + tolerance) || sum < target * (1 - tolerance)) throw new Error(`caps sum to ${sum}, target ${target} ±${Math.round(tolerance * 100)}%`);
  const seen = new Map<string, number>();
  for (const b of beats) if (ABSORBABLE.includes(b.absorbs)) { if (seen.has(b.absorbs)) throw new Error(`${b.absorbs} absorbed by beats ${seen.get(b.absorbs)} and ${b.n}`); seen.set(b.absorbs, b.n); }
  return { form, beats, raw: text.trim() };
}

export function schedulePrompt(brief: string, cfg: DraftConfig): string {
  const { count, min, max, words_min, words_max } = cfg.beats;
  const beatsLine = `${count === "auto" ? `between ${min} and ${max}` : `exactly ${count}`}, each between ${words_min} and ${words_max} words, caps summing to about ${cfg.length.words}`;
  const fixed = (Object.keys(FORM_VALUES) as FormAxis[]).filter((a) => cfg.form[a] !== "auto");
  const auto = (Object.keys(FORM_VALUES) as FormAxis[]).filter((a) => cfg.form[a] === "auto");
  const formLines = [
    ...(auto.length ? [`form: derive ${auto.join(", ")} from the brief and state ${auto.length > 1 ? "them" : "it"}`] : []),
    ...fixed.map((a) => `${a}: ${cfg.form[a]}`),
  ].join("\n");
  const endingLine = cfg.form.ending === "brief" ? "the brief's ending is the last beat, in place" : "the schedule may derive the ending";
  // the told template asks for the narrated shape: a cold open, set pieces, an arrival, a cost, an aftermath; signal for the mission shape
  const shape: TemplateName | undefined = SHAPE_TEMPLATE[cfg.structure.template];
  return fill("schedule", { brief, words: String(cfg.length.words), beatsLine, formLines, endingLine, shape: shape ? fill(shape, {}) : "" });
}

export async function runSchedule(p: Pipeline, drawId: string, parts: BriefParts, brief: string, cfg: DraftConfig): Promise<{ step: StepRow; schedule: Schedule }> {
  const { step, value } = await p.invoke(drawId, parts.outlineStepId, "schedule", schedulePrompt(brief, cfg), (t) => parseSchedule(t, cfg));
  p.artifact(step, "schedule", value.raw, { form: value.form, beats: value.beats, words: value.beats.reduce((a, b) => a + b.words, 0) });
  return { step, schedule: value };
}

// --- scenes -----------------------------------------------------------------------

const formLine = (s: Schedule) => (Object.keys(FORM_VALUES) as FormAxis[]).map((a) => `${a} ${s.form[a]}`).join("; ");
/** A schedule whose container is told carries the narrated register into every scene; the signal template carries its own. */
const told = (s: Schedule) => /\btold\b/i.test(s.form.container);
const register = (s: Schedule, structure: { template: string; register: string }) => {
  const r = structure.register === "auto" ? (structure.template === "signal" ? "signal" : told(s) ? "told" : "none") : structure.register;
  return r === "signal" ? [fill("sceneSignal", {})] : r === "told" ? [fill("sceneTold", {})] : [];
};
/** What the scene ask says about the beat's place in time: nothing, the time, or the time and the move to it. */
const whenLine = (b: Beat, prev?: Beat) =>
  !b.when ? "" : movedIn(b, prev) ? ` It happens at ${b.when}; the beat before it happened at ${prev!.when}, so its opening places the listener in the new time before its events begin.` : ` It happens at ${b.when}.`;
const withheldLine = (b: Beat, M: number) => b.withheld.length ? b.withheld.map((w) => `${w.item} (${w.until > M ? "never revealed" : `beat ${w.until}`})`).join("; ") : "nothing";

/**
 * The part of every scene ask that no beat changes: the examples, the outline,
 * the ledger and the schedule. It goes after the stage's system line, where the
 * CLI caches it; in the user prompt it was written to the cache on every call
 * and never read, most of a draft's cost.
 */
export function sceneContext(parts: BriefParts, ledger: string, s: Schedule): string {
  return [
    parts.examples.join("\n\n"),
    `<outline>\n${parts.outline}\n</outline>`,
    `<ledger>\n${ledger}\n</ledger>`,
    `<schedule>\n${s.raw}\n</schedule>`,
  ].filter(Boolean).join("\n\n");
}

/** The beat's own ask; `sceneContext` carries the rest. */
export function scenePrompt(parts: BriefParts, s: Schedule, b: Beat, soFar: string[], constraints?: string, structure = { template: "auto", register: "auto" }): string {
  const material: Record<string, string> = { chosen: parts.vignette, "context-1": parts.contexts[0] ?? "", "context-2": parts.contexts[1] ?? "", ending: parts.ending };
  const blocks = [
    ...(soFar.length ? [`<story-so-far>\n${soFar.join("\n\n")}\n</story-so-far>`] : []),
    ...(material[b.absorbs] ? [fill("sceneMaterial", { material: material[b.absorbs] })] : []),
    ...register(s, structure),
    ...(constraints ? [constraints] : []),
    fill("sceneAsk", { n: String(b.n), job: b.job, whenLine: whenLine(b, s.beats[b.n - 2]), known: b.known, withheld: withheldLine(b, s.beats.length), form: formLine(s), cap: String(b.words), constraintLine: constraints ? " Every line of the constraints holds." : "" }),
  ];
  return blocks.filter(Boolean).join("\n\n");
}

/** `rewrite` marks a gate-2 rewrite of the beat, with the flag it answers when there is one. */
export async function writeScene(p: Pipeline, drawId: string, parent: string, parts: BriefParts, ledger: string, s: Schedule, b: Beat, soFar: string[], constraints?: string, rewrite?: { finding?: string }, structure = { template: "auto", register: "auto" }): Promise<Scene> {
  const { step, value } = await p.invoke(drawId, parent, "scene", scenePrompt(parts, s, b, soFar, constraints, structure), (t) => need(t, "scene"), null, undefined, sceneContext(parts, ledger, s));
  const n = words(value);
  const artifact_id = p.artifact(step, "scene", value, { beat: b.n, words: n, cap: b.words, warnings: n > b.words * (1 + RUN.sceneCapSlack) ? ["over_cap"] : [], ...(rewrite ? { rewrite: true, ...(rewrite.finding ? { rewrite_finding: rewrite.finding } : {}) } : {}) });
  return { beat: b.n, text: value, artifact_id, step_id: step.id };
}

/** Every beat written and bound to the ledger; a sequential beat reads the corrected text of the beats before it. */
export async function runScenes(p: Pipeline, drawId: string, scheduleStep: StepRow, parts: BriefParts, ledger: string, s: Schedule, cfg: DraftConfig, pass: string): Promise<Scene[]> {
  const write = (b: Beat, soFar: string[]) => writeScene(p, drawId, scheduleStep.id, parts, ledger, s, b, soFar, undefined, undefined, cfg.structure);
  if (cfg.scenes.order === "parallel") {
    const raw = await Promise.all(s.beats.map((b) => write(b, [])));
    return Promise.all(raw.map((sc, i) => bindScene(p, drawId, ledger, sc, raw[i - 1], cfg, pass)));
  }
  const out: Scene[] = [];
  for (const b of s.beats) out.push(await bindScene(p, drawId, ledger, await write(b, out.map((x) => x.text)), out.at(-1), cfg, pass));
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
export async function bindScene(p: Pipeline, drawId: string, ledger: string, scene: Scene, prev: Scene | undefined, cfg: DraftConfig, pass: string): Promise<Scene> {
  if (!cfg.screens.enabled.includes("ledger")) return scene;
  const k = scene.beat;
  const { samples: n, keep_if } = samplesFor(cfg.screens, "ledger");
  const prompt = fill("screenLedger", { ledger, previous: prev ? `<previous-scene>\n${prev.text}\n</previous-scene>\n\n` : "", n: String(k), scene: scene.text });
  const rs = await samples(n, (sample) => p.invoke(drawId, scene.step_id, "screen-ledger", prompt, (t) => {
    // the examined account is for the reader, not a condition of the answer: Sonnet 5 opens the tag and never closes it (run 9)
    return { findings: parseFindings(t, "ledger", sample), examined: tag(t, "examined") ?? "" };
  }));
  const all: Finding[] = rs.flatMap((r) => r.value.findings.map((f: Finding) => ({ ...f, sample: r.sample })));
  const flags = cluster(all, keep_if, `${drawId}/${k}`).filter((c) => c.reported);
  for (const c of flags) {
    const { reported: _r, ...meta } = c;
    p.artifact(rs[0].step, "finding", c.statement, { ...meta, invalidates: String(k), pass, source: "screen", screen: "ledger", beat: k });
  }
  const out = applyPatches(scene.text, flags);
  if (!out.applied.length) return scene;
  // the scene keeps its beat and cap, not the gate-2 record of the scene it patches: a patch is not a rewrite
  const { rewrite: _rw, rewrite_finding: _rf, ...meta } = chainOf(p, drawId).artifact(scene.artifact_id)!.meta;
  const step = p.recordStep(drawId, scene.step_id, "scene", "patched");
  const artifact_id = p.artifact(step, "scene", out.text, { ...meta, words: words(out.text), patched: out.applied.map((f) => f.id) });
  for (const f of out.applied) record(p.db, { kind: "finding", target_id: f.id, verdict: "keep", method: "draw", note: "patched as written" });
  return { beat: k, text: out.text, artifact_id, step_id: step.id };
}

// --- screens ----------------------------------------------------------------------

export type Profile = { beat: number; pass: string; answers: Record<string, Answer>; flags: string[] };

/**
 * A beat moves when the schedule puts it at a different point in the chronology
 * from the beat before it. A schedule written before <when> existed says nothing,
 * and nothing moves: the question is not asked and no scene is constrained.
 */
/** A schedule sometimes closes <when> with a sibling's tag; the stray token is not part of the time (run 10). */
const cleanWhen = (w: string | null) => (w ?? "").replace(/<\/?[a-z_]+>/gi, "").trim();
const whenKey = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const movedIn = (b: Beat, prev?: Beat) => !!b.when && !!prev?.when && whenKey(b.when) !== whenKey(prev.when);

/** `paid` is the beat asked whether a presence arrived and a cost was paid: the last beat, or under a shaped template the one before it. */
export function structurePrompt(b: Beat, scene: string, last: boolean, M = Number.MAX_SAFE_INTEGER, paid = last, first = b.n === 1, prev?: Beat): string {
  const later = b.withheld.filter((w) => w.until > b.n);
  return fill("screenStructure", {
    n: String(b.n), job: b.job, withheld: later.length ? later.map((w) => `${w.item} — ${w.until > M ? "never revealed" : `beat ${w.until}`}`).join("\n") : "none", scene,
    fifth: fill(last ? "screenResolvesEverything" : "screenResolved", {}), first: first ? fill("screenFirstBeat", {}) : "", last: paid ? fill("screenLastBeat", {}) : "",
    moved: movedIn(b, prev) ? fill("screenTimeMoved", { prev: prev!.when, when: b.when }) : "",
  });
}

/** The questions the structure screen asks of beat k. */
export const structureQuestions = (last: boolean, paid = last, first = false, moved = false) =>
  STRUCTURE_RULES.filter((r) => r.asked === "every" || (r.asked === "first" && first) || (r.asked === "last" && last) || (r.asked === "not-last" && !last) || (r.asked === "paying" && paid) || (r.asked === "moved" && moved)).map((r) => r.name);

/** The flags an answer set raises. The theme may be stated once, on the last beat, the way a narrated story closes. */
export const flagsOf = (answers: Record<string, Answer>, last = false) =>
  Object.entries(answers).filter(([q, a]) => RULE.get(q)?.flag === a.answer && !(last && q === "theme-stated")).map(([q]) => q);

export async function runScreens(p: Pipeline, drawId: string, s: Schedule, scenes: Scene[], cfg: DraftConfig, pass: string, beats: number[] = scenes.map((x) => x.beat), opts: { lexiconPath?: string; narrationDir?: string } = {}): Promise<void> {
  const enabled = cfg.screens.enabled;
  const M = s.beats.length;
  // the beat the schedule marked as paying, else the shaped default: the cost lands before the last beat, which is the aftermath
  const marked = s.beats.find((b) => b.pays)?.n;
  const paidBeat = cfg.structure.template === "auto" || M < 2 ? M : marked ?? M - 1;
  if (enabled.includes("structure")) await Promise.all(beats.map(async (k) => {
    const scene = scenes.find((x) => x.beat === k)!, b = s.beats[k - 1];
    const { samples: n, keep_if } = samplesFor(cfg.screens, "structure");
    const prev = s.beats[k - 2];
    const names = structureQuestions(k === M, k === paidBeat, k === 1, movedIn(b, prev));
    const prompt = structurePrompt(b, scene.text, k === M, M, k === paidBeat, k === 1, prev);
    const rs = await samples(n, () => p.invoke(drawId, scene.step_id, "screen-structure", prompt, (t) => parseQuestions(t, names)));
    // an answer is present when it recurs in keep_if samples; the quote is the first sample's
    const answers: Record<string, Answer> = {};
    for (const q of names) {
      const present = rs.filter((r) => r.value[q].answer === "present");
      const pick = present.length >= keep_if ? present[0] : rs.find((r) => r.value[q].answer === "absent") ?? rs[0];
      answers[q] = { answer: present.length >= keep_if ? "present" : "absent", quote: pick.value[q].quote };
    }
    const flags = flagsOf(answers, k === M);
    p.artifact(rs[0].step, "profile", JSON.stringify(answers), { pass, source: "screen", screen: "structure", beat: k, answers, flags, samples: n });
  }));
  // a sentence the beat says again is a flag with a location and no patch: rewrite k takes it as a constraint
  for (const k of beats) {
    const scene = scenes.find((x) => x.beat === k)!;
    // the told shape replays its cold open whole in the arrival beat: a sentence beat 1 said is meant to be said again
    const hits = restated(scenes, k).filter((h) => !(cfg.structure.template === "told" && h.earlier_beat === 1));
    if (!hits.length) continue;
    const step = p.recordStep(drawId, scene.step_id, "screen-restated", "deterministic", hits);
    for (const h of hits) {
      const meta = { id: findingId("restated", h.span, `${drawId}/${k}`), checkers: ["restated"], samples: [1], n: 1, span: h.span, statement: `beat ${k} says again what beat ${h.earlier_beat} said`,
        result: `restates:${h.earlier}`, evidence: h.earlier, invalidates: String(k), replacement: `Beat ${k} does not repeat what beat ${h.earlier_beat} already says: "${h.earlier}"`, patch: "" };
      p.artifact(step, "finding", meta.statement, { ...meta, pass, source: "screen", screen: "restated", beat: k });
    }
  }
  // the deterministic reports cover the whole draft as it stands, however few beats were re-screened: a rewrite changes the story-wide figures too
  if (enabled.includes("slop")) {
    const pool = cfg.screens.slop_baseline === "pool" ? eligiblePassages(p.db).map((x) => x.text).join("\n\n") : "";
    const report = slopScreen(scenes.map((x) => ({ beat: x.beat, text: x.text })), pool, loadLexicon(opts.lexiconPath));
    const step = p.recordStep(drawId, scenes[0]?.step_id ?? null, "screen-slop", "deterministic", report);
    p.artifact(step, "slop", JSON.stringify(report), { pass, source: "screen", screen: "slop" });
  }
  if (enabled.includes("listen")) {
    const report = listenScreen(scenes.map((x) => ({ beat: x.beat, text: x.text })), loadNarrationPool(opts.narrationDir));
    const step = p.recordStep(drawId, scenes[0]?.step_id ?? null, "screen-listen", "deterministic", report);
    p.artifact(step, "listen", JSON.stringify(report), { pass, source: "screen", screen: "listen" });
  }
}
