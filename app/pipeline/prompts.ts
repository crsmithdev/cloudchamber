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

Each premise goes in a <premise> tag containing a <text> (one paragraph, under ${RUN.premiseWords} words, the pitch itself) and a <probability>: your estimate of how likely this premise is as a response to this seed. {sampling}{darkness}{shape} Output only the five tags.`,

  /** `--shape listen`: the premises are drawn for the template that will draft them, not only drafted under it. */
  premisesShape: `Each premise is for a story told aloud to a listener, and holds four things: a first moment a listener cannot stop inside, which says what is wrong before any routine; a thing that comes into the same place as a person with nothing between them, and does harm to that person or that place that cannot be undone, and does not explain itself; a named person who pays, on the page, a cost that cannot be got back; and an aftermath with one thing that has not gone away. The thing has a body, or works through one, so that it can touch, move, break or take: a blight, a signal, a reading or a number that is only measured is not it. It is met early and more than once, and a second named person is in the room with it.`,

  /** One per sampling mode: the band, and the register that goes with it. */
  samplingAsk: {
    tail: `Sample from the tail of the distribution: every probability must be under ${BANDS.tail.ceiling.toFixed(2)}. The premise most writers would reach for given this seed belongs to someone else's batch, not this one. Be bold and unconventional, even to the point of absurdity.`,
    "off-centre": `Sample off the centre of the distribution: every probability must be between ${BANDS["off-centre"].floor.toFixed(2)} and ${BANDS["off-centre"].ceiling.toFixed(2)}. Not the premise most writers would reach for first, but one that stays recognisably inside the tradition this seed belongs to.`,
    standard: `Sample from the centre of the distribution: every probability must be over ${BANDS.standard.floor.toFixed(2)}. The strongest conventional treatment of this seed: the premise a good writer would reach for and execute well, not an unusual one.`,
  },

  /** One per darkness level. The same sentence reaches the premises, the executions and the ending. */
  darknessAsk: {
    light: `The cost is real, but someone keeps something that matters, and a way out exists even when it is narrow.`,
    grey: `The cost is paid in full, and whether what it bought was worth it stays open.`,
    dark: `The cost is total or the way out is closed, and the story offers no consolation.`,
    black: `The worst outcome the premise can support, and it reaches past the protagonist to people who did nothing to earn it.`,
  },

  executeAsk: `Seed: {seed}

Premise: {premise}

Write ${RUN.vignetteWords} words of this story, in a <vignette> tag. Not a synopsis and not the opening unless the opening is where the story is: one passage, in the form the premise implies, that shows whether it can be written.{darkness} Under ${RUN.vignetteWords + 50} words. Output only the tag.`,

  outlineHead: `Below is a seed, a premise, and a ${RUN.vignetteWords}-word vignette written from it. Derive from them the story's underlying structure. Nothing here is prose for the page.

Seed: {seed}

Premise: {premise}

<vignette>
{vignette}
</vignette>`,

  outlineAsk: `Write one section per name below, each in a <section name="..."> tag and each under ${RUN.outlineSectionWords} words.

<section name="departure">: State, in one sentence, the one thing in this story that is not true of the actual world. Then derive everything the premise and vignette assert from it. Anything that does not follow is a second departure: name it, cut it, and replace it with something that follows from the first.

<section name="particulars">: Settle everything the prose must not drift from: every name, place, date, duration, count and quantity the story turns on, and any sum a reader could do. Where the premise is vague, decide.

<section name="knowledge">: Who knows what, and from when; what each of them cannot know; and why the people who could compare what they know do not.

<section name="arrival">: What arrives, and what it costs one person: the thing the departure sends against someone, the place and the moment it comes in with nothing between them, what it does to them or to the place, and what they lose to it that they cannot get back. Name the person, the place, the moment and the price.

Output only the tags.`,

  head: `Below is a story's derived structure and the ${RUN.vignetteWords}-word vignette it came from.

{outline}

<vignette>
{vignette}
</vignette>
`,

  jobs: `
Name two vignettes to write next, each defined by its job: the one thing about the structure above it tests. The two jobs must be different things; if two vignettes test the same thing one is padding. Output two <job> tags, each one sentence under 40 words naming the job and the scene that does it. Nothing else.`,

  context: `
Write one vignette in a <vignette> tag, under ${RUN.vignetteWords + 50} words. Its job: {job}

The structure above has settled the story: write within it and add nothing it does not hold. Output only the tag.`,

  ending: `
Write the ending, in an <ending> tag: the last beat, derived from the ${RUN.endingJobs.slice(0, -1).join(", ")} and ${RUN.endingJobs.at(-1)} sections above. Under ${RUN.endingWords} words.{darkness} Output only the tag.`,

  /** The five lists, defined once and shared by both distill passes and by nothing else. */
  listDefinitions: `<bodies>: organisations, offices, orders, departments and courts. What it issues or decides, whom it answers to, and what it cannot do.
<events>: something that happened, on a date — a disaster, a closure, a founding, a strike, a judgment, a removal, an exodus. What happened and when, then what it changed. An event has actors and a before and after. The date a rule took effect is not an event: a commencement belongs on the instrument it commences.
<instruments>: documents, devices, drugs, weapons and rites. What it does, who holds it, and what follows from having it, losing it or undergoing it.
<places>: named places. What the place does, and what it costs to be there. Never what it looks like.
<terms>: the setting's own word for a thing, then the separator, then a gloss under twelve words.`,

  entryShape: `Every entry is one line in one shape: the name, then a space, an em dash and a space, then what it does; then what it cannot do, or what follows from it. Under {words} words. Any interval, price, count or deadline belongs in that second clause, on the thing that keeps it.

Where the thing reaches somebody, the second clause says who, and what they lose or cannot do; where it reaches nobody, it says what cannot happen without it.

Every entry names something this setting names: a body, an instrument, a place, a rite, a term, a date or a figure that appears in the material below. An entry that would be true of any city, any empire or any war is not written, and fewer entries is the right answer when the material runs out. No citations, no URLs, no bracketed marks.`,

  distillMap: `A setting file for a story pipeline holds five lists of named things. Below is one of its reference files. Take from the file every entry it can support, and nothing it cannot.

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

  findingShape: `Each finding goes in a <finding> tag containing: <span> (a verbatim quote from the brief, under ${RUN.spanWords} words), <statement> (what the span asserts, one sentence), <result> (one of: supported | contradicted | unverifiable | contradicts:<a second verbatim quote> | underived), <evidence> (the second quote, the sum written out, a URL and quoted line, or none), <invalidates> (which outline section would have to change if the finding stands: {sections} | none), <replacement> (one factual sentence in the outline's register that would hold in its place; not dialogue, not a scene), <patch> (the span rewritten so the finding no longer holds, in the voice and register of the text it came from and no longer than the span, ready to stand in its place word for word; or none when the fix needs more than that span).

Quote every span from a vignette or the ending, never from the outline: the reader of the story sees only those. Report only a conflict that reader would see by comparing two quotes, or a line that breaks a rule the outline states in words. A conflict you find only by arithmetic beyond comparing two stated values, by counting weekdays, or by working out how liquid, light, an instrument or a body behaves is not a finding, and neither is a stated rule beside an exception the text marks, nor a figurative line read as literal fact. When the conflicting fact is also stated in a vignette or the ending, quote it from there. A result of contradicted or contradicts needs the span to assert the conflicting fact itself. A count, a duration or a detail the span does not state is not a contradiction: the span may be one of several, and what it leaves out is unverifiable. The replacement and the patch keep every event the span reports and change only the quantity, the timing or the mechanism that conflicts. Never turn an event into its absence. When the two quotes give one person, place, company or thing two names, or one quantity two values, the replacement names the one of the two that the rest of the brief supports, and never a third. The replacement states the corrected fact and nothing else: no place, count, cause or detail that neither quote states.`,

  checkDerivation: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending. The departure section states the one thing in the story that is not true of the actual world and derives everything from it.

{brief}

State that departure, in an <impossibility> tag, one sentence. Then check every assertion in the vignettes and ending against that derivation, and do each sum whose figures a vignette or the ending states. Report each assertion that does not follow from the one impossibility, and each sum that does not add up. Report an assertion only when the outline states the rule it breaks, and a sum only when the brief states both figures: a consequence you work out yourself from physics, geometry or a unit is not a finding.

{findingShape}

After the findings, an <examined> tag listing each assertion and each sum checked, one per line, whether or not it produced a finding. At most 8 findings. Under 1000 words in total.`,

  ledgerExtract: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

{brief}

Extract from the outline every settled fact into a <ledger> tag, one per line, each line opening with its category: time (dates, durations, order), detail (names, quantities, appearance), knowledge (who knows what, and from when), possession (who holds what), world (rules), perspective. These lines are the contract the brief is held to for the rest of its life, so state each one so it can be read against prose by someone who has not seen this outline. Under 600 words. Output only the tag.`,

  checkLedger: `Below is a ledger of a story's settled facts, then the brief itself: a seed, a premise, an outline in four sections, three vignettes and an ending.

{ledger}

{brief}

The ledger is fixed. It was settled for this brief and every repair of it, and where the prose and the ledger disagree it is the prose that is wrong. An amendment listed under the ledger overrides any earlier line it disagrees with, and that earlier line is void. Check each vignette and the ending against the ledger, and against each other, pairwise. Report each contradiction.

{findingShape}

After the findings, an <examined> tag naming each pair compared (ledger×chosen, ledger×context-1, chosen×ending, and so on). At most 8 findings. Under 1100 words in total.`,

  pinnedLedger: `<ledger>
{ledger}
</ledger>`,

  checkStructure: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

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

  claimsExtract: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

{brief}

Extract only claims about the actual world that carry a quantity or a rule a published source could confirm or deny: a price, a rate, a count, a date, a duration, a distance, a procedure, a statute, a relation between two named places. That a place, institution, product or person exists is not a claim. Skip everything the story invents. Each claim goes in a <claim> tag containing <span> (verbatim quote, under ${RUN.spanWords} words) and <statement> (the claim as one checkable sentence). At most 12 claims. Under 500 words.`,

  claimsExtractSetting: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

{brief}

Extract only claims about the setting the story is set in, that carry a quantity or a rule the setting itself settles: a price, a rate, a count, a date, a duration, a term of service, an office, a rite, an instrument, or a relation between two bodies. That a place, institution or person exists is not a claim. Skip what the story invents for itself alone, and skip anything that would hold in any world. Each claim goes in a <claim> tag containing <span> (verbatim quote, under ${RUN.spanWords} words) and <statement> (the claim as one checkable sentence). At most 12 claims. Under 500 words.`,

  claimsVerifyWorld: `Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Search for a published source that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (a URL and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold, keeping what the span reports and changing only the figure or the rule that conflicts; otherwise none). Under 120 words.`,

  claimsVerifyReference: `{reference}

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the reference material above that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the file name and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold, keeping what the span reports and changing only the figure or the rule that conflicts; otherwise none). Under 120 words.`,

  claimsVerifySetting: `<setting>
{reference}
</setting>

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the setting above that confirms or denies it. The setting is the whole authority: a claim it does not settle is unverifiable, not wrong. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the heading it sits under and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold, keeping what the span reports and changing only the figure or the rule that conflicts; otherwise none). Under 120 words.`,

  checkVerify: `Below is a story brief, the ledger of its settled facts, then the findings its checkers raised against it, numbered.

{brief}

{ledger}

<findings>
{findings}
</findings>

A reader of the story sees only the vignettes and the ending, reads them once and with attention, and never sees the outline. Read each finding back against the whole brief. Keep it only when the span asserts the fact the statement gives it, the evidence is a quote from the brief or the ledger that conflicts with that fact, and the conflict is one that reader would notice, or one that breaks a rule the outline states in words. The ledger restates the outline and can state a rule more strongly than the outline does; where the two differ, the outline holds.

Drop it when any of these is true:
- the span does not state the fact, or what it leaves out is stated elsewhere or left open;
- the two quotes can both hold, and that includes a stated rule and an exception the text marks or explains;
- the span is a character's loose, everyday wording of a fact the brief states exactly elsewhere;
- the span is figurative (a simile, a metaphor, or a character's way of describing a feeling), and the rule it seems to break is about literal fact;
- seeing the conflict needs any arithmetic beyond comparing two stated values or counting a day or two from a dated entry: a sum, a product, a division, a rate, a count of weekdays or a unit conversion;
- seeing the conflict needs a physical inference about how liquid, blood, light, an instrument or a body behaves that the brief does not state in words;
- the span hedges the fact it states, with words such as "on a good day", "about", "nearly" or "if";
- the evidence is not in the brief or the ledger.

Output one <verdict n="..."> tag per finding, containing <answer>keep|drop</answer> (one of those two words and nothing else) and <why> (one sentence). Under {cap} words.`,

  reconcile: `Below are the fixes one repair round is about to apply to a story brief together, numbered.

<fixes>
{fixes}
</fixes>

Each fix is a sentence that must hold in the repaired brief, and a patch under it is text that will stand in the brief word for word. First output a <shared> tag: one line per quantity, date, count, position or rule that two or more fixes or patches give a value to, naming each fix's value ("gap reaches zero: fix 1 Day 19; fix 4 Day 16"). Then output a <conflicts> tag containing one <conflict> per pair whose values for one line differ, each with <a> and <b> (the two fix numbers from the list above, not the values) and <why> (one sentence). Output an empty <conflicts> tag when no line has two values. Under 250 words.`,

  constraints: `<constraints>
{constraints}
</constraints>`,

  settled: `<settled>
{settled}
</settled>

The settled lines were accepted in earlier rounds of this brief and still
hold. Keep every one of them true. Do not restate them and do not undo them to
satisfy a constraint above.`,

  repairVignette: `Below is a ${RUN.vignetteWords}-word vignette from a story and a set of constraints that hold.

<vignette>
{vignette}
</vignette>

{constraints}

{ledger}

{settled}

Rewrite it in a <vignette> tag so that every line of the constraints holds, keeping its people, place, form and length. Change only the sentences that state a fact a constraint corrects, and within such a sentence change only the words that state that fact; every other word, name, number, date, time and place stays as written, even where a constraint mentions it. Add no name, number, date or time that is not already in it or in a constraint, and add a sentence only when a constraint cannot hold without one. Under ${RUN.vignetteWords + 50} words. Output only the tag.`,

  repairEnding: `Below is a story's derived structure, the ending written from it, and a set of constraints that hold.

{outline}

<ending>
{ending}
</ending>

{constraints}

{ledger}

{settled}

Rewrite the ending in an <ending> tag so that every line of the constraints holds, keeping its people, place, form and length. Change only the sentences that state a fact a constraint corrects, and within such a sentence change only the words that state that fact; every other word, name, number, date, time and place stays as written, even where a constraint mentions it. Add no name, number, date or time that is not already in it or in a constraint, and add a sentence only when a constraint cannot hold without one. Under ${RUN.endingWords} words. Output only the tag.`,

  schedule: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending. Below that, the story's configuration.

{brief}

<config>
target length: {words} words
beats: {beatsLine}
{formLines}
ending: {endingLine}
</config>

{shape}Derive the story's schedule, which settles what the reader knows at each point and what is still withheld. Output a <form> tag with four lines: tense, person, chronology, container. Then one <beat n="K" words="N"> tag per beat containing <job> (one sentence, what the beat does and where it is set), <known> (what the reader knows by its end, one or two sentences), <withheld> (each thing still withheld after this beat, with the beat number that reveals it, one per line as \`item — beat N\`; the line \`none\` when nothing is), <stakes> (one sentence), <set_piece> (the one moment or image of this beat a listener would retell, one sentence; or none), <absorbs> (chosen | context-1 | context-2 | ending | none: the brief vignette this beat takes its material from, if any; each may be named by at most one beat), and <pays>yes</pays> on the one beat where the withheld thing comes in with nothing between it and a person, does harm, and a named person pays a cost that cannot be got back, if the shape asks for one. A <cast> tag before the beats when the shape asks for one. Output only the tags. Under 1100 words.`,

  scheduleTold: `The story is told afterward, by its narrator, to a listener. Beat 1 is the worst moment of the story, shown before anything is explained, and beat 2 backs up to the beginning; from there the beats run in order. Every beat has a set piece a listener will retell. Something comes into the same place as the narrator with nothing between them, and does harm there, and it costs the narrator or someone beside them; the beat before the last is where the cost is paid, and that beat is marked <pays>yes</pays>. The last beat is the aftermath, back at the ordinary, with one thing that has not gone away. The brief's ending is material for the beat before the last, not for the last.

`,

  sceneTold: `<register>
The narrator tells this afterward to a listener who cannot see it. When a thing happens, say what the body did before saying what it meant. Report what people said rather than quoting it; quote only a sentence the listener has to hear word for word. One thing per sentence. The narrator may speak to the listener, and may say what they made of it at the time and what they make of it now.
</register>`,

  scheduleListen: `Derive the shape from the brief. Whatever it is, the schedule holds four things. A first beat a listener cannot stop inside: the worst moment, or the noticing, shown before it is explained, and it says what is wrong inside its first 150 words. A beat where the thing the story withholds comes into the same place as a person with nothing between them, and does harm to that person or that place, and does not explain itself. The thing is in the same place as a person in at least two more beats, before or after that one, and the first time a listener meets it is no later than a third of the way through. A beat where a named person pays a cost they cannot get back, before the last beat; mark that beat <pays>yes</pays>. A last beat back at the ordinary, with one thing that has not gone away, that ends on one image or one act and not a summary. By the midpoint the person who knows has told someone, and that person answers, so the dread is between people and not inside one head. Every beat has a set piece a listener will retell: one thing that happens that a second person present could see; none is not an answer. Before the beats, a <cast> tag: three or four named people who speak, one line each, giving the name, what they are to the story, and how they talk, one habit of speech nobody else in the cast has. Chronology, person, container and the number of timelines are the brief's; do not add a crew, a mission or a return the brief does not have. The brief's ending is material for the cost, not for the last beat.

`,

  scheduleSignal: `The story follows one specialist, close, from the hour they notice the thing to the months after. Beat 1 is the noticing, at an odd hour, in the middle of routine work; by its end the thing has a shape that cannot be drift. The people around the specialist are named, given one habit each, and one of them says go today. Something is sent, and the specialist goes with it. The thing comes into the same place as the crew with nothing between them, does harm to one of them or to the place, and does not explain itself. A decision splits the crew and every side of it is defensible. The cost is paid in the beat before the last, by a named person, and it cannot be got back; mark that beat <pays>yes</pays>. The last beat is the return: someone official asks for a clean ending and does not get one, and the specialist says in plain words what they now believe. Every beat has a set piece a listener will retell, and in every beat people speak to each other. Before the beats, a <cast> tag: three or four named people who speak, one line each, giving the name, what they are to the story, and how they talk, one habit of speech nobody else in the cast has. The brief's ending is material for the beat before the last, not for the last.

`,

  sceneSignal: `<register>
One narrator reads this aloud to listeners who cannot see it. Name the feeling as it is felt, and the body with it. People speak in quoted lines, plainly, the way they speak at work; let the argument happen in the room. Each person speaks the way the schedule's cast says they do, and no two alike. When the time or the place changes, the first sentence says so. Give the exact number and the exact hour when there is one. One thing per sentence, short enough to say in one breath.
</register>`,

  sceneMaterial: `<material>
{material}
</material>

The material above is the brief's own vignette for this beat; use it as far as it serves the schedule, rewritten to sit in the story.`,

  sceneAsk: `Write beat {n} of the story, in a <scene> tag. Its job: {job} By its end the reader knows: {known} Still withheld after it: {withheld} Form: {form}. Under {cap} words. The schedule above has settled the story: write within it and add nothing it does not hold.{constraintLine} Output only the tag.`,

  screenLedger: `<ledger>
{ledger}
</ledger>

{previous}<scene n="{n}">
{scene}
</scene>

Check the scene against the ledger and against the previous scene. A reader sees only the scenes: report a line that states a fact the ledger or the previous scene settles otherwise, and nothing else. Not a finding: a figurative line (a simile, a metaphor, or a character's way of describing a feeling) read as literal fact; a character's loose, everyday wording of a fact the ledger states exactly; a line that hedges the fact it states; a count, a duration or a detail the scene leaves out. Report each contradiction in a <finding> tag containing <span> (verbatim quote from the scene, under ${RUN.spanWords} words), <statement> (one sentence), <result> (contradicts:<verbatim quote of the ledger line or previous-scene span>), <invalidates> (the beat number, or none), <replacement> (one positive sentence that would hold), <patch> (the span rewritten in the scene's own voice so the contradiction is gone, no longer than the span, ready to stand in its place word for word; or none when the fix needs more than that span). Then an <examined> tag naming what was compared. At most 6 findings. Under 500 words.`,

  screenStructure: `<beat n="{n}">
job: {job}
withheld after this beat: {withheld}
</beat>

<scene n="{n}">
{scene}
</scene>

Answer the questions below about the scene, each as present or absent, each with one verbatim quote that settles it. Output one <question name="..."> tag per question containing <answer>present|absent</answer> and <quote>...</quote>.

theme-stated: the narrator or a character states what the story means or what its lesson is.
bodily-emotion: an emotion is conveyed as a bodily sensation (a tightening chest, a cold stomach, breath catching).
withheld-revealed: an item listed as withheld after this beat is stated in the scene as a fact the reader now knows. Implication and foreshadowing are not reveals; the quote must contain the statement.
protagonist-never-wrong: the point-of-view character is not allowed to be mistaken, unfair or at fault anywhere in the scene.
one-voice: two or more people speak in the scene and sound the same: a line could be moved from one mouth to another and nothing would be lost. Absent when only one person speaks, or when the speakers are told apart by how they talk.
nothing-happens: nothing happens in the scene that a second person present could see or hear: it is thought, recollection, measurement or summary from start to end.
{fifth}{first}{last}

Output only the tags. Under 300 words.`,

  screenLastBeat: `
presence-arrives: by the end of this scene the thing the story has been withholding is in the same place as a character with nothing between them: not glass, a screen, a channel, a doorway it stays behind, or distance, and not only inferred.
cost-paid: by the end of this scene someone has lost something they cannot get back.
presence-in-room: the thing the story withholds acts in this scene, on the page, at the time: it touches, moves, breaks or takes a person or a thing. A thing that is seen, stands, or gestures and does nothing more is absent, as is one inferred from an instrument, heard over a channel, or remembered afterward.
cost-in-scene: the loss happens inside this scene as it happens, in the moment, and is not reported afterward or summarised by the narrator.`,

  screenResolved: `resolved: the scene settles a question the schedule keeps open for a later beat.`,
  screenFirstBeat: `
hook-late: the first 150 words do not say what is wrong: the thing the story is about, or its first effect, is not named or shown before routine, setting or history.`,
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
