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

/**
 * The beat ask (L1).
 *
 * A beat pair holds the brief, the schedule and the story so far fixed, and
 * varies only the prose of one beat. That is the point of it: at L2 two drafts
 * of one arm differ about twice as much as two arms do
 * (`evals/20260924-draft-variance-dominates.md`), and almost all of that is the
 * draft choosing a different story. A beat pair cannot.
 *
 * The axes are the story axes minus the ones a middle beat cannot answer.
 * `momentum` asks which story a listener would abandon, which is a question
 * about a whole; `hook` belongs to the first beat and `ending` to the last, so
 * each is asked only there. Presence, people, feeling, cost and clarity are
 * properties of the prose in front of the judge and are asked of every beat.
 */
export const BEAT_AXES = ["presence", "people", "feeling", "cost", "clarity"] as const satisfies readonly Axis[];

/**
 * The same eight questions, asked of a scene rather than of a story. Only the
 * noun changes, and `momentum` is dropped because it asks about a whole. A
 * judge shown `<scene_one>` and asked which *story* it preferred was answering
 * a question it had not been given.
 */
export const BEAT_RUBRIC: Readonly<Partial<Record<Axis, string>>> = {
  hook: "In the first half minute of listening, which scene makes it harder to stop?",
  presence: "In which scene does the thing the story is about arrive more fully, in the flesh, in the same place as the people, rather than only being inferred?",
  people: "In which scene are the people easier to tell apart by ear, and whose speech sounds like people talking?",
  feeling: "In which scene does the listener feel what the characters feel, as it happens?",
  cost: "In which scene does someone pay a cost that is felt and cannot be taken back?",
  ending: "Which of these would leave a listener sitting in the car after arriving?",
  clarity: "Heard once, read aloud at a steady pace, which scene is easier to follow, with fewer sentences a listener would lose the thread of?",
};

/** The axes a beat is asked, given where it sits in the draft. */
export const beatAxes = (n: number, last: number): Axis[] => [
  ...(n === 1 ? (["hook"] as Axis[]) : []),
  ...BEAT_AXES,
  ...(n === last ? (["ending"] as Axis[]) : []),
];

/** What the beat was planned to do, as the schedule entry reads. */
export type BeatPlan = { n: number; job: string; known: string; stakes: string };

export function beatPrompt(o: { plan: BeatPlan; last: number; soFar: string; one: string; two: string }): string {
  const axes = beatAxes(o.plan.n, o.last);
  const qs = axes.map((k) => `${k}: ${BEAT_RUBRIC[k]}`).join("\n");
  const soFar = o.soFar.trim()
    ? `Both versions come after this, which is the same for both and is not being judged:\n\n<story_so_far>\n${o.soFar}\n</story_so_far>\n\n`
    : "This is the opening of the story; nothing comes before it.\n\n";
  return `Two versions of one scene from a story written to be read aloud by one narrator on a long-form story channel. They were written to the same plan, for the same place in the same story, and differ only in their prose.

${soFar}The scene was planned to do this:

<plan>
${o.plan.job}
By its end the listener knows: ${o.plan.known}
What is at stake: ${o.plan.stakes}
</plan>

<scene_one>
${o.one}
</scene_one>

<scene_two>
${o.two}
</scene_two>

Judge them as a listener who is ${o.plan.n === 1 ? "deciding whether to keep listening" : `already ${o.plan.n - 1} scene${o.plan.n === 2 ? "" : "s"} in`}. For each question answer One, Two or Tie, and score each scene from 1 (poor) to 5 (as good as the best you have heard), with one sentence of evidence that names a moment from each. The scores are absolute: both may score low, or both high. Then give an overall call, One, Two or Tie, and two sentences on what the weaker one would need.

${qs}

Output exactly this shape and nothing else:
<verdict>
<axis name="${axes[0]}" one="N" two="N">One|Two|Tie</axis> ...one line per axis in the order given, each followed by <why>one sentence</why>
<overall>One|Two|Tie</overall>
<needs>two sentences</needs>
</verdict>`;
}

/** A beat reply is complete when it answered the axes that beat was asked. */
export const beatComplete = (p: Pick<Parsed, "axes" | "overall">, n: number, last: number): boolean =>
  beatAxes(n, last).every((a) => p.axes[a] !== undefined) && ["ours", "source", "tie"].includes(p.overall);

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
