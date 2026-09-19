/**
 * The listenability screen: deterministic, outside any model, against the
 * narrated stories in evals/reference/. Six measures a listener feels and a
 * reader does not: sentence length, the share of long sentences, numerals,
 * quotation, the body named, the listener addressed. Each is given for the
 * draft and for the pool, and the draft's minutes at the pool's narration
 * pace. It marks; it does not judge.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NARRATION } from "./paths.ts";

export type ListenProfile = {
  words: number;
  sentence_mean: number;        // words per sentence
  long_sentence_share: number;  // sentences over 30 words, as a share of sentences
  numerals_per_1k: number;
  quotes_per_1k: number;        // quotation marks
  body_per_1k: number;          // a body part or bodily verb
  you_per_1k: number;           // the listener addressed
  first_person_per_1k: number;
};
export type ListenReport = {
  story: ListenProfile;
  pool: ListenProfile;
  pool_wpm: number;
  minutes: number;              // the draft at the pool's pace
  beats: { beat: number; words: number; minutes: number }[];
};
export type NarrationPool = { text: string; wpm: number; videos: number };

const BODY = /\b(chest|stomach|gut|throat|breath|breathing|breathe|breathed|hands?|skin|spine|neck|heart|pulse|shoulders?|teeth|jaw|knees?|legs?|face|eyes|mouth|tongue|fingers?|sweat|shiver(?:ed|ing)?|shak(?:ing|e|es|en)|shook|trembl(?:ed|ing|e)|nausea|dizzy|numb)\b/gi;
const FIRST = /\b(i|i'm|i'd|i've|i'll|me|my|mine|we|we're|we'd|we've|our|us)\b/gi;
const YOU = /\byou(?:'re|'d|'ve|'ll)?\b/gi;
const NUMERAL = /\b\d[\d,.:]*\b/g;
const QUOTE = /["“”]/g;
const wordsOf = (t: string) => t.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
const sentencesOf = (t: string) => t.split(/(?<=[.!?]["”’']?)\s+|\n+/).map((x) => x.trim()).filter((x) => wordsOf(x).length > 0);

export function profile(text: string): ListenProfile {
  const n = Math.max(1, wordsOf(text).length);
  const sentences = sentencesOf(text);
  const lens = sentences.map((s) => wordsOf(s).length);
  const per1k = (c: number) => Math.round((c / n) * 1000 * 10) / 10;
  return {
    words: wordsOf(text).length,
    sentence_mean: lens.length ? Math.round((lens.reduce((a, b) => a + b, 0) / lens.length) * 10) / 10 : 0,
    long_sentence_share: lens.length ? Math.round((lens.filter((l) => l > 30).length / lens.length) * 100) / 100 : 0,
    numerals_per_1k: per1k((text.match(NUMERAL) ?? []).length),
    quotes_per_1k: per1k((text.match(QUOTE) ?? []).length),
    body_per_1k: per1k((text.match(BODY) ?? []).length),
    you_per_1k: per1k((text.match(YOU) ?? []).length),
    first_person_per_1k: per1k((text.match(FIRST) ?? []).length),
  };
}

let cached: { dir: string; pool: NarrationPool } | null = null;

/**
 * Every transcript under the narration directory, joined, with the pace its
 * timings give. A channel's intro before "Let's dive into today's story" is
 * not the story and is cut. Read once per process.
 */
export function loadNarrationPool(dir: string = NARRATION): NarrationPool {
  if (cached && cached.dir === dir) return cached.pool;
  const texts: string[] = [];
  let words = 0, seconds = 0, videos = 0;
  const walk = (d: string) => {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { return; }
    for (const name of names) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!name.endsWith(".json")) continue;
      let t: { snippets?: { text: string; start?: number; duration?: number }[] };
      try { t = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
      const sn = t.snippets ?? [];
      if (!sn.length) continue;
      let text = sn.map((s) => s.text).join(" ");
      const intro = text.indexOf("Let's dive into today's story");
      if (intro >= 0 && intro < 3000) text = text.slice(intro + 30);
      texts.push(text); videos++;
      const w = wordsOf(text).length;
      const first = sn[0].start, last = sn[sn.length - 1];
      if (first !== undefined && last.start !== undefined) { words += w; seconds += last.start + (last.duration ?? 0) - first; }
    }
  };
  walk(dir);
  const pool = { text: texts.join("\n\n"), wpm: seconds > 0 ? Math.round(words / (seconds / 60)) : 140, videos };
  cached = { dir, pool };
  return pool;
}

export function listenScreen(scenes: { beat: number; text: string }[], pool: NarrationPool): ListenReport {
  const story = scenes.map((s) => s.text).join("\n\n");
  const minutes = (w: number) => Math.round((w / pool.wpm) * 10) / 10;
  return {
    story: profile(story), pool: profile(pool.text), pool_wpm: pool.wpm, minutes: minutes(wordsOf(story).length),
    beats: scenes.map((s) => ({ beat: s.beat, words: wordsOf(s.text).length, minutes: minutes(wordsOf(s.text).length) })),
  };
}
