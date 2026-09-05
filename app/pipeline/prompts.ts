/**
 * Prompt templates. Static text only; the story, passages, seed and outline
 * are substituted at call time and are never checked. The vocabulary rule
 * draws over every template at load: nothing here may ask the model to
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

  outlineHead: `Below is a seed, a premise, and a ${RUN.vignetteWords}-word execution of it. Derive from them the story's underlying structure: the layer below the one that gets told. Nothing here is prose for the page.

Seed: {seed}

Premise: {premise}

<vignette>
{vignette}
</vignette>`,

  outlineAsk: `Write one section per job below, each in a <section name="..."> tag and each under ${RUN.outlineSectionWords} words.

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

  distill: `A setting file for a story pipeline holds, per domain, typed sections that a generation stage loads by name. Below is the setting's matrix, one domain's heading and frame, the sections to fill, and the reference material the domain is built from. Fill each named section from the reference material only.

## Matrix

{matrix}

### {heading}

Frame: {frame}

Sections to fill, one <section name="..."> tag each, holding a markdown list of lines:

{definitions}
{mask}
Every line is derived from the reference below and would survive the reference being removed: no citations, no URLs, no bracketed marks. Output only the tags.

<reference>
{reference}
</reference>`,

  distillDefinitions: {
    Mechanisms: `<section name="Mechanisms">: up to eight lines. Each is one sentence, nine to forty words, carrying a mechanism and a turn: state the process, name who it is done to, and imply what it costs or why there is no exit. No names, no designations. Do not open on this, that, it or here.`,
    Roles: `<section name="Roles">: positions a mechanism happens to, never identities: the deputy, the driver, the heir. One line per role, a noun phrase, with the office or instrument that defines the position.`,
    Institutions: `<section name="Institutions">: bodies. One line per body: what it issues, whom it answers to, what it cannot do.`,
    Instruments: `<section name="Instruments">: documents and forms. One line per instrument: its name, who issues it, who reads it, and the consequence of filing it late or wrong.`,
    Clocks: `<section name="Clocks">: intervals, deadlines, sunsets, handovers and rotations. One line per clock: the interval and what it governs.`,
    Places: `<section name="Places">: specific places. One line per place: what it does, never what it looks like.`,
    Vocabulary: `<section name="Vocabulary">: the setting's own words for things. One line per term: the term, a colon, and a gloss under twelve words.`,
  } as Record<string, string>,

  distillMask: `
Proper nouns belong only in the setting's Institutions and Sources sections. In every section you write here, name things by office, instrument or position: the ship, the intake, the levy, the registry.
`,
};

for (const [k, v] of Object.entries(T)) {
  if (typeof v === "string") checkTemplate(k, v);
  else for (const [k2, v2] of Object.entries(v)) checkTemplate(`${k}.${k2}`, v2);
}

type TemplateName = { [K in keyof typeof T]: (typeof T)[K] extends string ? K : never }[keyof typeof T];

export function fill(name: TemplateName, vars: Record<string, string>): string {
  return (T[name] as string).replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`template ${name}: no value for {${k}}`);
    return vars[k];
  });
}

/**
 * Head (examples, or the outline and vignette), then the setting's slice for
 * the stage, then the ask, then the hard rules last. Without a setting the
 * head and ask are joined exactly as before, so unrestricted prompts do not
 * change shape.
 */
export function compose(head: string, ask: string, setting?: { slice: string; hardRules: string }, sep = "\n\n"): string {
  if (!setting) return head + sep + ask;
  const parts = [head];
  if (setting.slice) parts.push(setting.slice);
  parts.push(ask);
  if (setting.hardRules) parts.push(setting.hardRules);
  return parts.join("\n\n");
}

export const TEMPLATES = T;
