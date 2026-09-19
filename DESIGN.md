---
name: Cloud Chamber
description: A nautical almanac read at a chart table at night; the draw is a table before it is a page.
colors:
  desk: "#0d1114"
  sheet: "#151b1f"
  raised: "#1c242a"
  hair: "#2a343b"
  rule: "#5a6970"
  ink: "#d6dde0"
  mute: "#8a98a0"
  dim: "#778790"
  gold: "#e3b463"
  keep: "#8bd1a0"
  pass: "#ee8f8b"
  art: "#e9c36a"
  running: "#8fb8d9"
typography:
  head:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
    fontVariation: "all-small-caps"
  chrome:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tabular-nums"
  cell:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.45
  name:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  prose:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.55
  mark:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.1
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: "0"
  dot: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  pane: "2.5rem"
components:
  btn:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    rounded: "{rounded.none}"
    padding: "0.1rem 0.55rem 0.2rem"
  btn-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  btn-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.desk}"
    rounded: "{rounded.none}"
    padding: "0.1rem 0.55rem 0.2rem"
  btn-primary-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
  btn-keep:
    backgroundColor: "transparent"
    textColor: "{colors.keep}"
  btn-pass:
    backgroundColor: "transparent"
    textColor: "{colors.pass}"
  btn-art:
    backgroundColor: "transparent"
    textColor: "{colors.art}"
  btn-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
  btn-pad:
    padding: "0.35rem 0.9rem 0.45rem"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.chrome}"
    rounded: "{rounded.none}"
    padding: "0.15rem 0.5rem"
  chip-on:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  seg-item:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    padding: "0.15rem 0.7rem 0.25rem"
  seg-item-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.desk}"
  input:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    rounded: "{rounded.none}"
    padding: "0.3rem 0.5rem"
  head:
    textColor: "{colors.mute}"
    typography: "{typography.head}"
  mark:
    rounded: "{rounded.dot}"
    size: "9px"
  row:
    backgroundColor: "transparent"
    padding: "0.6rem 0.75rem"
  row-on:
    backgroundColor: "{colors.raised}"
  table-cell:
    padding: "0.55rem 0.5rem"
  table-row-open:
    backgroundColor: "{colors.raised}"
  table-row-spans:
    padding: "1rem 0.5rem 1.25rem 4.75rem"
---

# Design System: Cloud Chamber

## Overview

**Creative North Star: "The Tide Table"**

A nautical almanac read at a chart table at night. The desk is cold and near
black; the panes are dusky sheets one step lighter, never cream. The draw is a
table before it is a page: five premises are five rows of one ruled table,
ranked by a column of numbers, and the prose is a row that opens. The world
refuses the card-and-pill dashboard and the chat transcript.

Hierarchy is carried by rule, case, weight and tone, not by size or by boxes.
Two rule weights do the structural work: a hairline between rows and a heavy
rule under every column head. Column heads are small-caps sans. Every number
is tabular and set in the mono. Generated prose is the serif, at cell size in
a row and at reading size only when the row is open. State is a mark in a
fixed cell: filled holds, hollow does not, a strike passes, a tick confirms.
Colour lives on the mark and on the verdict control that casts it; the
surfaces stay grey. Gold marks the operator's position: the focused control,
the one primary control on a surface, the inset bar of the opened row.

The product voice is terse and factual, and the chrome matches it: short
lower-case labels, no exclamation, no marketing register. Density is a
feature; the operator reads twenty rows at once on purpose.

**Key Characteristics:**
- One chrome size (12.5px); rank by weight, small caps, tone and rule
- Three type registers: sans for the interface, serif for generated prose, mono for every number and identifier
- Two rule weights: 1px hair between rows, 2px rule under a head
- Colour on the mark and the verdict control only; no coloured fill, panel or border
- Gold for the operator's position: focus, one primary control, the selection bar
- Square corners everywhere but the round mark; no drop shadows
- The running state is a sweep under the thing in flight, not a spinner

## Colors

A cold blue-grey desk in five tonal steps, one warm gold for the operator's
hand, a verdict triad and one running blue.

### Primary
- **Chart Gold** (`gold`, #e3b463): the operator's position. The focus ring
  (2px outline, 1px offset), the one primary control on a surface, the 2px
  inset bar on the selected list row, nav link, facet option and opened table
  row, the chosen candidate's bar and mark, the text selection wash (30%),
  the open step-log row (14% wash) and the range thumb.

### Secondary
- **Keep Green** (`keep`, #8bd1a0): a held state. The filled mark of a done
  step or a kept passage; the text of the keep control.
- **Pass Red** (`pass`, #ee8f8b): a failed or passed state. The filled mark of
  a failed step, the strike, the text of the pass control, error text.
- **Artifact Amber** (`art`, #e9c36a): a flag or a wait. The hollow mark of a
  gate that waits, the filled mark of an artifact, the overflow bar, warning
  text, the text of the artifact control.

### Tertiary
- **Running Blue** (`running`, #8fb8d9): work in flight. The sweep, the mark
  of a running step (35% fill), the running state word, the list row's inset
  bar and the strip's bottom rule while a draw runs.

### Neutral
- **Desk** (`desk`, #0d1114): the page background, the rail, the reading pane,
  input fields and sticky table heads.
- **Sheet** (`sheet`, #151b1f): the list pane, its sticky head, and `pre`
  blocks. One step above the desk.
- **Raised** (`raised`, #1c242a): the selected or opened row, a pressed chip,
  the empty bar track and the paragraph histogram. Hover on a row is this at
  60%.
- **Hair** (`hair`, #2a343b): the 1px hairline between rows, pane borders,
  chip and input borders, the scrollbar thumb, the todo mark's ring.
- **Rule** (`rule`, #5a6970): the 2px heavy rule under a table head, a strip
  and the form's action row; the 1px border of a control and a segmented
  group; a blockquote's left edge.
- **Ink** (`ink`, #d6dde0): body text, a name, a control's label, the pressed
  segment's fill.
- **Mute** (`mute`, #8a98a0): column heads, section heads, field labels, the
  chip and quiet control at rest, the empty mark's ring, the bar's fill, the
  status line of a row.
- **Dim** (`dim`, #778790): notes after a head, help text, ids and times,
  the faded rows beside an open one, key labels in a facts list, placeholders.

### Named Rules
**The Marks-Only Rule.** Colour belongs to the mark, to the state word beside
it, and to the verdict control that casts it. No surface, panel, border or
row takes a verdict colour; the only coloured fills are the mark, the primary
control, and low-alpha washes on a pressed verdict control (18%), a running
mark (35%) and the open log row (14%).

**The One Gold Rule.** Gold is where the operator is: the focus ring, one
primary control per surface, the 2px inset bar on the selected row, and the
chosen candidate's bar and mark. A second gold fill on a surface is a defect.

**The Three-Step Tone Rule.** Text has three tones: ink for the thing, mute
for the label of the thing, dim for the note about it. Rank is tone, never a
fourth grey.

## Typography

**Display Font:** Newsreader (with Georgia, serif); the wordmark at the mark
step only
**Body Font:** Instrument Sans (with system-ui, sans-serif)
**Prose Font:** Newsreader (with Georgia, serif); generated text and seeds
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, Menlo, monospace)

All three are self-hosted (latin and latin-ext, `font-display: swap`). Icons
are a Material Symbols Rounded subset of eight names, set at 1.3em, weight
400, optical size 20; they are ligatures, never glyph characters.

**Character:** A workmanlike sans that stays out of the way of a warm
text-face serif; the mono makes every number and identifier a fact on the
chart. Small caps with 0.08em tracking are the almanac's column heads.

### Hierarchy
- **Head** (500, 12.5px, 1.4, all-small-caps, 0.08em, mute): column heads,
  section heads, field labels, headings inside rendered prose. A note after a
  head drops the small caps and goes dim.
- **Chrome** (400, 12.5px, 1.45, tabular figures): every interface string,
  control, chip, input, note and fact. The one chrome size.
- **Name** (600, 15px, 1.3): the draw name in a pane's head strip. A row's
  name is chrome at 600.
- **Mark** (500, 18px, 1.1): the wordmark in the rail (serif) and the start
  form's title (sans, 600).
- **Cell** (400, 14.5px, 1.45, serif): generated prose inside a table row: a
  premise, a passage, a finding's quote (italic, dim quote marks).
- **Prose** (400, 14.5px, 1.55, serif, 66ch): an opened row's vignette, a
  brief, a scene, a rendered markdown body. An opened passage keeps this size
  at a 38rem measure, pre-wrap.
- **Mono** (400 to 600, inherits size): probabilities, word counts, ids,
  times and seconds in the step log, cell slugs, file names, mini nav letters,
  `kbd` (never small caps). Words are the sans even when they name a checker,
  a section or a flag kind: the mono is not a costume for "technical". The
  step log names its steps in the sans.

### Named Rules
**The One Chrome Size Rule.** Interface text is 12.5px. Rank inside the chrome
is weight (500, 600), small caps, the ink/mute/dim step and the rule under
it. Never add a second chrome size.

**The Three Registers Rule.** Sans for the interface, serif for what the
pipeline wrote, mono for every number and identifier. A number in the sans is
a defect; a label in the serif is a defect.

**The One Prose Size Rule.** Generated prose is 14.5px, in a closed row and
in the opened row's span alike. Opening a row changes the leading and the
measure, not the size.

## Layout

The shell is a three-column grid: a 168px rail, a 340px list pane and a
fluid reading pane, at full viewport height, each column scrolling on its
own. The rail folds to a 40px strip of mini nav letters (mono, one letter per
tab); the choice persists. Under 1100px the shell is one column: the rail
becomes a wrapped row with a hairline under it, the list pane stacks above the
reading pane, and the reading pane's side padding drops from 2.5rem to 1rem.

The reading pane pads 1.5rem 2.5rem 4rem and is an inline-size container. A
draw's body is a fluid table beside a 19rem aside (the draw's facts, the repair rounds, the step log), gapped
2.5rem; the wide variant splits 3fr/2fr. When the pane is under 1150px the
body collapses to one column and the aside moves under the table.

The list pane's head is sticky with a 2px rule under it. Its rows pad 0.6rem
0.75rem with a hairline between them. Table cells pad 0.55rem 0.5rem; heads
pad 0.25rem 0.5rem 0.35rem. The opened row's span pads 1rem 0.5rem 1.25rem
4.75rem, indented to the premise column, and closes with a 2px rule. The
premise column holds 26rem minimum until the pane narrows.

Forms cap at 44rem: an 8rem label column, the control, then its help under
the control, each row opening with a hairline and the action row with a 2px
rule. Prose caps at 66ch, a passage at 38rem, the lede at 40rem.

Spacing is rem-based on quarter steps: 0.25, 0.5, 0.75, 1, 1.25, 1.5 and
2.5rem. Section heads sit 1.5rem above their table and 0.25rem above the rule.

## Elevation & Depth

No drop shadows. Depth is tonal and ruled: the desk, the sheet one step up
for the list pane, the raised fill for the row in hand. Structure is drawn
with two rule weights, a 1px hairline (`hair`) between rows and around
inputs, and a 2px rule (`rule`) under a table head, a head strip and the
form's action row. The only `box-shadow` in the system is the 2px inset
selection bar, which is a rule drawn inside the cell, not a shadow.

### Shadow Vocabulary
- **Selection bar** (`box-shadow: inset 2px 0 0 #e3b463`): the left edge of
  the selected list row, nav link, facet option and opened table row. Running
  blue in place of gold on a list row whose draw is in flight.

### Named Rules
**The Two Rules Rule.** Every division is a 1px hairline or a 2px rule. There
is no third weight, no box and no shadow.

**The Fill-In-Hand Rule.** The raised fill marks one thing per pane: the row
that is selected or open. Hover is the same fill at 60%. Nothing else is
filled.

## Shapes

Square. Every control, chip, input, segment, table and pane has a 0 radius.
The one round form is the state mark, a 9px dot (7px small) with a 1.5px ring,
at 999px. Borders are 1px in `hair` (chip, input) or `rule` (control,
segmented group); a control's border goes ink on hover. There is no clipping,
no pill and no rounded card.

## Components

Restrained and flat: a control is small caps in a hairline box; state is a
mark; selection is a fill and a bar.

### Buttons
- **Shape:** square (0), 1px border in `rule`
- **Default:** transparent, ink text, small caps at 600 with 0.08em tracking,
  padding 0.1rem 0.55rem 0.2rem; `pad` widens to 0.35rem 0.9rem 0.45rem
- **Hover / Focus:** the border goes ink; focus is the 2px gold outline;
  colour and border transition in 0.12s under no reduced-motion preference
- **Primary:** gold fill, desk text, gold border; hover lifts the fill 15%
  toward white; disabled drops to transparent, dim text, hair border. One per
  surface.
- **Keep / Pass / Art:** the verdict triad; text in keep, pass or art on the
  transparent box; pressed (`aria-pressed`) takes an 18% wash of its own
  colour and a border in it
- **Quiet:** mute text, no visible border; hover and pressed bring the ink
  text and the rule border back
- **Disabled:** opacity 0.45, no hover change
- **Link control:** the bare `link`: dim text, no box, ink on hover; `mono`
  for an identifier

### Chips
- **Style:** transparent, mute text, 1px hair border, padding 0.15rem 0.5rem,
  chrome size, no small caps
- **State:** pressed or `on` takes the raised fill, ink text and a rule
  border; hover brings ink text

### Segmented Control
- **Style:** an inline row inside one 1px rule border; segments split by a
  1px rule; small caps at 600, mute text, padding 0.15rem 0.7rem 0.25rem
- **State:** the pressed segment reverses to an ink fill with desk text

### Marks
- **Shape:** 9px round, 1.5px ring in mute; `small` is 7px
- **States:** `held` filled keep; `wait` hollow art ring; `fail` filled pass;
  `run` running ring with a 35% running fill; `todo` hair ring; `rep` filled
  dim; `art` filled art; `gold` filled gold for the chosen candidate; the
  strike is a 12px by 1.5px pass line
- **Placement:** a fixed state column in a table or the second line of a list
  row; the mark carries colour so the text need not

### Bars
- **Style:** 5px tall, raised track, mute fill; `over` fills art, `gold`
  fills gold for the chosen candidate; the width is the value

### Section and Column Heads
- **Style:** head step (12.5px small caps, 500, 0.08em, mute); a note after
  the head is dim, normal case, joined by a middle dot
- **Table head:** the same, above a 2px rule; sticky heads take the desk fill
- **Section head:** 1.5rem above, 0.25rem below, baseline-aligned with its
  note

### Ruled Table
- **Style:** full width, collapsed borders; a hairline under each cell; a
  2px rule under the head row; cells pad 0.55rem 0.5rem, top aligned;
  numbers in the mono `num` cell, never wrapping
- **Pick row:** pointer cursor; hover is the raised fill at 60%
- **Opened / selected row:** the raised fill and a 2px gold inset bar on the
  first cell; its bar goes gold. A reversed light line was tried and read
  wrong on the desk.
- **Faded rows:** while one row is open the others drop to dim text
- **Span row:** the opened prose, indented 4.75rem to the premise column,
  padded 1rem above and 1.25rem below, closed by a 2px rule
- **Old rows:** opacity 0.65
- **Fixed layout:** every column but the text takes its head's width, the
  text takes the rest and wraps anywhere

### List Row
- **Style:** a grid of lines padded 0.6rem 0.75rem with a hairline under:
  name (600 ink) and time (mono dim); a mark and a status line in mute; a
  two-line clamped italic serif seed at cell size (14.5px); the id in mono at head size
- **State:** hover is the raised fill at 60%; `on` is the raised fill and the
  gold inset bar; a running row's bar is running blue; `old` rows fade to
  0.65

### Step Log
- **Style:** a mono time table, stage · started · seconds, cells padded
  0.2rem 0.4rem with a hairline under; the open row takes a 14% gold wash;
  rows still to come sit at 0.65 opacity
- **Running:** the row sweeps and its seconds cell ticks

### Head Strip and Controls
- **Strip:** the pane's first line: the name at 15px 600, the state (mark and
  word), the id in mono, then the tools pushed to the end; baseline aligned
  with a 2px rule under. A running strip's rule goes running blue.
- **Controls:** a wrapped row under the strip, closed by a hairline; groups
  split by a left hairline; a text input in it is 14rem, a range 6rem

### Inputs / Fields
- **Style:** desk fill, ink text, 1px hair border, padding 0.3rem 0.5rem,
  chrome size, square; a placeholder is dim; the select is the same box with
  an inline chevron in mute and 12rem minimum
- **Hover / Focus:** the border goes rule; focus is the gold outline
- **Textarea:** full width, 4.5rem minimum, vertical resize; in a field the
  seed textarea is the serif at prose size (14.5px)
- **Field:** 8rem small-caps label column at mute, the control, help under
  the control in dim; rows open with a hairline, 0.8rem of padding each side
- **Error / Warning:** text in pass or art; no coloured border or fill

### Navigation
- **Logo:** the pair mark: an ink spiral each side of a gold vertex. Ink
  strokes at 6.5 in a 100-unit box, round caps; gold on the vertex only. It is
  2.75rem wide beside the wordmark and 1.75rem alone at the head of the
  folded rail. The tab icon sets it on a desk square at stroke 9, so it holds
  at 16px
- **Rail:** 168px, desk fill, a hairline on the right; the logo, then the wordmark in the
  serif at 18px with "ideation pipeline" under it in head size dim; the four
  tabs as links at 500 in mute, ink when on with the gold inset bar, a mono
  count in dim at the end; the pool counts at the bottom in dim
- **Folded:** a 40px strip: the logo, then 1.75rem mono letter squares
- **Mobile:** a wrapped row under the wordmark with a hairline under it; the
  fold button and pool hide

### Facets
- **Style:** blocks in the list pane with a hairline under each; a head, then
  options as full-width text buttons in mute with a mono count in dim at the
  end; the chosen option is ink with the gold inset bar

### Prose
- **Style:** the serif at prose size, 66ch; headings inside it drop to the
  head step (small caps, mute); blockquotes take a 1px rule on the left and
  mute text; code is the mono at 0.85em; a seed is the serif italic at prose size;
  a quote is the serif italic at cell size with dim quote marks

### The Sweep
The running state: a 2px running-blue rule that travels under the thing in
flight (a status word, a strip, a log row), 1.6s linear, repeating; it stands
still under a reduced-motion preference. Never a spinner, never a pulsing
dot.

## Do's and Don'ts

### Do:
- **Do** set every number and identifier in IBM Plex Mono with tabular
  figures; a probability, a word count, a time, an id, a slug.
- **Do** rank chrome by weight, small caps and the ink/mute/dim step at one
  size (12.5px); a column head is the same size in small caps at 500.
- **Do** divide with the two rule weights only: a 1px hairline between rows,
  a 2px rule under a head, a strip and an action row.
- **Do** mark the selected or opened row with the raised fill and the 2px
  gold inset bar, and fade the rows beside an opened one to dim.
- **Do** put state in a fixed column as a mark: filled holds, hollow does
  not, a strike passes; colour on the mark, its state word and its verdict
  control.
- **Do** keep one gold primary control per surface and give focus the 2px
  gold outline.
- **Do** show a running step as the sweep under it and a ticking seconds cell.
- **Do** open generated prose in a span row under its table row, in the
  serif at 14.5px and 66ch; a passage at 14.5px and 38rem.
- **Do** keep every corner square except the round mark.

### Don't:
- **Don't** add a box, a card, a panel or a coloured fill to fix hierarchy;
  fix it with a rule, a weight or a tone.
- **Don't** add a second chrome size, a drop shadow or a third rule weight.
- **Don't** put a state word in a pill, or fill a row, a panel or a surface
  by its state; state is the mark, the inset bar, the strip's rule and the
  sweep.
- **Don't** spend gold on a second fill, a heading or decoration; gold is the
  operator's position.
- **Don't** set a number in the sans, or a label in the serif; the serif is
  for what the pipeline wrote.
- **Don't** round a control, a chip, an input or a table cell; the mark is
  the only circle.
- **Don't** use a spinner, a pulsing dot or a progress ring for a running
  state.
- **Don't** raise the interface register: labels stay short, lower case and
  factual, with no exclamation.
