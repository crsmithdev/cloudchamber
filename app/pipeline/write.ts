/**
 * Stage 3, and the shapes stages 4 and 5 are built from: one call derives the
 * beat sheet, and the rest of this module is the pure material a scene ask and
 * a structure screen are assembled out of — the schedule parser, the prompt
 * builders, the screen rules and the lines a flagged beat is rewritten under.
 *
 * The calls that write and screen the scenes live in `scenesession.ts`, which
 * owns the cached system prompt they share.
 */
import type { Pipeline, StepRow } from "./draw.ts";
import { fill, type TemplateName } from "./prompts.ts";
import { tag } from "./model.ts";
import { FORM_VALUES, loadDraftConfig, type Clarity, type DraftConfig, type FormAxis, type Opening } from "./draftconfig.ts";
import { type Answer } from "./check.ts";
import type { BriefParts } from "./briefparts.ts";
import type { Fault } from "./listen.ts";
import { outOfOrder } from "./ir/s1.ts";

/** `until` is the beat that reveals the item; one past the last beat means the story never does. */
type Withheld = { item: string; until: number };
export type Beat = { n: number; words: number; job: string; when: string; known: string; withheld: Withheld[]; stakes: string; set_piece: string; absorbs: string; pays: boolean };
export type Schedule = { form: Record<FormAxis, string>; beats: Beat[]; raw: string };
export type Scene = { beat: number; text: string; artifact_id: string; step_id: string };

const ABSORBABLE = ["chosen", "context-1", "context-2", "ending"];
/** The schedule ask each shaped template adds; `auto` adds none. */
const SHAPE_TEMPLATE: Record<string, TemplateName> = { told: "scheduleTold", signal: "scheduleSignal", listen: "scheduleListen" };
/** The constraint a beat flagged bodily-emotion is rewritten under. */
export const BODY_LINE = "When a thing happens in this beat, the narrator says what the body did before saying what it meant: the chest, the hands, the breath, the stomach.";
/** The paying beat: the withheld thing comes in and does harm, and the loss happens on the page. Three outside judges put these two first, and every presence pass they gave the channel named a barrier or a thing that only stood there. */
export const PRESENCE_LINE = "In this beat the thing the story withholds is in the same place as a character with nothing between them, and it acts: it touches, moves, breaks or takes a person or a thing, on the page, at the time. It does not stand behind glass, in a doorway, or on a channel, and it does not only get looked at.";
export const COST_LINE = "In this beat the loss happens as it happens, on the page, in the moment, with the person who pays it present; the narrator does not report it afterward.";
const TIME_LINE = "This beat happens at a different point in the story's chronology from the beat before it. Its opening places the listener in the new time, in its own words, before the beat's events begin.";
const TIME_LINE_SPOKEN = "This beat happens at a different point in the story's chronology from the beat before it. Its first words mark the move aloud, the way a person telling it would, before the beat's events begin.";
export const THEME_LINE = "No sentence in this beat says what the story means or what its lesson is; the events carry it, and nobody names it.";
const WITHHELD_LINE = "What the schedule lists as withheld after this beat stays withheld: the beat may imply it and may not state it.";
const WRONG_LINE = "The point-of-view character is allowed to be mistaken, unfair or at fault somewhere in this beat, and the beat lets it stand.";
const RESOLVED_LINE = "This beat settles nothing the story still withholds: the questions it has raised are open at the end of the beat.";
const OPEN_LINE = "The last beat leaves at least one question the story raised open; it does not close every one.";
/** Three outside judges gave the source people, momentum and the hook on the clean text (evals/20260920-clean-judge.md): a cast told apart by ear, one visible event a beat, and what is wrong said first. */
export const VOICES_LINE = "The people in this beat speak in quoted lines and are told apart by how they talk, as the schedule's cast says; no two sound alike, and no line could be moved from one mouth to another.";
export const EVENT_LINE = "Something happens in this beat that a second person present could see or hear: an act, an arrival, a breakage, a refusal said aloud. It is not thought, recollection or measurement alone.";
/** The line a beat 1 flagged hook-late is rewritten under, by opening mode; under promise and cold it is also beat 1's first ask. Slow asks no hook. */
export const hookLine = (o: Opening): string =>
  o.mode === "promise" ? `Within the first ${o.window} words of this beat, in one or two sentences, the narrator says who they are and what went wrong, plainly, the way the story's title would, before any routine, setting or history; then the beat shows how it began.`
  : o.mode === "cold" ? `This beat opens inside the wrong thing, while it is happening: within its first ${o.window} words the thing the story is about, or its first effect, is on the page, before any routine, setting or history.`
  : `The first ${o.window} words of this beat say what is wrong: the thing the story is about, or its first effect, named or shown before any routine, setting or history.`;
/** The drafting defaults: what a caller that passes no configuration gets. */
const DEFAULTS = loadDraftConfig().config;
export const HOOK_LINE = hookLine(DEFAULTS.opening);
/** Beat 1 keeps the seed title's promise (ba9d: a moon-signal title opened on a woman in a cellar, and tied the hook). */
const echoLine = (seed: string) => `The story's title is "${seed}". This beat keeps the title's promise in its own words: the narrator the title names and the wrong thing it names are both here, in its first lines, without quoting the title.`;
const FOCAL_LINE = "One point of view: the narrator's. Do not go inside another person's head; what others did and felt is what the narrator saw, heard or was told.";
const recapLine = (stakes: string) => `Within its first three sentences, this beat says once, plainly, in the narrator's voice, what is at stake now (${stakes.replace(/\.$/, "")}): one sentence, not a summary of what came before.`;
const RULES_LINE = "When the schedule has this beat open a rule, the beat opens on the rule, its number and its words as the narrator was given them, said aloud; then what happened under it.";
/** The listen screen's long-sentence share, over the configured ceiling, sends a beat back for one rewrite under this line. */
export const LENGTH_LINE = "One thing per sentence, short enough to say aloud in one breath; no sentence over thirty words.";
/** The listen screen's numeral rate, over the configured ceiling, sends a beat back for one rewrite under this line. */
export const NUMERAL_LINE = "A listener cannot hold a figure: keep only the numbers a person would say aloud, round or cut the rest, and never put two exact figures in one sentence.";
/** The rewrite line for each listen fault; an edit carries the same line. */
export const FAULT_LINE: Record<Fault, string> = { long: LENGTH_LINE, numerals: NUMERAL_LINE };

/**
 * A screen rule is one row: the question, which answer is the flag, which
 * beats it is asked of, whether the flag sends the beat back for a register
 * rewrite on its own, and the line a rewrite carries. structureScreen asks
 * them; the question text is in prompts.ts, grouped by the position that asks it.
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
export const linesOf = (flags: string[], register = false, cfg: Telling = DEFAULTS) =>
  STRUCTURE_RULES.filter((r) => flags.includes(r.name) && (!register || r.register)).map((r) => lineFor(r, cfg)).filter((l, i, a) => a.indexOf(l) === i);
/** The keys a scene ask, a screen and a rewrite line read beyond the beat itself. */
export type Telling = Pick<DraftConfig, "structure" | "opening" | "clarity">;
/** The line a rule's flag carries under this configuration: the hook follows the opening, the time move the signposts. */
const lineFor = (r: ScreenRule, cfg: Telling): string =>
  r.name === "hook-late" ? hookLine(cfg.opening) : r.name === "time-unplaced" && cfg.clarity.signposts === "spoken" ? TIME_LINE_SPOKEN : r.line;

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
    // the value as a word of its own: "nonlinear" and "non-linear" contain "linear" and are not it
    if (fixed !== "auto" && !new RegExp(`(^|[^a-z-])${fixed}(?![a-z])`).test(form[axis].toLowerCase())) throw new Error(`form ${axis} is fixed to ${fixed}, schedule said ${form[axis]}`);
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
  // a fixed linear chronology holds the beats, not the form line alone: 69c0 said `linear` and opened at hour sixty-one, then went back to hour zero
  if (cfg.form.chronology === "linear") { const o = outOfOrder(beats)[0]; if (o) throw new Error(`form chronology is fixed to linear, but ${o.message}`); }
  return { form, beats, raw: text.trim() };
}

/** An operator's instruction for a schedule planned again from beat `from`, against the schedule the draft had. */
export type Replan = { instruction: string; from: number; schedule: Schedule };

function schedulePrompt(brief: string, cfg: DraftConfig, replan?: Replan): string {
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
  const kept = replan && replan.from > 1 ? fill("scheduleKept", { last: String(replan.from - 1), from: String(replan.from), written: replan.schedule.raw }) : "";
  const asked = replan ? fill("scheduleReplan", { instructions: `- ${replan.instruction}`, kept }) : "";
  const window = String(cfg.opening.window);
  const firstBeat = cfg.opening.mode === "slow" ? fill("listenFirstBeatSlow", {}) : fill("listenFirstBeat", { window });
  return fill("schedule", { brief, words: String(cfg.length.words), beatsLine, formLines, endingLine, shape: asked + (shape ? fill(shape, { firstBeat }) : "") + scheduleTelling(cfg) });
}

/** What the opening, the clarity and the rules container add to the schedule ask: a paragraph each, none under the defaults. */
function scheduleTelling(cfg: DraftConfig): string {
  const asks: TemplateName[] = [
    ...(cfg.opening.mode === "promise" ? ["scheduleOpenPromise" as const] : cfg.opening.mode === "cold" ? ["scheduleOpenCold" as const] : []),
    ...(cfg.opening.echo_title ? ["scheduleEchoTitle" as const] : []),
    ...(cfg.clarity.focal === 1 ? ["scheduleFocal" as const] : []),
    ...(cfg.form.container === "rules" ? ["scheduleRules" as const] : []),
  ];
  return asks.map((t) => fill(t, { window: String(cfg.opening.window) }) + "\n\n").join("");
}

/**
 * The schedule, derived from the brief. Under `replan` it is planned again
 * under the operator's instruction; the beats under `from` are written, so
 * their entries and the form are the old schedule's whatever the reply says.
 */
export async function runSchedule(p: Pipeline, drawId: string, parts: BriefParts, brief: string, cfg: DraftConfig, replan?: Replan): Promise<{ step: StepRow; schedule: Schedule }> {
  const { step, value } = await p.invoke(drawId, parts.outlineStepId, "schedule", schedulePrompt(brief, cfg, replan), (t) => parseSchedule(t, cfg));
  const schedule = replan && replan.from > 1
    ? { ...value, form: replan.schedule.form, beats: [...replan.schedule.beats.filter((b) => b.n < replan.from), ...value.beats.filter((b) => b.n >= replan.from)] }
    : value;
  p.artifact(step, "schedule", value.raw, { form: schedule.form, beats: schedule.beats, words: schedule.beats.reduce((a, b) => a + b.words, 0) });
  return { step, schedule };
}

// --- scenes -----------------------------------------------------------------------

const formLine = (s: Schedule) => (Object.keys(FORM_VALUES) as FormAxis[]).map((a) => `${a} ${s.form[a]}`).join("; ");
/** A schedule whose container is told carries the narrated register into every scene; the signal template carries its own. */
const told = (s: Schedule) => /\btold\b/i.test(s.form.container);
/** The teller follows the schedule's person line ("third limited", "First"): under second or third person the narrator stands outside the story. */
const tellerStance = (person: string) => {
  const outside = /\bfirst\b/i.test(person) ? null : /\b(second|third)\b/i.exec(person);
  return outside ? fill("tellerOutside", { person: outside[1]!.toLowerCase() }) : fill("tellerFirst", {});
};
const register = (s: Schedule, cfg: Telling) => {
  const { structure } = cfg;
  const r = structure.register === "auto" ? (structure.template === "signal" ? "signal" : told(s) ? "told" : "none") : structure.register;
  const time = fill(cfg.clarity.signposts === "spoken" ? "timeSpoken" : "timeScene", {});
  return r === "signal" ? [fill("sceneSignal", { time })] : r === "teller" ? [fill("sceneTeller", { time, stance: tellerStance(s.form.person) })] : r === "told" ? [fill("sceneTold", {})] : [];
};
/** A schedule whose container is rules hangs its beats on a numbered list. */
const rules = (s: Schedule) => /\brules\b/i.test(s.form.container);
/** What the opening and clarity keys ask of this one beat, as one block; nothing under the defaults. */
const telling = (parts: BriefParts, s: Schedule, b: Beat, cfg: Telling): string[] => {
  const lines = [
    ...(b.n === 1 && (cfg.opening.mode === "promise" || cfg.opening.mode === "cold") ? [hookLine(cfg.opening)] : []),
    ...(b.n === 1 && cfg.opening.echo_title ? [echoLine(parts.seed.trim())] : []),
    ...(cfg.clarity.focal === 1 ? [FOCAL_LINE] : []),
    ...(b.n > 1 && cfg.clarity.recap && b.stakes ? [recapLine(b.stakes.trim())] : []),
    ...(rules(s) ? [RULES_LINE] : []),
  ];
  return lines.length ? [fill("sceneTelling", { lines: lines.join("\n") })] : [];
};
/** What the scene ask says about the beat's place in time: nothing, the time, or the time and the move to it. */
const whenLine = (b: Beat, prev: Beat | undefined, signposts: Clarity["signposts"]) =>
  !b.when ? "" : !movedIn(b, prev) ? ` It happens at ${b.when}.`
  : signposts === "spoken" ? ` It happens at ${b.when}; the beat before it happened at ${prev!.when}, so its first words mark the move aloud, the way a person telling it would, before its events begin.`
  : ` It happens at ${b.when}; the beat before it happened at ${prev!.when}, so its opening places the listener in the new time before its events begin.`;
const withheldLine = (b: Beat, M: number) => b.withheld.length ? b.withheld.map((w) => `${w.item} (${w.until > M ? "never revealed" : `beat ${w.until}`})`).join("; ") : "nothing";

/**
 * The part of every scene ask that no beat changes: the examples, the outline,
 * the ledger and the schedule. It goes in the system prompt, where the CLI
 * caches it; in the user prompt it was written to the cache on every call and
 * never read, most of a draft's cost.
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
export function scenePrompt(parts: BriefParts, s: Schedule, b: Beat, soFar: string[], constraints?: string, cfg: Telling = DEFAULTS): string {
  const material: Record<string, string> = { chosen: parts.vignette, "context-1": parts.contexts[0] ?? "", "context-2": parts.contexts[1] ?? "", ending: parts.ending };
  const blocks = [
    ...(soFar.length ? [`<story-so-far>\n${soFar.join("\n\n")}\n</story-so-far>`] : []),
    ...(material[b.absorbs] ? [fill("sceneMaterial", { material: material[b.absorbs] })] : []),
    ...register(s, cfg),
    ...telling(parts, s, b, cfg),
    ...(constraints ? [constraints] : []),
    fill("sceneAsk", { n: String(b.n), job: b.job, whenLine: whenLine(b, s.beats[b.n - 2], cfg.clarity.signposts), known: b.known, withheld: withheldLine(b, s.beats.length), form: formLine(s), cap: String(b.words), constraintLine: constraints ? " Every line of the constraints holds." : "" }),
  ];
  return blocks.filter(Boolean).join("\n\n");
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

/** The hook-late question each opening mode asks of beat 1; slow asks none. */
const FIRST_BEAT: Record<Exclude<Opening["mode"], "slow">, TemplateName> = { scene: "screenFirstBeat", promise: "screenFirstBeatPromise", cold: "screenFirstBeatCold" };

/** Where a beat stands in the schedule, which decides the rules the structure screen asks of it. */
type Position = { first: boolean; last: boolean; paying: boolean; moved: boolean };
const ASKED: Record<ScreenRule["asked"], (at: Position) => boolean> = {
  every: () => true, first: (at) => at.first, last: (at) => at.last, "not-last": (at) => !at.last, paying: (at) => at.paying, moved: (at) => at.moved,
};

/**
 * The structure screen of beat k: the names of the rules it asks and the prompt
 * that asks them, both from the beat's one position. The paying beat is asked
 * whether a presence arrived and a cost was paid: the beat the schedule marks,
 * else under a shaped template the one before the last, which is the aftermath;
 * under `auto`, the last.
 */
export function structureScreen(s: Schedule, k: number, scene: string, template: string, opening: Opening = DEFAULTS.opening): { prompt: string; names: string[] } {
  const M = s.beats.length, b = s.beats[k - 1]!, prev = s.beats[k - 2];
  const paying = template === "auto" || M < 2 ? M : s.beats.find((x) => x.pays)?.n ?? M - 1;
  const at: Position = { first: k === 1, last: k === M, paying: k === paying, moved: movedIn(b, prev) };
  const later = b.withheld.filter((w) => w.until > b.n);
  const prompt = fill("screenStructure", {
    n: String(b.n), job: b.job, withheld: later.length ? later.map((w) => `${w.item} — ${w.until > M ? "never revealed" : `beat ${w.until}`}`).join("\n") : "none", scene,
    fifth: fill(at.last ? "screenResolvesEverything" : "screenResolved", {}), first: at.first && opening.mode !== "slow" ? fill(FIRST_BEAT[opening.mode], { window: String(opening.window) }) : "", last: at.paying ? fill("screenLastBeat", {}) : "",
    moved: at.moved ? fill("screenTimeMoved", { prev: prev!.when, when: b.when }) : "",
  });
  // a slow opening asks no hook: the question is not in the prompt, so no answer is read for it
  return { prompt, names: STRUCTURE_RULES.filter((r) => ASKED[r.asked](at) && !(r.name === "hook-late" && opening.mode === "slow")).map((r) => r.name) };
}

/** The flags an answer set raises. The theme may be stated once, on the last beat, the way a narrated story closes. */
export const flagsOf = (answers: Record<string, Answer>, last = false) =>
  Object.entries(answers).filter(([q, a]) => RULE.get(q)?.flag === a.answer && !(last && q === "theme-stated")).map(([q]) => q);
