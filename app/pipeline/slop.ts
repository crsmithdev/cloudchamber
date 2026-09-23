/**
 * The slop screen: deterministic, outside any model. Five measures against the
 * eligible passage pool, none summed: lexicon hits with proper nouns excluded,
 * the not-X-but-Y rate, trigrams repeated in the draft and absent from the
 * pool, paragraph shape per scene, and phrases said again in quoted speech.
 * It marks; it does not judge.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalise } from "./recur.ts";

export const LEXICON_PATH = resolve(import.meta.dir, "slop.txt");

export type SlopReport = {
  words: number;
  pool_words: number;
  lexicon: { term: string; count: number }[];
  not_but: { hits: number; per_10k: number; pool_per_10k: number; examples: string[] };
  trigrams: { trigram: string; count: number }[];
  paragraphs: { beat: number; words: number; paragraphs: number; mean_words: number; single_sentence_share: number }[];
/**
   * A phrase said three times or more inside quoted speech. It reports what it
   * says and no more: over nine drafts these were as often a repeated fact or
   * motif ("four hundred years" six times) as a speaker's catchphrase ("it's an
   * honor"). Attributing a phrase to one speaker would tell them apart, but only
   * 17 to 45 quoted lines a draft name their speaker, and under that rule every
   * draft measured zero.
   */
  repeated_speech: { phrase: string; count: number }[];
};

export function loadLexicon(path: string = LEXICON_PATH): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#"));
}

const wordsOf = (t: string) => t.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Verbatim from the simulation: "not X but Y" and "it wasn't X. It was Y". */
export const NOT_BUT = /\b(?:not|isn't|wasn't|isn’t|wasn’t|never)\b[^.;:]{1,60}?\bbut\b|\b(?:wasn't|isn't|wasn’t|isn’t|not)\b[^.]{1,60}\.\s+(?:It|That|This|She|He|They)\s+(?:was|is|were)\b/gi;

/** A word is a proper noun in this draft when it appears capitalised more often than not. */
function properNouns(text: string): Set<string> {
  const cap = new Map<string, number>(), low = new Map<string, number>();
  for (const m of text.matchAll(/\b([A-Za-z][a-z'’-]+)\b/g)) {
    const w = m[1], k = w.toLowerCase();
    if (w[0] === w[0].toUpperCase()) cap.set(k, (cap.get(k) ?? 0) + 1); else low.set(k, (low.get(k) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [k, c] of cap) if (c > (low.get(k) ?? 0)) out.add(k);
  return out;
}

function trigrams(ws: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + 2 < ws.length; i++) { const t = `${ws[i]} ${ws[i + 1]} ${ws[i + 2]}`; m.set(t, (m.get(t) ?? 0) + 1); }
  return m;
}

/** A sentence of beat k that an earlier beat already said, word for word or nearly. */
export type Restated = { beat: number; span: string; earlier_beat: number; earlier: string };

const sentencesOf = (t: string) => t.split(/(?<=[.!?]["”’']?)\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const tokens = (s: string) => wordsOf(s).length;
/** Words that carry no content of their own; a repeat is measured on the rest. */
const STOP = new Set("the a an and or but of to in on at by for with it its is was were be been that this these those he she they him her his their them i you we our not no as from had has have do did so than then there here what which who when where into out up down over off all one two said".split(" "));
const content = (s: string) => new Set(wordsOf(s).filter((w) => !STOP.has(w)));

/**
 * The sentences of beat k that a beat before it already said: the same sentence
 * after whitespace and case, or one whose content words are mostly an earlier
 * sentence's — four or more shared, seven in ten of the shorter's. A sequential
 * draft reads the whole story so far and restates it; on the Mission Control
 * draft beats 5 to 8 said one realisation four times and nothing flagged it.
 * Stop words do not count: measured on all words, "That was the whole of it"
 * sat inside nine later sentences on the plane-crash draft and flagged each.
 */
export function restated(scenes: { beat: number; text: string }[], k: number): Restated[] {
  const scene = scenes.find((s) => s.beat === k);
  if (!scene) return [];
  const earlier = scenes.filter((s) => s.beat < k).flatMap((s) => sentencesOf(s.text).map((x) => ({ beat: s.beat, text: x, words: content(x) })));
  const out: Restated[] = [];
  for (const sentence of sentencesOf(scene.text)) {
    if (tokens(sentence) < 4) continue;
    const words = content(sentence);
    const near = (e: Set<string>) => {
      let shared = 0;
      for (const w of words) if (e.has(w)) shared++;
      return shared >= 4 && shared >= 0.7 * Math.min(words.size, e.size);
    };
    const hit = earlier.find((e) => normalise(e.text) === normalise(sentence) || near(e.words));
    if (hit) out.push({ beat: k, span: sentence, earlier_beat: hit.beat, earlier: hit.text });
  }
  return out;
}

/** Every run of 3 to 5 words inside quotation marks that the draft says three times or more, longest first. It does not know who said them. */
export function repeatedSpeech(story: string): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of story.matchAll(/[“"]([^“”"]{4,400})[”"]/g)) {
    const ws = wordsOf(m[1]);
    for (let n = 3; n <= 5; n++) for (let i = 0; i + n <= ws.length; i++) {
      const phrase = ws.slice(i, i + n).join(" ");
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  const kept = [...counts].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  // a shorter phrase inside one already kept is the same tic
  const out: { phrase: string; count: number }[] = [];
  for (const [phrase, count] of kept) if (!out.some((o) => o.phrase.includes(phrase) && o.count === count)) out.push({ phrase, count });
  return out;
}

export function slopScreen(scenes: { beat: number; text: string }[], pool: string, lexicon: string[]): SlopReport {
  const story = scenes.map((s) => s.text).join("\n\n");
  const sw = wordsOf(story), pw = wordsOf(pool);
  const proper = properNouns(story);
  const lex: { term: string; count: number }[] = [];
  for (const term of lexicon) {
    if (proper.has(term)) continue;
    const re = new RegExp(`\\b${escapeRe(term)}\\b`, "gi");
    const n = (story.match(re) ?? []).length;
    if (n) lex.push({ term, count: n });
  }
  lex.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  const hits = [...story.matchAll(NOT_BUT)];
  const poolHits = (pool.match(NOT_BUT) ?? []).length;
  const per10k = (n: number, w: number) => (w ? Math.round((n / w) * 10000 * 10) / 10 : 0);
  const ptri = trigrams(pw);
  const repeated_trigrams = [...trigrams(sw)].filter(([t, c]) => c >= 3 && !ptri.has(t)).map(([trigram, count]) => ({ trigram, count })).sort((a, b) => b.count - a.count || a.trigram.localeCompare(b.trigram));
  const repeated = repeatedSpeech(story);
  const paragraphs = scenes.map((s) => {
    const paras = s.text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    const lens = paras.map((x) => wordsOf(x).length);
    const single = paras.filter((x) => (x.match(/[.!?]["”’']?(\s|$)/g) ?? []).length <= 1).length;
    return { beat: s.beat, words: wordsOf(s.text).length, paragraphs: paras.length, mean_words: paras.length ? Math.round((lens.reduce((a, b) => a + b, 0) / paras.length) * 10) / 10 : 0, single_sentence_share: paras.length ? Math.round((single / paras.length) * 100) / 100 : 0 };
  });
  return {
    words: sw.length, pool_words: pw.length, lexicon: lex,
    not_but: { hits: hits.length, per_10k: per10k(hits.length, sw.length), pool_per_10k: per10k(poolHits, pw.length), examples: hits.slice(0, 8).map((m) => story.slice(Math.max(0, m.index! - 20), m.index! + m[0].length + 20).replace(/\s+/g, " ")) },
    trigrams: repeated_trigrams, paragraphs, repeated_speech: repeated,
  };
}
