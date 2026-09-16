/**
 * Prompt templates. Static text only; the story, passages, seed and outline
 * are substituted at call time and are never checked. The vocabulary rule
 * draws over every template at load: nothing here may ask the model to
 * reason, think, or account for how it arrived at anything. Fable's
 * safeguard refuses that shape with zero output.
 */
import { BANDS, RUN } from "./config.ts";

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

Each premise goes in a <premise> tag containing a <text> (one paragraph, under ${RUN.premiseWords} words, the pitch itself) and a <probability>: your estimate of how likely this premise is as a response to this seed. {sampling} Output only the five tags.`,

  /** One per sampling mode: the band, and the register that goes with it. */
  samplingAsk: {
    tail: `Sample from the tail of the distribution: every probability must be under ${BANDS.tail.ceiling.toFixed(2)}. The premise most writers would reach for given this seed belongs to someone else's batch, not this one. Be bold and unconventional, even to the point of absurdity.`,
    "off-centre": `Sample off the centre of the distribution: every probability must be between ${BANDS["off-centre"].floor.toFixed(2)} and ${BANDS["off-centre"].ceiling.toFixed(2)}. Not the premise most writers would reach for first, but one that stays recognisably inside the tradition this seed belongs to.`,
    standard: `Sample from the centre of the distribution: every probability must be over ${BANDS.standard.floor.toFixed(2)}. The strongest conventional treatment of this seed: the premise a good writer would reach for and execute well, not an unusual one.`,
  },

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

  /** The four lists, defined once and shared by both distill passes and by nothing else. */
  listDefinitions: `<bodies>: organisations, offices, orders, departments and courts. What it issues or decides, whom it answers to, and what it cannot do.
<events>: something that happened, on a date — a disaster, a closure, a founding, a strike, a judgment, a removal, an exodus. What happened and when, then what it changed. An event has actors and a before and after. The date a rule took effect is not an event: a commencement belongs on the instrument it commences.
<instruments>: documents, devices, drugs, weapons and rites. What it does, who holds it, and what follows from having it, losing it or undergoing it.
<places>: named places. What the place does, and what it costs to be there. Never what it looks like.
<terms>: the setting's own word for a thing, then the separator, then a gloss under twelve words.`,

  entryShape: `Every entry is one line in one shape: the name, then a space, an em dash and a space, then what it does; then what it cannot do, or what follows from it. Under {words} words. Any interval, price, count or deadline belongs in that second clause, on the thing that keeps it.

Where the thing reaches somebody, the second clause says who, and what they lose or cannot do; where it reaches nobody, it says what cannot happen without it.

Every entry names something this setting names: a body, an instrument, a place, a rite, a term, a date or a figure that appears in the material below. An entry that would be true of any city, any empire or any war is not written, and fewer entries is the right answer when the material runs out. No citations, no URLs, no bracketed marks.`,

  distillMap: `A setting file for a story pipeline holds five lists of named things. Below is one of its reference files. Take from the file every entry it can support, and nothing it cannot.
{matrix}
The file's subject: {topic}

Output one tag per list, each holding <entry> tags, at most {n} entries per list. A list the file says nothing about gets an empty tag.

{listDefinitions}

{entryShape}

<reference>
{reference}
</reference>`,

  keptElsewhere: `
Another list of this setting has already taken the things below. Drop a candidate that is one of them; the setting names each thing once.

{names}
`,

  distillTrim: `Each entry below is over the length a setting file allows. Cut each one under {words} words, the bracketed source aside.

Keep the name before the dash exactly as it is, and keep the bracketed source exactly as it is. Cut words, not facts: drop a qualifier, a date already implied, a second example, a clause that repeats the name. Do not add anything, and do not merge two entries.

Output one <{listl}> tag holding one <entry> tag per entry below, in the same order.

{entries}`,

  distillReduce: `A setting file for a story pipeline holds five lists of named things. Below is every candidate entry gathered for its {list} list, each with the reference file it came from in brackets. Choose the ones that stay.
{matrix}
Keep at most {cap}. Drop a candidate that repeats another's thing, and where two cover the same ground keep the one that is more specific about what it does or what follows from it. Prefer entries that carry a number, a name or a consequence. Spread the keep across subjects rather than taking every entry from one file. Rewrite an entry only to fix its shape or to cut it under {words} words; do not invent, merge facts from two candidates, or add anything the candidates do not say.

Output one <{listl}> tag holding the kept <entry> tags, in the order you would have someone read them. Keep the bracketed source on the end of every entry, exactly as it appears above, so the entry can be traced back to the file it came from. Count the words of every entry before you output it: each is under {words} words, the bracket aside.
{kept}

{entryShape}

Candidates:

{candidates}`,

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

  findingShape: `Each finding goes in a <finding> tag containing: <span> (a verbatim quote from the brief, under ${RUN.spanWords} words), <statement> (what the span asserts, one sentence), <result> (one of: supported | contradicted | unverifiable | contradicts:<a second verbatim quote> | underived), <evidence> (the second quote, the sum written out, a URL and quoted line, or none), <invalidates> (which outline section would have to change if the finding stands: {sections} | none), <replacement> (one factual sentence in the outline's register that would hold in its place; not dialogue, not a scene), <patch> (the span rewritten so the finding no longer holds, in the voice and register of the text it came from and no longer than the span, ready to stand in its place word for word; or none when the fix needs more than that span).`,

  checkDerivation: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending. The debt audit section claims to derive everything from one impossibility.

{brief}

State the single impossibility the debt audit buys, in an <impossibility> tag, one sentence. Then check every assertion in the vignettes and ending against that derivation, and do every sum in the arithmetic section. Report each assertion that does not follow from the one impossibility, and each sum that does not add up.

{findingShape}

After the findings, an <examined> tag listing each assertion and each sum checked, one per line, whether or not it produced a finding. At most 8 findings. Under 1000 words in total.`,

  ledgerExtract: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending.

{brief}

Extract from the outline every settled fact into a <ledger> tag, one per line, each line opening with its category: time (dates, durations, order), detail (names, quantities, appearance), knowledge (who knows what), custody (who holds which document or object), world (rules), perspective. These lines are the contract the brief is held to for the rest of its life, so state each one so it can be read against prose by someone who has not seen this outline. Under 600 words. Output only the tag.`,

  checkLedger: `Below is a ledger of a story's settled facts, then the brief itself: a seed, a premise, an outline in three sections, three vignettes and an ending.

{ledger}

{brief}

The ledger is fixed. It was settled for this brief and every repair of it, and where the prose and the ledger disagree it is the prose that is wrong. Check each vignette and the ending against the ledger, and against each other, pairwise. Report each contradiction.

{findingShape}

After the findings, an <examined> tag naming each pair compared (ledger×chosen, ledger×context-1, chosen×ending, and so on). At most 8 findings. Under 1100 words in total.`,

  pinnedLedger: `<ledger>
{ledger}
</ledger>`,

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

  claimsExtractSetting: `Below is a story brief: a seed, a premise, an outline in three sections, three vignettes and an ending.

{brief}

Extract only claims about the setting the story is set in, that carry a quantity or a rule the setting itself settles: a price, a rate, a count, a date, a duration, a term of service, an office, a rite, an instrument, or a relation between two bodies. That a place, institution or person exists is not a claim. Skip what the story invents for itself alone, and skip anything that would hold in any world. Each claim goes in a <claim> tag containing <span> (verbatim quote, under ${RUN.spanWords} words) and <statement> (the claim as one checkable sentence). At most 12 claims. Under 500 words.`,

  claimsVerifyWorld: `Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Search for a published source that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (a URL and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold; otherwise none). Under 120 words.`,

  claimsVerifyReference: `{reference}

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the reference material above that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the file name and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold; otherwise none). Under 120 words.`,

  claimsVerifySetting: `<setting>
{reference}
</setting>

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the setting above that confirms or denies it. The setting is the whole authority: a claim it does not settle is unverifiable, not wrong. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the heading it sits under and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold; otherwise none). Under 120 words.`,

  constraints: `<constraints>
{constraints}
</constraints>`,

  settled: `<settled>
{settled}
</settled>

The settled lines were accepted in earlier rounds of this brief and still
hold. Keep every one of them true. Do not restate them and do not undo them to
satisfy a constraint above.`,

  repairVignette: `Below is a ${RUN.vignetteWords}-word execution of a story and a set of constraints that hold.

<vignette>
{vignette}
</vignette>

{constraints}

{ledger}

{settled}

Rewrite it in a <vignette> tag so that every line of the constraints holds, keeping its people, place, form and length. Under ${RUN.vignetteWords + 50} words. Output only the tag.`,

  repairOutlineHead: `Below is a seed, a premise, a ${RUN.vignetteWords}-word execution of it, and a set of constraints that hold. Derive from them the story's underlying structure: the layer below the one that gets told. Nothing here is prose for the page.

Seed: {seed}

Premise: {premise}

<vignette>
{vignette}
</vignette>

{constraints}

{ledger}

{settled}`,

  repairEnding: `Below is a story's derived structure, the ending written from it, and a set of constraints that hold.

{outline}

<ending>
{ending}
</ending>

{constraints}

{ledger}

{settled}

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

Check the scene against the ledger and against the previous scene. Report each contradiction in a <finding> tag containing <span> (verbatim quote from the scene, under ${RUN.spanWords} words), <statement> (one sentence), <result> (contradicts:<verbatim quote of the ledger line or previous-scene span>), <invalidates> (the beat number, or none), <replacement> (one positive sentence that would hold), <patch> (the span rewritten in the scene's own voice so the contradiction is gone, no longer than the span, ready to stand in its place word for word; or none when the fix needs more than that span). Then an <examined> tag naming what was compared. At most 6 findings. Under 500 words.`,

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

export type TemplateName = { [K in keyof typeof T]: (typeof T)[K] extends string ? K : never }[keyof typeof T];

export function fill(name: TemplateName, vars: Record<string, string>): string {
  return (T[name] as string).replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`template ${name}: no value for {${k}}`);
    return vars[k];
  });
}

/**
 * Head (examples, or the outline and vignette), then the setting's slice for
 * the stage, then the ask. Without a setting the
 * head and ask are joined exactly as before, so unrestricted prompts do not
 * change shape.
 */
export function compose(head: string, ask: string, setting?: { slice: string }, sep = "\n\n"): string {
  if (!setting) return head + sep + ask;
  return (setting.slice ? [head, setting.slice, ask] : [head, ask]).join("\n\n");
}

export const TEMPLATES = T;
