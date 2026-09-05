/**
 * Prompt templates. Static text only; the story, passages, seed and outline
 * are substituted at call time and are never checked. The vocabulary rule
 * runs over every template at load: nothing here may ask the model to
 * reason, think, or account for how it arrived at anything. Fable's
 * safeguard refuses that shape with zero output.
 */
import { RUN } from "./config.ts";

const FORBIDDEN = /\b(reason|reasoning|reasons|think|thinking|chain of thought|how you arrived|how it was reached|how you reached)\b/i;

export function checkTemplate(name: string, text: string): void {
  const m = FORBIDDEN.exec(text);
  if (m) throw new Error(`prompt template ${name} violates the vocabulary rule: "${m[0]}"`);
}

const T = {
  themes: `A theme is one sentence, under 30 words, carrying a mechanism and a turn. It is true of the story and does not occur in it. State the process, name who it is done to, and imply what it costs or why there is no exit. No names, no designations, nothing that ties the sentence to this story. Readable with the story unavailable; do not open on this, that, it or here.
{fewshot}
Read the story below in full. Then write up to four themes it embodies, each in its own <theme> tag. Fewer is fine. Output only the tags.

<story>
{story}
</story>`,

  themesFewshot: `
Examples of the shape, from work already kept:
{lines}
`,

  redundancy: `A bank of one-sentence themes must not say the same thing twice. Below is a candidate and the banked themes nearest to it. If the candidate restates the same mechanism as one of them, output \`same:<id>\` with that theme's id. Otherwise output \`different\`. Output only that.

Candidate: {candidate}

{banked}`,

  premisesAsk: `Generate five premises for a {genre} story under this seed:

{seed}

Each premise goes in a <premise> tag containing a <text> (one paragraph, under ${RUN.premiseWords} words, the pitch itself) and a <probability>: your estimate of how likely this premise is as a response to this seed. Sample from the tail of the distribution: every probability must be under ${RUN.ceiling.toFixed(2)}. The premise most writers would reach for given this seed belongs to someone else's batch, not this one. Be bold and unconventional, even to the point of absurdity. Output only the five tags.`,

  executeAsk: `Seed: {seed}

Premise: {premise}

Write ${RUN.vignetteWords} words of this story, in a <vignette> tag. Not a synopsis and not the opening unless the opening is where the story is: one execution, in the form the premise implies, that shows whether it can be written. Under ${RUN.vignetteWords + 50} words. Output only the tag.`,

  outline: `Below is a seed, a premise, and a ${RUN.vignetteWords}-word execution of it. Derive from them the story's underlying structure: the layer below the one that gets told. Nothing here is prose for the page.

Seed: {seed}

Premise: {premise}

<vignette>
{vignette}
</vignette>

Write one section per job below, each in a <section name="..."> tag and each under ${RUN.outlineSectionWords} words.

<section name="debt audit">: State the single impossibility the story buys, in one sentence. Then re-derive everything the premise and vignette assert from that one purchase. Anything that cannot be derived is a second impossibility wearing a metaphor: name it, cut it, and replace it with something derivable, at no extra cost.

<section name="arithmetic">: Settle every number and every sum the reader will be asked to do, and settle what the unit is. Dates, durations, counts, rates. Where the premise is vague, decide.

<section name="custody">: Who holds which half of the evidence, why neither half is evidence alone, and why nobody connects them. Not characters: custody.
{settingJobs}
Output only the tags.`,

  settingJob: `
<section name="{name}">: {description}
`,

  head: `Below is a story's derived structure and the ${RUN.vignetteWords}-word execution it came from.

{outline}

<vignette>
{vignette}
</vignette>
`,

  jobs: `
Name two vignettes to write next, each defined by its job: the one thing about the structure above it tests. The two jobs must be different things; if two vignettes test the same thing one is padding. Output two <job> tags, each one sentence under 40 words naming the job and the scene that does it. Nothing else.`,

  context: `
Write one vignette in a <vignette> tag, under ${RUN.vignetteWords + 50} words. Its job: {job}

It is an execution, not discovery: the structure above has already settled the story. Output only the tag.`,

  ending: `
Write the ending, in an <ending> tag: the last beat, derived from the arithmetic and custody sections above. Under ${RUN.endingWords} words. Prose or document form as the structure implies. Output only the tag.`,
};

for (const [k, v] of Object.entries(T)) checkTemplate(k, v);

export function fill(name: keyof typeof T, vars: Record<string, string>): string {
  return T[name].replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`template ${name}: no value for {${k}}`);
    return vars[k];
  });
}

/** Examples verbatim, then the setting body, then the ask, then the hard rules last. */
export function compose(examples: string[], ask: string, setting?: { body: string; hardRules: string }): string {
  const parts = [examples.join("\n\n")];
  if (setting?.body) parts.push(setting.body);
  parts.push(ask);
  if (setting?.hardRules) parts.push(setting.hardRules);
  return parts.join("\n\n");
}

export const TEMPLATES = T;
