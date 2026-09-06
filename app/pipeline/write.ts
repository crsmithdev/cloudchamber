/**
 * Stages 3 to 5: schedule, scenes, screens. One call derives the beat sheet;
 * one fresh call writes each beat; each scene is screened against the ledger
 * and a fixed list of structural tells, and the joined draft is run through
 * the deterministic slop screen.
 */
import type { Pipeline, StepRow } from "./draw.ts";
import { fill } from "./prompts.ts";
import { tag, words } from "./model.ts";
import { RUN } from "./config.ts";
import { eligiblePassages } from "./bank.ts";
import { FORM_VALUES, samplesFor, type DraftConfig, type FormAxis } from "./draftconfig.ts";
import { cluster, parseFindings, type Cluster, type Finding } from "./recur.ts";
import { loadLexicon, slopScreen } from "./slop.ts";
import { parseQuestions, type Answer } from "./check.ts";
import { passId, type BriefParts } from "./briefparts.ts";

export type Withheld = { item: string; until: number };
export type Beat = { n: number; words: number; job: string; known: string; withheld: Withheld[]; stakes: string; absorbs: string };
export type Schedule = { form: Record<FormAxis, string>; formLines: string[]; beats: Beat[]; raw: string };
export type Scene = { beat: number; text: string; artifact_id: string; step_id: string };

export const ABSORBABLE = ["chosen", "context-1", "context-2", "ending"];
export const STRUCTURE_SCREEN = ["theme-stated", "bodily-emotion", "withheld-revealed", "protagonist-never-wrong"];
/** A present answer on these, or an absent one on bodily-emotion, is a flag. */
export const FLAG_PRESENT = new Set(["theme-stated", "withheld-revealed", "protagonist-never-wrong", "resolved", "resolves-everything"]);

// --- schedule -------------------------------------------------------------------

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
      const w = /^(.*?)\s*[—–-]+\s*beat\s*(\d+)\.?$/i.exec(raw) ?? /^(.*?)\s*\(\s*beat\s*(\d+)\s*\)\.?$/i.exec(raw);
      if (!w) throw new Error(`beat ${m[1]}: withheld line without a beat number: ${raw.slice(0, 60)}`);
      withheld.push({ item: w[1].trim(), until: Number(w[2]) });
    }
    beats.push({ n: Number(m[1]), words: Number(m[2]), job: tag(b, "job") ?? "", known: tag(b, "known") ?? "", withheld, stakes: tag(b, "stakes") ?? "", absorbs: (tag(b, "absorbs") ?? "none").toLowerCase().trim() });
  }
  if (!beats.length) throw new Error("no <beat> tags");
  beats.sort((a, b) => a.n - b.n);
  beats.forEach((b, i) => { if (b.n !== i + 1) throw new Error(`beats are not numbered 1..M: found ${b.n} at position ${i + 1}`); if (!b.job) throw new Error(`beat ${b.n}: no <job>`); });
  const { count, min, max, words_min, words_max } = cfg.beats;
  if (count === "auto" ? beats.length < min || beats.length > max : beats.length !== count) throw new Error(`${beats.length} beats; config asks ${count === "auto" ? `${min}..${max}` : count}`);
  for (const b of beats) if (b.words < words_min || b.words > words_max) throw new Error(`beat ${b.n} cap ${b.words} outside ${words_min}..${words_max}`);
  const sum = beats.reduce((a, b) => a + b.words, 0);
  const { words: target, tolerance } = cfg.length;
  if (sum > target * (1 + tolerance) || sum < target * (1 - tolerance)) throw new Error(`caps sum to ${sum}, target ${target} ±${Math.round(tolerance * 100)}%`);
  const seen = new Map<string, number>();
  for (const b of beats) if (ABSORBABLE.includes(b.absorbs)) { if (seen.has(b.absorbs)) throw new Error(`${b.absorbs} absorbed by beats ${seen.get(b.absorbs)} and ${b.n}`); seen.set(b.absorbs, b.n); }
  return { form, formLines, beats, raw: text.trim() };
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
  return fill("schedule", { brief, words: String(cfg.length.words), beatsLine, formLines, endingLine });
}

export async function runSchedule(p: Pipeline, drawId: string, parts: BriefParts, brief: string, cfg: DraftConfig): Promise<{ step: StepRow; schedule: Schedule }> {
  const { step, value } = await p.invoke(drawId, parts.outlineStepId, "schedule", schedulePrompt(brief, cfg), (t) => parseSchedule(t, cfg));
  p.artifact(step, "schedule", value.raw, { form: value.form, beats: value.beats, words: value.beats.reduce((a, b) => a + b.words, 0) });
  return { step, schedule: value };
}

// --- scenes -----------------------------------------------------------------------

const formLine = (s: Schedule) => (Object.keys(FORM_VALUES) as FormAxis[]).map((a) => `${a} ${s.form[a]}`).join("; ");
const withheldLine = (b: Beat) => b.withheld.length ? b.withheld.map((w) => `${w.item} (beat ${w.until})`).join("; ") : "nothing";

export function scenePrompt(parts: BriefParts, ledger: string, s: Schedule, b: Beat, soFar: string[], constraints?: string): string {
  const material: Record<string, string> = { chosen: parts.vignette, "context-1": parts.contexts[0] ?? "", "context-2": parts.contexts[1] ?? "", ending: parts.ending };
  const blocks = [
    parts.examples.join("\n\n"),
    `<outline>\n${parts.outline}\n</outline>`,
    `<ledger>\n${ledger}\n</ledger>`,
    `<schedule>\n${s.raw}\n</schedule>`,
    ...(soFar.length ? [`<story-so-far>\n${soFar.join("\n\n")}\n</story-so-far>`] : []),
    ...(material[b.absorbs] ? [fill("sceneMaterial", { material: material[b.absorbs] })] : []),
    ...(constraints ? [constraints] : []),
    fill("sceneAsk", { n: String(b.n), job: b.job, known: b.known, withheld: withheldLine(b), form: formLine(s), cap: String(b.words), constraintLine: constraints ? " Every line of the constraints holds." : "" }),
  ];
  return blocks.filter(Boolean).join("\n\n");
}

export async function writeScene(p: Pipeline, drawId: string, parent: string, parts: BriefParts, ledger: string, s: Schedule, b: Beat, soFar: string[], constraints?: string): Promise<Scene> {
  const { step, value } = await p.invoke(drawId, parent, "scene", scenePrompt(parts, ledger, s, b, soFar, constraints), (t) => {
    const v = tag(t, "scene"); if (!v) throw new Error("no <scene> tag"); return v;
  });
  const n = words(value);
  const artifact_id = p.artifact(step, "scene", value, { beat: b.n, words: n, cap: b.words, warnings: n > b.words * (1 + RUN.sceneCapSlack) ? ["over_cap"] : [], ...(constraints ? { rewrite: true } : {}) });
  return { beat: b.n, text: value, artifact_id, step_id: step.id };
}

export async function runScenes(p: Pipeline, drawId: string, scheduleStep: StepRow, parts: BriefParts, ledger: string, s: Schedule, cfg: DraftConfig): Promise<Scene[]> {
  if (cfg.scenes.order === "parallel") return Promise.all(s.beats.map((b) => writeScene(p, drawId, scheduleStep.id, parts, ledger, s, b, [])));
  const out: Scene[] = [];
  for (const b of s.beats) out.push(await writeScene(p, drawId, scheduleStep.id, parts, ledger, s, b, out.map((x) => x.text)));
  return out;
}

/** The latest scene artifact per beat, in beat order. */
export function currentScenes(p: Pipeline, drawId: string): Scene[] {
  const byBeat = new Map<number, Scene>();
  for (const a of p.artifacts(drawId)) if (a.kind === "scene") { const m = JSON.parse(a.meta); byBeat.set(m.beat, { beat: m.beat, text: a.content, artifact_id: a.id, step_id: a.step_id }); }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}

// --- screens ----------------------------------------------------------------------

export type Profile = { beat: number; pass: string; answers: Record<string, Answer>; flags: string[] };

export function structurePrompt(s: Schedule, b: Beat, scene: string, last: boolean): string {
  const later = b.withheld.filter((w) => w.until > b.n);
  return fill("screenStructure", {
    n: String(b.n), job: b.job, withheld: later.length ? later.map((w) => `${w.item} — beat ${w.until}`).join("\n") : "none", scene,
    fifth: fill(last ? "screenResolvesEverything" : "screenResolved", {}),
  });
}

export const flagsOf = (answers: Record<string, Answer>) =>
  Object.entries(answers).filter(([q, a]) => (FLAG_PRESENT.has(q) && a.answer === "present") || (q === "bodily-emotion" && a.answer === "absent")).map(([q]) => q);

export async function runScreens(p: Pipeline, drawId: string, parts: BriefParts, ledger: string, s: Schedule, scenes: Scene[], cfg: DraftConfig, beats: number[] = scenes.map((x) => x.beat), opts: { lexiconPath?: string } = {}): Promise<{ pass: string; findings: Cluster[]; profiles: Profile[] }> {
  const pass = passId();
  const enabled = cfg.screens.enabled;
  const M = s.beats.length;
  const findings: Cluster[] = [], profiles: Profile[] = [];
  await Promise.all(beats.flatMap((k) => {
    const scene = scenes.find((x) => x.beat === k)!, b = s.beats[k - 1];
    const prev = scenes.find((x) => x.beat === k - 1);
    const runs: Promise<unknown>[] = [];
    if (enabled.includes("ledger")) {
      const { samples, keep_if } = samplesFor(cfg.screens, "ledger");
      const prompt = fill("screenLedger", { ledger, previous: prev ? `<previous-scene>\n${prev.text}\n</previous-scene>\n\n` : "", n: String(k), scene: scene.text });
      runs.push(Promise.all(Array.from({ length: samples }, (_, i) => p.invoke(drawId, scene.step_id, "screen-ledger", prompt, (t) => {
        if (!tag(t, "examined")) throw new Error("no <examined> tag");
        return { findings: parseFindings(t, "ledger", i + 1), examined: tag(t, "examined") };
      }).then((r) => ({ ...r, sample: i + 1 })))).then((rs) => {
        const all: Finding[] = rs.flatMap((r) => r.value.findings.map((f: Finding) => ({ ...f, sample: r.sample })));
        for (const c of cluster(all, keep_if).filter((c) => c.reported)) {
          const { reported: _r, ...meta } = c;
          p.artifact(rs[0].step, "finding", c.statement, { ...meta, invalidates: String(k), pass, source: "screen", screen: "ledger", beat: k });
          findings.push({ ...c, invalidates: String(k) });
        }
      }));
    }
    if (enabled.includes("structure")) {
      const { samples, keep_if } = samplesFor(cfg.screens, "structure");
      const names = [...STRUCTURE_SCREEN, k === M ? "resolves-everything" : "resolved"];
      const prompt = structurePrompt(s, b, scene.text, k === M);
      runs.push(Promise.all(Array.from({ length: samples }, () => p.invoke(drawId, scene.step_id, "screen-structure", prompt, (t) => parseQuestions(t, names)))).then((rs) => {
        // an answer is present when it recurs in keep_if samples; the quote is the first sample's
        const answers: Record<string, Answer> = {};
        for (const q of names) {
          const present = rs.filter((r) => r.value[q].answer === "present");
          const pick = present.length >= keep_if ? present[0] : rs.find((r) => r.value[q].answer === "absent") ?? rs[0];
          answers[q] = { answer: present.length >= keep_if ? "present" : "absent", quote: pick.value[q].quote };
        }
        const flags = flagsOf(answers);
        p.artifact(rs[0].step, "profile", JSON.stringify(answers), { pass, source: "screen", screen: "structure", beat: k, answers, flags, samples });
        profiles.push({ beat: k, pass, answers, flags });
      }));
    }
    return runs;
  }));
  if (enabled.includes("slop") && beats.length === scenes.length) {
    const pool = cfg.screens.slop_baseline === "pool" ? eligiblePassages(p.db).map((x) => x.text).join("\n\n") : "";
    const report = slopScreen(scenes.map((x) => ({ beat: x.beat, text: x.text })), pool, loadLexicon(opts.lexiconPath));
    const step = p.recordStep(drawId, scenes[0]?.step_id ?? null, "screen-slop", "deterministic", report);
    p.artifact(step, "slop", JSON.stringify(report), { pass, source: "screen", screen: "slop" });
  }
  return { pass, findings, profiles: profiles.sort((a, b) => a.beat - b.beat) };
}
