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
Every line is specific to this setting: it names or rests on a body, instrument, statute, place, date or figure in the reference below, and it belongs to this domain's frame, not a neighbouring one. A line that would be true of any city, any empire or any war is not written; fewer lines is the right answer when the reference runs out. Every line would survive the reference being removed: no citations, no URLs, no bracketed marks. Output only the tags.

<reference>
{reference}
</reference>`,

  distillDefinitions: {
    Mechanisms: `<section name="Mechanisms">: up to ${RUN.distillCaps.Mechanisms} lines. Each is one sentence, nine to forty words, carrying a mechanism and a turn: state the process, name who it is done to, and imply what it costs or why there is no exit. No names, no designations. Do not open on this, that, it or here.`,
    Roles: `<section name="Roles">: up to ${RUN.distillCaps.Roles} lines. Positions a mechanism happens to, never identities: the deputy, the driver, the heir. One line per role, a noun phrase, with the office or instrument that defines the position.`,
    Institutions: `<section name="Institutions">: up to ${RUN.distillCaps.Institutions} lines. Bodies. One line per body: what it issues, whom it answers to, what it cannot do.`,
    Instruments: `<section name="Instruments">: up to ${RUN.distillCaps.Instruments} lines. Documents and forms. One line per instrument: its name, who issues it, who reads it, and the consequence of filing it late or wrong.`,
    Clocks: `<section name="Clocks">: up to ${RUN.distillCaps.Clocks} lines. Intervals, deadlines, sunsets, handovers and rotations. One line per clock: the interval and what it governs.`,
    Places: `<section name="Places">: up to ${RUN.distillCaps.Places} lines. Specific places. One line per place: what it does, never what it looks like.`,
    Vocabulary: `<section name="Vocabulary">: up to ${RUN.distillCaps.Vocabulary} lines. The setting's own words for things. One line per term: the term, a colon, and a gloss under twelve words.`,
  } as Record<string, string>,

  distillMask: `
Proper nouns belong only in the setting's Institutions and Sources sections. In every section you write here, name things by office, instrument or position: the ship, the intake, the levy, the registry.
`,

  // --- checking and drafting (docs/specs/2026-09-05-drafting-pipeline.md) ----

  /** The brief every checker reads. Built by the check stage from the draw's artifacts. */
  briefBlock: `<seed>{seed}</seed>

<premise>{premise}</premise>

<outline>
{outline}
</outline>

<vignette name="chosen">
{vignette}
</vignette>

<vignette name="context-1">
{context1}
</vignette>

<vignette name="context-2">
{context2}
</vignette>

<ending>
{ending}
</ending>`,

  findingShape: `Each finding goes in a <finding> tag containing: <span> (a verbatim quote from the brief, under ${RUN.spanWords} words), <statement> (what the span asserts, one sentence), <result> (one of: supported | contradicted | unverifiable | contradicts:<a second verbatim quote> | underived), <evidence> (the second quote, the sum written out, a URL and quoted line, or none), <invalidates> (which outline section would have to change if the finding stands: {sections} | none), <replacement> (one factual sentence in the outline's register that would hold in its place; not dialogue, not a scene).`,

  checkDerivation: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending. The debt audit section claims to derive everything from one impossibility.

{brief}

State the single impossibility the debt audit buys, in an <impossibility> tag, one sentence. Then check every assertion in the vignettes and ending against that derivation, and do every sum in the arithmetic section. Report each assertion that does not follow from the one impossibility, and each sum that does not add up.

{findingShape}

After the findings, an <examined> tag listing each assertion and each sum checked, one per line, whether or not it produced a finding. At most 8 findings. Under 1000 words in total.`,

  checkLedger: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending.

{brief}

First, extract from the outline every settled fact into a <ledger> tag, one per line, each line opening with its category: time (dates, durations, order), detail (names, quantities, appearance), knowledge (who knows what), custody (who holds which document or object), world (rules), perspective. Then check each vignette and the ending against the ledger, and against each other, pairwise. Report each contradiction.

{findingShape}

After the findings, an <examined> tag naming each pair compared (ledger×chosen, ledger×context-1, chosen×ending, and so on). At most 8 findings. Under 1100 words in total.`,

  checkStructure: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending.

{brief}

Answer seven questions about the brief, each as present or absent, each with one verbatim quote from the brief that settles it. Output one <question name="..."> tag per question containing <answer>present|absent</answer> and <quote>...</quote>.

threat: something in the brief would harm or endanger someone in it.
category-violation: a boundary is violated, between living and dead, self and other, inside and outside, one thing and another. Not: something is disgusting.
agency: there is an unresolved question of what is acting, something acting with no visible actor, or an actor-shaped absence.
obscurity: what is withheld is withheld deliberately and legibly, leaving something for the imagination to enlarge. Absent means the brief is merely underspecified.
thickening: the brief contains material for development beyond its own statement, rather than a single image or a single reveal.
spectacle: the brief's entire payload is a shock, a gross-out or a final twist.
consequence: the point of departure from the actual has its consequences taken seriously.

Output only the seven tags. Under 350 words.`,

  checkResemblance: `Below is a story brief, and below that an enumerated list of premises editors report seeing too often.

{brief}

<list>
{list}
</list>

Match the brief against the list. For each list entry the brief matches, output a <match> tag containing <entry> (the list line, verbatim) and <span> (the quote from the brief that matches it, under ${RUN.spanWords} words). Then output one <nearest> tag naming the nearest published story, novel or film: <title>, <author>, and <shared> (one sentence stating what the brief shares with it). At most 4 matches. Under 300 words.`,

  claimsExtract: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending.

{brief}

Extract only claims about the actual world that carry a quantity or a rule a published source could confirm or deny: a price, a rate, a count, a date, a duration, a distance, a procedure, a statute, a relation between two named places. That a place, institution, product or person exists is not a claim. Skip everything the story invents. Each claim goes in a <claim> tag containing <span> (verbatim quote, under ${RUN.spanWords} words) and <statement> (the claim as one checkable sentence). At most 12 claims. Under 500 words.`,

  claimsVerifyWorld: `Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Search for a published source that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (a URL and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold; otherwise none). Under 120 words.`,

  claimsVerifyReference: `{reference}

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the reference material above that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the file name and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold; otherwise none). Under 120 words.`,

  constraints: `<constraints>
{constraints}
</constraints>`,

  repairVignette: `Below is a ${RUN.vignetteWords}-word execution of a story and a set of constraints that hold.

<vignette>
{vignette}
</vignette>

{constraints}

Rewrite it in a <vignette> tag so that every line of the constraints holds, keeping its people, place, form and length. Under ${RUN.vignetteWords + 50} words. Output only the tag.`,

  repairOutlineHead: `Below is a seed, a premise, a ${RUN.vignetteWords}-word execution of it, and a set of constraints that hold. Derive from them the story's underlying structure: the layer below the one that gets told. Nothing here is prose for the page.

Seed: {seed}

Premise: {premise}

<vignette>
{vignette}
</vignette>

{constraints}`,

  repairEnding: `Below is a story's derived structure, the ending written from it, and a set of constraints that hold.

{outline}

<ending>
{ending}
</ending>

{constraints}

Rewrite the ending in an <ending> tag so that every line of the constraints holds, keeping its people, place, form and length. Under ${RUN.endingWords} words. Output only the tag.`,

  schedule: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending. Below that, the story's configuration.

{brief}

<config>
target length: {words} words
beats: {beatsLine}
{formLines}
ending: {endingLine}
</config>

Derive the story's schedule: the layer between the outline and the prose, which settles what the reader knows at each point and what is still withheld. Output a <form> tag with four lines: tense, person, chronology, container. Then one <beat n="K" words="N"> tag per beat containing <job> (one sentence, what the beat does and where it is set), <known> (what the reader knows by its end, one or two sentences), <withheld> (each thing still withheld after this beat, with the beat number that reveals it, one per line as \`item — beat N\`; the line \`none\` when nothing is), <stakes> (one sentence), <absorbs> (chosen | context-1 | context-2 | ending | none: the brief vignette this beat takes its material from, if any; each may be named by at most one beat). Output only the tags. Under 1000 words.`,

  sceneMaterial: `<material>
{material}
</material>

The material above is the brief's own execution of this beat; use it as far as it serves the schedule, rewritten to sit in the story.`,

  sceneAsk: `Write beat {n} of the story, in a <scene> tag. Its job: {job} By its end the reader knows: {known} Still withheld after it: {withheld} Form: {form}. Under {cap} words. It is an execution, not discovery: the schedule above has settled the story.{constraintLine} Output only the tag.`,

  screenLedger: `<ledger>
{ledger}
</ledger>

{previous}<scene n="{n}">
{scene}
</scene>

Check the scene against the ledger and against the previous scene. Report each contradiction in a <finding> tag containing <span> (verbatim quote from the scene, under ${RUN.spanWords} words), <statement> (one sentence), <result> (contradicts:<verbatim quote of the ledger line or previous-scene span>), <invalidates> (the beat number, or none), <replacement> (one positive sentence that would hold). Then an <examined> tag naming what was compared. At most 6 findings. Under 500 words.`,

  screenStructure: `<beat n="{n}">
job: {job}
withheld after this beat: {withheld}
</beat>

<scene n="{n}">
{scene}
</scene>

Answer five questions about the scene, each as present or absent, each with one verbatim quote that settles it. Output one <question name="..."> tag per question containing <answer>present|absent</answer> and <quote>...</quote>.

theme-stated: the narrator or a character states what the story means or what its lesson is.
bodily-emotion: an emotion is conveyed as a bodily sensation (a tightening chest, a cold stomach, breath catching).
withheld-revealed: an item listed as withheld after this beat is stated in the scene as a fact the reader now knows. Implication and foreshadowing are not reveals; the quote must contain the statement.
protagonist-never-wrong: the point-of-view character is not allowed to be mistaken, unfair or at fault anywhere in the scene.
{fifth}

Output only the five tags. Under 250 words.`,

  screenResolved: `resolved: the scene settles a question the schedule keeps open for a later beat.`,
  screenResolvesEverything: `resolves-everything: no question the story raised is left open at the end of the scene.`,
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
