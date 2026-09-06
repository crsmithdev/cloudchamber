import { describe, expect, test } from "bun:test";
import { slopScreen } from "./slop.ts";

const pool = "She walked to the recorder's office and asked for the index. The clerk said no. Nothing here is strange, and the ledger holds. The morning was cold.";

describe("slop screen", () => {
  test("counts lexicon hits, not-X-but-Y, repeated trigrams absent from the pool, and paragraph shape; proper nouns excluded", () => {
    const scene1 = "The tapestry hummed. A testament to nothing, the tapestry hummed again.\n\nIt wasn't grief. It was arithmetic. Not a confession but a half of one.";
    const scene2 = "Tapestry Lane ran to the river. The tapestry hummed a third time. On Tapestry Lane nobody spoke.\n\nShe counted. She counted again.";
    const r = slopScreen([{ beat: 1, text: scene1 }, { beat: 2, text: scene2 }], pool, ["tapestry", "testament", "hummed", "a testament to"]);
    // tapestry is capitalised twice (Tapestry Lane) and lowercase three times, so it stays; testament and hummed count
    expect(r.lexicon).toEqual(expect.arrayContaining([{ term: "tapestry", count: 5 }, { term: "hummed", count: 3 }, { term: "testament", count: 1 }, { term: "a testament to", count: 1 }]));
    expect(r.not_but.hits).toBe(2);
    expect(r.not_but.pool_per_10k).toBe(0);
    expect(r.not_but.per_10k).toBeGreaterThan(0);
    expect(r.trigrams.map((t) => t.trigram)).toContain("the tapestry hummed");
    expect(r.paragraphs.map((p) => [p.beat, p.paragraphs])).toEqual([[1, 2], [2, 2]]);
    expect(r.paragraphs[1].single_sentence_share).toBe(0);
    expect(r.words).toBeGreaterThan(30);
    expect(r.pool_words).toBe(pool.toLowerCase().match(/[a-z][a-z'’-]*/g)!.length);
  });

  test("a word that is a proper noun in the draft is not a lexicon hit", () => {
    const r = slopScreen([{ beat: 1, text: "Whisper went home. Whisper slept. The dog barked." }], pool, ["whisper", "barked"]);
    expect(r.lexicon.map((l) => l.term)).toEqual(["barked"]);
  });
});
