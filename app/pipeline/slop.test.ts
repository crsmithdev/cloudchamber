import { describe, expect, test } from "bun:test";
import { quotedTics, restated, slopScreen } from "./slop.ts";

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

  test("restated: a sentence a beat says again, word for word or by its content words; stop words alone never match", () => {
    const scenes = [
      { beat: 1, text: "It is not an object. It is a practice. She sat. Kovach wrote the fuel numbers into the notebook with his left hand, the letters going downhill, and said the sweep cycle was holding. That was the whole of it." },
      { beat: 2, text: "Eleven is how many of us there are. She sat. It is a practice. That was the whole of it, and the ingot cooled in the dirt by noon with a dirty crust on the bottom." },
      { beat: 3, text: "Kovach wrote something with his left hand, the letters going downhill. Eleven is how many of us there are. She checked the scale ring twice and the gain and the tilt, and all of it was where she had left it. Something new." },
    ];
    expect(restated(scenes, 1)).toEqual([]);
    // "She sat." is three words: never a repeat. "It is a practice." is four, exact
    expect(restated(scenes, 2).map((r) => [r.span, r.earlier_beat])).toEqual([["It is a practice.", 1]]);
    // the long sentence holding "that was the whole of it" shares only stop words with it, so it is not a repeat
    expect(restated(scenes, 2).some((r) => r.span.startsWith("That was the whole"))).toBe(false);
    const r3 = restated(scenes, 3);
    expect(r3.map((r) => [r.span, r.earlier_beat])).toEqual([
      ["Kovach wrote something with his left hand, the letters going downhill.", 1],   // six content words shared of eight
      ["Eleven is how many of us there are.", 2],
    ]);
  });

  test("a word that is a proper noun in the draft is not a lexicon hit", () => {
    const r = slopScreen([{ beat: 1, text: "Whisper went home. Whisper slept. The dog barked." }], pool, ["whisper", "barked"]);
    expect(r.lexicon.map((l) => l.term)).toEqual(["barked"]);
  });
});

describe("tics", () => {
  test("a phrase said three times inside quotes is a tic; narration and two sayings are not", () => {
    const story = `"Bet you it holds," Caleb said.\n\n"Bet you it holds," he said again at the door.\n\nThe bet you it holds line was his, and he knew it.\n\n"Bet you it holds," he said, one last time.\n\n"Mind the step," said Nell. "Mind the step," she said later.`;
    const tics = quotedTics(story);
    expect(tics.map((t) => [t.phrase, t.count])).toEqual([["bet you it holds", 3]]);
  });

  test("a draft with no repeated quoted phrase has none", () => {
    expect(quotedTics(`"One thing," she said. "Another thing entirely," he said.`)).toEqual([]);
  });
});
