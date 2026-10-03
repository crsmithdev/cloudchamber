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

/**
 * The <sym> grammar the outline declares its particulars and knowledge in (IR
 * spec §15.8, T4): L1's, worded for a writer instead of a reader of a ledger,
 * so that L3 and L4 read a declared table as they read a lowered one. L1's own
 * prompt still lowers the ledger of a brief with no table.
 */
const SYM_RULES = `A symbol is a person, an object, a body (a council, a guild, a crew), a place, or a fact. Each tag carries: id="" (a short lowercase identifier, dotted for a property of something: suit.third), kind="person|object|body|place|fact|time|count", from="ledger:<category>" (the category the fact belongs to: time, detail, knowledge, possession, world or perspective). Add any other attribute the section states a value for: a count, a role, a custody, a shift size. A person or an object that the section places in a body — a seat-holder, a delegate, an officer, a member, a thing a body holds — carries member_of="" with that body's symbol id. The tag's content is the fact as one sentence that someone who has not seen the rest can read against prose.

Two kinds need special care.

Every place the section writes a calendar date beside a day number or an hour — a start, an end, an arrival, a completion — emit its own <sym kind="time" id="day.N"> (N the day number) carrying day="N", date="" (the calendar date exactly as written) and hour="" (when one is given). Emit a date only where one is written; never a date you compute from a count of days. The same day can be pinned more than once, in more than one place and more than one wording; emit a symbol for each statement, not one merged answer.

Every vote or tally the section states — emit a <sym kind="count" id="..."> carrying body="" (the symbol id of the body that votes), yes="" and no="" (the two sides), total="" (a sum stated outright), named_yes="" and named_no="" (the symbol ids of the persons named on each side, comma-separated, or none), unnamed_yes="" and unnamed_no="" (how many on each side are counted without naming), using only the attributes given a value. A "N of M remain" line is a count too, with remaining="" and of="", not a vote.`;

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

<section name="particulars">: Settle everything the prose must not drift from: every name, place, date, duration, count and quantity the story turns on, and any sum a reader could do. Where the premise is vague, decide. Write this section as <sym> tags only, one per thing it settles.

<section name="knowledge">: Who knows what, and from when; what each of them cannot know; and why the people who could compare what they know do not. Write this section as <sym> tags only, one per fact, each with the category knowledge.

These two sections are the story's contract: every later scene is held to them. ${SYM_RULES} The two tagged sections may run to 900 words each.

<section name="arrival">: What arrives, and what it costs one person: the thing the departure sends against someone, the place and the moment it comes in with nothing between them, what it does to them or to the place, and what they lose to it that they cannot get back. Name the person, the place, the moment and the price.

After the sections, name two more vignettes to write, each defined by its job: the one thing about the structure above it tests. The two jobs must be different things; if two vignettes test the same thing one is padding. Output two <job> tags, each one sentence under 40 words naming the job and the scene that does it.

Output only the tags.`,

  head: `Below is a story's derived structure and the ${RUN.vignetteWords}-word vignette it came from.

{outline}

<vignette>
{vignette}
</vignette>
`,


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


  ledgerExtract: `Above is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

Extract from the outline every settled fact into a <ledger> tag, one per line, each line opening with its category: time (dates, durations, order), detail (names, quantities, appearance), knowledge (who knows what, and from when), possession (who holds what), world (rules), perspective. These lines are the contract the brief is held to for the rest of its life, so state each one so it can be read against prose by someone who has not seen this outline. Under 600 words. Output only the tag.`,


  pinnedLedger: `<ledger>
{ledger}
</ledger>`,

  checkStructure: `Above is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

Answer seven questions about the brief, each as present or absent, each with one verbatim quote from the brief that settles it. Output one <question name="..."> tag per question containing <answer>present|absent</answer> and <quote>...</quote>.

threat: something in the brief would harm or endanger someone in it.
category-violation: a boundary is violated, between living and dead, self and other, inside and outside, one thing and another. Not: something is disgusting.
agency: there is an unresolved question of what is acting, something acting with no visible actor, or an actor-shaped absence.
obscurity: what is withheld is withheld deliberately and legibly, leaving something for the imagination to enlarge. Absent means the brief is merely underspecified.
thickening: the brief contains material for development beyond its own statement, rather than a single image or a single reveal.
spectacle: the brief's entire payload is a shock, a gross-out or a final twist.
consequence: the point of departure from the actual has its consequences taken seriously.

Output only the seven tags. Under 350 words.`,

  checkResemblance: `Above is a story brief. Below is an enumerated list of premises editors report seeing too often.

<list>
{list}
</list>

Match the brief against the list. For each list entry the brief matches, output a <match> tag containing <entry> (the list line, verbatim) and <span> (the quote from the brief that matches it, under ${RUN.spanWords} words). Then output one <nearest> tag naming the nearest published story, novel or film: <title>, <author>, and <shared> (one sentence stating what the brief shares with it). At most 4 matches. Under 300 words.`,

  claimsExtract: `Above is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending.

Extract only claims about the actual world that carry a quantity or a rule a published source could confirm or deny: a price, a rate, a count, a date, a duration, a distance, a procedure, a statute, a relation between two named places. That a place, institution, product or person exists is not a claim. Skip everything the story invents. Each claim goes in a <claim> tag containing <span> (verbatim quote, under ${RUN.spanWords} words) and <statement> (the claim as one checkable sentence). At most 12 claims. Under 500 words.`,

  claimsExtractSetting: `<setting>
{reference}
</setting>

Above is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending. The setting it is set in is the block just above.

Extract the claims the brief makes that a line of the setting settles, for or against: a price, a rate, a count, a date, a duration, a term of service, an office, a rite, an instrument, a relation between two bodies, where a place is, or how a person gets from one place to another. That a place, institution or person exists is not a claim. Skip what the story invents for itself alone, and skip anything that would hold in any world. Each claim goes in a <claim> tag containing <span> (verbatim quote, under ${RUN.spanWords} words) and <statement> (the claim as one checkable sentence that names its subject by the setting's name for it, not by the brief's shorthand, such as "the Gate" or "the doors"). At most 12 claims. Under 500 words.`,

  // --- story IR lowering (docs/specs/2026-09-28-story-ir.md §4.2, S2) ------------------

  irSymbolize: `A story's pinned ledger: one line per settled fact, category-prefixed.

<ledger>
{ledger}
</ledger>

Read it and emit one <sym> tag per entity or fact it settles: a person, an object, a body (a council, a guild, a crew), a place, or a fact. Each tag carries: id="" (a short lowercase identifier, dotted for a property of something: suit.third), kind="person|object|body|place|fact|time|count", from="ledger:<category>" (the ledger category the line came from). Add any other attribute the line states a value for: a count, a role, a custody, a shift size. A person or an object that the ledger places in a body — a seat-holder, a delegate, an officer, a member, a thing a body holds — carries member_of="" with that body's symbol id. The tag's content is the line itself, close enough to quote.

Two kinds need special care.

Every place the ledger writes a calendar date beside a day number or an hour — a start, an end, an arrival, a completion — emit its own <sym kind="time" id="day.N"> (N the day number) carrying day="N", date="" (the calendar date exactly as the ledger writes it) and hour="" (when the ledger gives one). Emit a date only where the ledger writes one; never a date you compute from a count of days. One ledger can pin the same day more than once, in more than one place and more than one wording; emit a symbol for each statement, not one merged answer.

Every vote or tally the ledger states — emit a <sym kind="count" id="..."> carrying body="" (the symbol id of the body that votes), yes="" and no="" (the two sides), total="" (a sum the ledger states outright), named_yes="" and named_no="" (the symbol ids of the persons the ledger names on each side, comma-separated, or none), unnamed_yes="" and unnamed_no="" (how many on each side it counts without naming), using only the attributes the ledger actually gives a value for. A "N of M remain" line is a count too, with remaining="" and of="", not a vote.

Output only the <sym> tags, wrapped in one <symbols> tag. Under 1400 words.`,

  irPlanLedger: `Above is a story's symbol table: typed entities and facts lowered from its ledger.

<symbols>
{symbols}
</symbols>

Below is the beat-by-beat plan for the same story.

<plan>
{plan}
</plan>

The symbol table is fixed: a symbol's stated value overrides anything a beat implies otherwise. For each beat, check every value its <uses> line names against the symbol table, and check whether the beat's <job>, <known>, <stakes> or <exit> line asserts something about a symbol that conflicts with the symbol's stated value: a headcount, a name, a location, a role, a custody, who sits where, who is joined by what means. Report each conflict. A thing the symbol table has no value for is not a finding: report only a conflict with a stated value. Do not report dates or day numbers: a separate check reads the calendar. Do report an hour that a stated rate, duration or start time rules out: where a person can be by that hour, or what can have happened by it.

Each finding goes in a <finding> tag containing: <span> (a verbatim quote from the plan, under 40 words), <statement> (what the span asserts, one sentence), <result>contradicted</result>, <evidence> (the symbol id and the value it conflicts with), <invalidates> (the beat number the span is in), <replacement> (one sentence in the plan's own register that would hold in its place), <patch> (the span rewritten so the finding no longer holds, ready to stand in its place word for word; or none when the fix needs more than that span).

At most {cap} findings, the gravest first. Under 1200 words in total.`,

  claimsVerifyWorld: `Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Search for a published source that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (a URL and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold, keeping what the span reports and changing only the figure or the rule that conflicts; otherwise none). Under 120 words.`,

  claimsVerifyReference: `{reference}

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the reference material above that confirms or denies it. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the file name and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold, keeping what the span reports and changing only the figure or the rule that conflicts; otherwise none). Under 120 words.`,

  claimsConfirm: `Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

This line was cited to show the claim is wrong:
{evidence}

Does the cited line state a different value for the same thing the claim states: another figure, date, name, order or rule for the same subject? A line about something else, or one silent on the point the claim makes, does not. Output an <answer> tag (yes or no), then a <why> tag, one sentence. Under 60 words.`,

  claimsVerifySetting: `<setting>
{reference}
</setting>

Claim from a story, quoted: "{span}"
As a checkable sentence: {statement}

Find the line in the setting above that confirms or denies it. The setting is the whole authority: a claim it does not settle is unverifiable, not wrong. Output a <finding> tag containing <span> (the quote above, verbatim), <statement> (the sentence above), <result> (supported | contradicted | unverifiable), <evidence> (the heading it sits under and one quoted line from it, or none), <invalidates> (none), <replacement> (if contradicted, one positive sentence that would hold, keeping what the span reports and changing only the figure or the rule that conflicts; otherwise none). Under 120 words.`,

  checkReader: `Above is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending. A reader of the story sees only the vignettes and the ending, reads them once and with attention, and never sees the outline.

Read the story as that reader and find its plot holes: the places where the reader stops and asks a question that nothing in the vignettes or the ending answers. Four kinds:
- an event with no cause: something happens, and nothing says why or how it could;
- a choice with a better way open: a character does something costly while an obvious other course was open, and the story neither closes that course off nor says why;
- knowledge too early: a character acts on a fact before the story shows how they could know it;
- a setup with no payoff: an object, a threat or a promise the story makes prominent, and never uses or resolves.

Not a plot hole: two stated facts that disagree (another check reads those); a mystery the story poses on purpose and leaves open as a mystery; the one impossibility the story is built on, which needs no cause; a question the ending answers.

Each hole goes in a <finding> tag containing: <span> (the verbatim quote from a vignette or the ending where the question arises, under ${RUN.spanWords} words), <statement> (the question the reader asks, as one sentence), <result>unanswered</result>, <evidence> (a verbatim quote of the outline line that answers the question, or none), <invalidates> (which outline section would have to change: {sections} | none), <replacement> (one factual sentence in the outline's register that would answer it), <patch>none</patch>.

After the findings, an <examined> tag listing each question you considered, one per line, whether or not it became a finding. At most 6 findings. Under 900 words in total.`,

  readerVerify: `Above is a story brief. Below are questions a reader raised about the story, numbered, each with the span where it arises.

<findings>
{findings}
</findings>

A reader of the story sees only the vignettes and the ending, and reads them once, with attention. For each question, search every vignette and the ending, later scenes included, for the line that answers it.

Drop a question only when one of these is true, and quote the words that show it:
- a line of a vignette or the ending answers it: quote that line, word for word;
- it asks how the story's one impossibility works: quote the line of the story that states the impossibility.

Otherwise keep it. A question the reader has to answer by a guess, by inference from mood, or by assuming the silence is on purpose stays kept: that is the gap.

Output one <verdict n="..."> tag per question, containing <answer>keep|drop</answer> (one of those two words and nothing else) and <why> (one sentence, carrying the quote in double quotes when the answer is drop). Under {cap} words.`,



  constraints: `<constraints>
{constraints}
</constraints>`,

  settled: `<settled>
{settled}
</settled>

The settled lines were accepted in earlier rounds of this brief and still
hold. Keep every one of them true. Do not restate them and do not undo them to
satisfy a constraint above.`,

  reviseVignette: `Below is a ${RUN.vignetteWords}-word vignette from a story and the author's instructions for it.

<vignette>
{vignette}
</vignette>

<instructions>
{instructions}
</instructions>

{ledger}

{settled}

Rewrite it in a <vignette> tag so that it carries out every instruction. Change what the instructions ask for and what has to change with it; everything else stays as written, with its people, place, form and length. Add no name, number, date or time that is not already in it or in an instruction. Under ${RUN.vignetteWords + 50} words. Output only the tag.`,

  reviseEnding: `Below is a story's derived structure, the ending written from it, and the author's instructions for the ending.

{outline}

<ending>
{ending}
</ending>

<instructions>
{instructions}
</instructions>

{ledger}

{settled}

Rewrite the ending in an <ending> tag so that it carries out every instruction. Change what the instructions ask for and what has to change with it; everything else stays as written, with its people, place, form and length. Add no name, number, date or time that is not already in it or in an instruction. Under ${RUN.endingWords} words. Output only the tag.`,

  schedule: `Below is a story brief: a seed, a premise, an outline in four sections, three vignettes and an ending. Below that, the story's configuration.

{brief}

<config>
target length: {words} words
beats: {beatsLine}
{formLines}
ending: {endingLine}
</config>

{shape}Derive the story's schedule, which settles what the reader knows at each point and what is still withheld. Output a <form> tag with four lines: tense, person, chronology, container. Then one <beat n="K" words="N"> tag per beat containing <job> (one sentence, what the beat does and where it is set), <when> (one short phrase placing the beat in the chronology the <form> declares, in the story's own reckoning: the day, the hour or the year, and the strand when there is more than one), <known> (what the reader knows by its end, one or two sentences), <withheld> (each thing still withheld after this beat, with the beat number that reveals it, one per line as \`item — beat N\`; the line \`none\` when nothing is), <stakes> (one sentence), <set_piece> (the one moment or image of this beat a listener would retell, one sentence; or none), <absorbs> (chosen | context-1 | context-2 | ending | none: the brief vignette this beat takes its material from, if any; each may be named by at most one beat), and <pays>yes</pays> on the one beat where the withheld thing comes in with nothing between it and a person, does harm, and a named person pays a cost that cannot be got back, if the shape asks for one. A <cast> tag before the beats when the shape asks for one. Output only the tags. Under 1100 words.`,

  scheduleReplan: `<instructions>
{instructions}
</instructions>

The author has read a draft of this story and gives the instructions above. The schedule carries them out.{kept}

`,

  scheduleKept: ` Beats 1 to {last} of the draft's schedule below are written and stay as they are: repeat their entries word for word, and plan from beat {from} on.

<written>
{written}
</written>`,

  scheduleTold: `The story is told afterward, by its narrator, to a listener. Beat 1 is the worst moment of the story, shown before anything is explained, and beat 2 backs up to the beginning; from there the beats run in order. Every beat has a set piece a listener will retell. Something comes into the same place as the narrator with nothing between them, and does harm there, and it costs the narrator or someone beside them; the beat before the last is where the cost is paid, and that beat is marked <pays>yes</pays>. The last beat is the aftermath, back at the ordinary, with one thing that has not gone away. The brief's ending is material for the beat before the last, not for the last.

`,

  sceneTold: `<register>
The narrator tells this afterward to a listener who cannot see it. When a thing happens, say what the body did before saying what it meant. Report what people said rather than quoting it; quote only a sentence the listener has to hear word for word. One thing per sentence. The narrator may speak to the listener, and may say what they made of it at the time and what they make of it now.
</register>`,

  scheduleListen: `Derive the shape from the brief. Whatever it is, the schedule holds four things. {firstBeat} A beat where the thing the story withholds comes into the same place as a person with nothing between them, and does harm to that person or that place, and does not explain itself. The thing is in the same place as a person in at least two more beats, before or after that one, and the first time a listener meets it is no later than a third of the way through. A beat where a named person pays a cost they cannot get back, before the last beat; mark that beat <pays>yes</pays>. That beat and the beat where the thing arrives carry the largest word counts in the schedule, each at least a quarter above the median beat: they are played out, not summarised. The last beat is never the shortest: give it the median beat's words or more, because it is what the listener is left with. A last beat back at the ordinary, with one thing that has not gone away, that ends on one image or one act and not a summary. By the midpoint the person who knows has told someone who disagrees on good grounds, so the dread is between people, not inside one head. Every beat has a set piece a listener will retell: one thing that happens that a second person present could see; none is not an answer. Before the beats, a <cast> tag: three or four named people who speak, one line each, giving the name, what they are to the story, and how they talk: the words their work gives them, how long their sentences run, what they will not say. Not a catchphrase and not a verbal tic: a phrase a person says again and again is heard as a joke. Person, container and the number of timelines are the brief's, and so is the chronology unless the configuration fixes it; do not add a crew, a mission or a return the brief does not have. The brief's ending is material for the cost, not for the last beat.

`,

  /** The listen schedule's first beat, by opening mode: every mode but slow holds it to the hook window. */
  listenFirstBeat: `A first beat a listener cannot stop inside: the worst moment, or the noticing, shown before it is explained, and it says what is wrong inside its first {window} words.`,
  listenFirstBeatSlow: `A first beat that holds the ordinary the story will break, with one thing in it already out of place.`,

  /** What the opening and clarity keys add to any schedule ask, each a paragraph after the shape. */
  scheduleOpenPromise: `Beat 1 opens on a promise: within its first {window} words the narrator says who they are and what went wrong, plainly, the way the story's title would, and only then shows how it began. Its <job> says what that opening states.`,
  scheduleOpenCold: `Beat 1 opens inside the wrong thing, while it is happening; who, where and when come after, from inside it.`,
  scheduleEchoTitle: `The seed is the story's title, and beat 1 keeps its promise: the narrator the title names and the wrong thing it names are both in beat 1, and its <job> says how.`,
  scheduleFocal: `One point of view in every beat: the narrator's. No beat goes inside another person's head; what others did and felt is what the narrator saw, heard or was told.`,
  scheduleRules: `The story hangs on a numbered list of rules the narrator was given: who gave it, on what, and with what warning is told by the end of beat 2. Before the beats, a <rules> tag: the list, numbered, one rule per line, in the plain, specific and strange words of whoever wrote them, five to seven in all. From the beat after the list is first read, each rule opens a beat or a run of beats in order, and that beat's <job> names the rule; the beats under a rule show why it exists, what happened to someone who broke it, or what it was really for. The last rule is the one the narrator breaks, or the one that turns out to be about them. The <form> tag's container line says rules.`,

  scheduleSignal: `The story follows one specialist, close, from the hour they notice the thing to the months after. Beat 1 is the noticing, at an odd hour, in the middle of routine work; by its end the thing has a shape that cannot be drift. The people around the specialist are named, given one habit each, and one of them says go today. Something is sent, and the specialist goes with it. The thing comes into the same place as the crew with nothing between them, does harm to one of them or to the place, and does not explain itself. A decision splits the crew and every side of it is defensible. The cost is paid in the beat before the last, by a named person, and it cannot be got back; mark that beat <pays>yes</pays>. That beat and the beat where the thing comes into the same place as the crew carry the largest word counts in the schedule, each at least a quarter above the median beat: they are played out, not summarised. The last beat is never the shortest: give it the median beat's words or more, because it is what the listener is left with. The last beat is the return: someone official asks for a clean ending and does not get one, and the specialist says in plain words what they now believe. Every beat has a set piece a listener will retell, and in every beat people speak to each other. Before the beats, a <cast> tag: three or four named people who speak, one line each, giving the name, what they are to the story, and how they talk: the words their work gives them, how long their sentences run, what they will not say. Not a catchphrase and not a verbal tic: a phrase a person says again and again is heard as a joke. The brief's ending is material for the beat before the last, not for the last.

`,

  sceneSignal: `<register>
One narrator reads this aloud to listeners who cannot see it. Name the feeling as it is felt, and the body with it. People speak in quoted lines, plainly, the way they speak at work; let the argument happen in the room. Each person speaks the way the schedule's cast says they do, and no two alike. {time} Keep only the numbers a person would say aloud, round the rest, and never put two exact figures in one sentence. One thing per sentence, short enough to say in one breath.
</register>`,

  /** The signal register's plain speech and spoken numbers, from a narrator who faces the listener: a teller, not a log. */
  sceneTeller: `<register>
One narrator tells this aloud to a listener they speak to as "you", and tells it to be believed. They say what they are about to tell and why it matters ("I'll start with the part nobody believes"), they say plainly what they know and what they do not, and they tell the listener when a detail will count later. The narrator faces the listener, not a diary: no log entries, no musing that circles back on itself. Name the feeling as it is felt, and the body with it. People speak in quoted lines, plainly, the way they speak at work; let the argument happen in the room. Each person speaks the way the schedule's cast says they do, and no two alike. {time} Keep only the numbers a person would say aloud, round the rest, and never put two exact figures in one sentence. One thing per sentence, short enough to say in one breath.
</register>`,

  /** The register's time sentence, by clarity.signposts. */
  timeScene: `When the time or the place changes, the first sentence says so. Give the hour when there is one.`,
  timeSpoken: `When the time moves, the beat's first words say so the way a person telling it would ("Two nights later", "By the end of that week"); give the hour only when it matters. The story's first sentence belongs to the narrator, not to a time and a place.`,

  /** What the opening and clarity keys add to one scene ask; absent when they add nothing. */
  sceneTelling: `<telling>
{lines}
</telling>`,

  sceneMaterial: `<material>
{material}
</material>

The material above is the brief's own vignette for this beat; use it as far as it serves the schedule, rewritten to sit in the story.`,

  sceneAsk: `Write beat {n} of the story, in a <scene> tag. Its job: {job}{whenLine} By its end the reader knows: {known} Still withheld after it: {withheld} Form: {form}. Under {cap} words. The schedule above has settled the story: write within it and add nothing it does not hold.{constraintLine} Output only the tag.`,

  // the listen screen's lines, applied to the sentences it measured at fault, not to the whole scene
  /** The title (title.ts): the examples are in the register of the narration channels' own titles, not quoted from them. */
  title: `Below is a story told aloud on a horror and science-fiction channel, and the premise it was written from. Write its title.

The title is two short sentences in Title Case, at most {words} words in all, with no colon, dash, subtitle or quotation marks. The first sentence places the narrator: the work they do, the place they are in, or what happened to them, in the story's own person (I, We or They). The second names the one wrong thing as a plain fact and leaves it unexplained. No name from the story; nothing the story holds back until its last third; nothing the story does not deliver.

The shape, in titles of the kind the channels run:
- I Run the Night Shift at a Dam. The Water Upstream Keeps Rising
- We Pulled a Core Sample in Antarctica. Something in It Was Still Warm
- I Monitor Deep-Space Probes. One of Them Started Answering
- They Flew Us Out to Fix a Weather Station. The Crew Before Us Never Left
- Our Town Tests Its Siren Every Noon. Yesterday It Did Not Stop
{kept}
<premise>
{premise}
</premise>

<story>
{story}
</story>

Output one <title> tag and nothing else.`,

  titleKept: `
The story keeps these back until late; the title names none of them:
{items}
`,

  sceneEdit: `<scene>
{scene}
</scene>

<sentences>
{sentences}
</sentences>

Each sentence listed above breaks this rule: {lines} Rewrite each one in the scene's own voice so it keeps the rule, and change nothing else: every event, name and line of speech stays. For each, output an <edit> tag containing <from> (the sentence, verbatim) and <to> (what stands in its place; two or three sentences are fine). Output only the tags. Under {cap} words.`,
  screenLedger: `<ledger>
{ledger}
</ledger>

{previous}<scene n="{n}">
{scene}
</scene>

{ask}`,
  screenLedgerAsk: `Check the scene against the ledger and against the previous scene. A reader sees only the scenes: report a line that states a fact the ledger or the previous scene settles otherwise, and nothing else. Not a finding: a figurative line (a simile, a metaphor, or a character's way of describing a feeling) read as literal fact; a character's loose, everyday wording of a fact the ledger states exactly; a line that hedges the fact it states; a count, a duration or a detail the scene leaves out. Report each contradiction in a <finding> tag containing <span> (verbatim quote from the scene, under ${RUN.spanWords} words), <statement> (one sentence), <result> (contradicts:<verbatim quote of the ledger line or previous-scene span>), <invalidates> (the beat number, or none), <replacement> (one positive sentence that would hold), <patch> (the span rewritten in the scene's own voice so the contradiction is gone, no longer than the span, ready to stand in its place word for word; or none when the fix needs more than that span). Then an <examined> tag naming what was compared. At most 6 findings. Under 500 words.`,
  // the binds of a whole draft fork one session that holds the ledger and every scene (model.ts); the base call asks nothing
  screenLedgerBase: `<base/>
<ledger>
{ledger}
</ledger>

{scenes}

These are the ledger and the scenes of one story. Each message after this one asks about one scene. Reply with <ready/> only.`,
  screenLedgerFork: `The scene to check is <scene n="{n}"> above{previous}. The other scenes are not part of this check.

{ask}`,

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
{fifth}{first}{last}{moved}

Output only the tags. Under 300 words.`,

  screenLastBeat: `
presence-arrives: by the end of this scene the thing the story has been withholding is in the same place as a character with nothing between them: not glass, a screen, a channel, a doorway it stays behind, or distance, and not only inferred.
cost-paid: by the end of this scene someone has lost something they cannot get back.
presence-in-room: the thing the story withholds acts in this scene, on the page, at the time: it touches, moves, breaks or takes a person or a thing. A thing that is seen, stands, or gestures and does nothing more is absent, as is one inferred from an instrument, heard over a channel, or remembered afterward.
cost-in-scene: the loss happens inside this scene as it happens, in the moment, and is not reported afterward or summarised by the narrator.`,

  screenTimeMoved: `
time-unplaced: this scene stands at a different point in the story's chronology from the scene before it — that one was {prev}, this one is {when} — and its opening does not tell the listener that the time has moved. Absent when the opening places the listener in the new time, in whatever words it chooses, before the scene's events begin.`,

  screenResolved: `resolved: the scene settles a question the schedule keeps open for a later beat.`,
  screenFirstBeat: `
hook-late: the first {window} words do not say what is wrong: the thing the story is about, or its first effect, is not named or shown before routine, setting or history.`,
  screenFirstBeatPromise: `
hook-late: the first {window} words do not say both who is telling this and what went wrong: the narrator's situation and the thing the story is about, or its first effect, are not both stated before routine, setting or history.`,
  screenFirstBeatCold: `
hook-late: the scene does not open inside the wrong thing: within its first {window} words the thing the story is about, or its first effect, is not happening on the page before routine, setting or history.`,
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
