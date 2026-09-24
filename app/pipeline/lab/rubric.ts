/**
 * The judge ask, and how a reply is read.
 *
 * Every word here is `evals/judge.py`'s and must stay so. The panel judged the
 * runs of 22 and 23 September under this text; change it and the stored passes
 * stop being comparable with anything judged after, which is the one thing a
 * floor cached per baseline depends on. `rubric.test.ts` reads the parser
 * against 252 real replies and the verdicts `judge.py` recorded for them.
 *
 * The two rules that make a pass mean anything:
 *
 * **Blind and both ways round.** The drafts are Story One and Story Two with no
 * labels, and the order swaps on alternate passes. Most judges take whichever
 * story they read first, so a result that does not hold in both orders is the
 * order talking.
 *
 * **A truncated reply is a failed call, never a verdict.** A thinking model can
 * spend its budget before it answers. `complete` is the test, and a pass that
 * fails it is run again rather than counted.
 */
import { AXES, type Axis, type Side } from "./pool.ts";

/** The eight questions, in the order they are asked. */
export const RUBRIC: readonly (readonly [Axis, string])[] = [
  ["hook", "In the first two minutes of listening, which story makes it harder to stop?"],
  ["presence", "In which story does the thing the story is about arrive more fully, in the flesh, in the same place as the people, rather than only being inferred?"],
  ["people", "Whose people are easier to tell apart by ear, and whose speech sounds like people talking?"],
  ["feeling", "In which story does the listener feel what the characters feel, as it happens?"],
  ["cost", "In which story does someone pay a cost that is felt and cannot be taken back?"],
  ["ending", "Which ending would leave a listener sitting in the car after arriving?"],
  ["clarity", "Heard once, read aloud at a steady pace, which story is easier to follow, with fewer sentences a listener would lose the thread of?"],
  ["momentum", "Which story would fewer listeners abandon in the middle?"],
] as const;

/** The system line every judge call carries. */
export const JUDGE_SYSTEM = "You judge stories for listeners. Output only the tags asked for.";

export function judgePrompt(one: string, two: string): string {
  const qs = RUBRIC.map(([k, q]) => `${k}: ${q}`).join("\n");
  return `Two stories written to be read aloud by one narrator on a long-form story channel, given here as plain transcripts. One or both may carry transcription errors (misheard words, missing punctuation); ignore those and judge what a listener would hear.

<story_one>
${one}
</story_one>

<story_two>
${two}
</story_two>

Judge them as a listener who has forty minutes in the car and many channels to choose from. For each question answer One, Two or Tie, and score each story on that question from 1 (poor) to 5 (as good as the best you have heard), with one sentence of evidence that names a moment from each story. The scores are absolute: two stories may both score low, or both high. Then give an overall call, One, Two or Tie, and three sentences on what the weaker one would need.

${qs}

Output exactly this shape and nothing else:
<verdict>
<axis name="hook" one="N" two="N">One|Two|Tie</axis> ...one line per axis in the order given, each followed by <why>one sentence</why>
<overall>One|Two|Tie</overall>
<needs>three sentences</needs>
</verdict>`;
}

/** Which side a One-or-Two answer names, once the reading order is undone. */
export function side(v: string, flipped: boolean): Side {
  const t = v.trim().toLowerCase();
  if (t.startsWith("tie")) return "tie";
  const one = t.startsWith("one");
  return flipped ? (one ? "source" : "ours") : (one ? "ours" : "source");
}

export type Parsed = {
  axes: Partial<Record<Axis, Side>>;
  scores: Partial<Record<Axis, { ours: number; source: number }>>;
  whys: string[];
  overall: Side | "?";
  needs: string;
  raw: string;
};

const AXIS_RE = /<axis name="(\w+)"([^>]*)>\s*(\w+)/g;
const SCORE_RE = /(one|two)="(\d)"/g;

/** Read one reply. Anything the model added around the tags is ignored; anything missing shows as missing. */
export function parseVerdict(out: string, flipped: boolean): Parsed {
  const axes: Parsed["axes"] = {};
  const scores: Parsed["scores"] = {};
  for (const m of out.matchAll(AXIS_RE)) {
    const name = m[1] as Axis;
    axes[name] = side(m[3]!, flipped);
    const got: Record<string, number> = {};
    for (const s of m[2]!.matchAll(SCORE_RE)) got[s[1]!] = Number(s[2]);
    if (Object.keys(got).length === 2) {
      scores[name] = flipped
        ? { ours: got.two!, source: got.one! }
        : { ours: got.one!, source: got.two! };
    }
  }
  const ov = /<overall>\s*(\w+)/.exec(out);
  const needs = /<needs>([\s\S]*?)<\/needs>/.exec(out);
  return {
    axes,
    scores,
    whys: [...out.matchAll(/<why>([\s\S]*?)<\/why>/g)].map((m) => m[1]!.trim()),
    overall: ov ? side(ov[1]!, flipped) : "?",
    needs: needs ? needs[1]!.trim() : "",
    raw: out,
  };
}

/** Every axis answered and an overall given. Anything less is a failed call. */
export const complete = (p: Pick<Parsed, "axes" | "overall">): boolean =>
  Object.keys(p.axes).length === AXES.length && ["ours", "source", "tie"].includes(p.overall);

/** Whether a pass simply took the story it read first. A judge that always does carries no weight. */
export const followedOrder = (overall: Side | "?", flipped: boolean): boolean =>
  overall === (flipped ? "source" : "ours");
