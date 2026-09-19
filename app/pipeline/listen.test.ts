import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listenScreen, loadNarrationPool, profile } from "./listen.ts";

describe("listenability", () => {
  test("profile: sentence length, long share, numerals, quotes, the body, the listener, the first person, per 1k words", () => {
    const text = 'I felt my chest tighten. "Run," she said. There were 41 of them, or 42. ' + "You know the kind of silence I mean, the kind that makes your hands shake before your head catches up with why it should, and it went on and on and on for what felt like a long time indeed.";
    const p = profile(text);
    expect(p.words).toBe(53);                              // numerals are not words
    expect(p.sentence_mean).toBeCloseTo(13.3, 1);
    expect(p.long_sentence_share).toBe(0.25);
    expect(p.numerals_per_1k).toBeCloseTo(37.7, 1);        // 41, 42
    expect(p.quotes_per_1k).toBeCloseTo(37.7, 1);
    expect(p.body_per_1k).toBeCloseTo(56.6, 1);            // chest, hands, shake
    expect(p.you_per_1k).toBeCloseTo(18.9, 1);             // You; "your" is not the listener addressed
    expect(p.first_person_per_1k).toBeCloseTo(56.6, 1);    // I, my, I
  });

  test("the pool is every transcript under the directory, its intro cut, at the pace its timings give", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-narration-"));
    mkdirSync(join(dir, "chan"));
    const snip = (text: string, start: number, duration: number) => ({ text, start, duration });
    writeFileSync(join(dir, "chan", "a.json"), JSON.stringify({ videoId: "a", snippets: [snip("Welcome back, smash that like button. Let's dive into today's story. The first thing I remember was the silence.", 0, 30), snip("It went on for a long time.", 30, 30)] }));
    writeFileSync(join(dir, "chan", "b.json"), JSON.stringify({ videoId: "b", snippets: [snip("Nobody spoke. My hands shook.", 0, 20)] }));
    writeFileSync(join(dir, "chan", "notes.txt"), "not a transcript");
    const pool = loadNarrationPool(dir);
    expect(pool.videos).toBe(2);
    expect(pool.text).not.toContain("smash that like button");
    expect(pool.text).toContain("The first thing I remember was the silence.");
    // 15 + 5 words over 80 seconds
    expect(pool.wpm).toBe(15);
    const r = listenScreen([{ beat: 1, text: "Fifteen words of story here, said plainly, with my chest tight and nothing else in it." }, { beat: 2, text: "More." }], pool);
    expect(r.pool_wpm).toBe(15);
    expect(r.beats.map((b) => b.words)).toEqual([16, 1]);
    expect(r.minutes).toBeCloseTo(1.1, 1);
    expect(r.story.body_per_1k).toBeGreaterThan(0);
  });
});
