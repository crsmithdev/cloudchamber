---
name: Cloud Chamber
description: A dark four-column console for judging what a story pipeline proposes.
colors:
  night: "#1a2126"
  surface: "#212a30"
  raised: "#28333a"
  ink: "#d9e0e3"
  mute: "#8797a0"
  dim: "#5f6e76"
  line: "#33414a"
  gold: "#e3b463"
  on-gold: "#1a2126"
  keep: "#8bd1a0"
  pass: "#ee8f8b"
  art: "#e9c36a"
  running: "#8fb8d9"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.1
  headline:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  prose:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "17.5px"
    fontWeight: 400
    lineHeight: 1.6
  prose-inline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.4
  machine:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  bar: "2px"
  tag: "3px"
  chip: "4px"
  control: "5px"
  panel: "6px"
  dot: "50%"
spacing:
  hair: "2px"
  xs: "0.35rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  read-x: "3rem"
  read-y: "2rem"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.on-gold}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  button-keep:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.keep}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  button-pass:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.pass}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  button-art:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.art}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  button-sm:
    typography: "{typography.label}"
    padding: "0.25rem 0.6rem"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0.2rem 0.55rem"
  chip-pressed:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0.2rem 0.55rem"
  input:
    backgroundColor: "{colors.night}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.6rem"
  badge:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.mute}"
    typography: "{typography.machine}"
    rounded: "{rounded.tag}"
    padding: "0.1rem 0.5rem"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.body}"
    rounded: "{rounded.chip}"
    padding: "0.4rem 0.5rem"
  nav-link-on:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.chip}"
    padding: "0.4rem 0.5rem"
  seg-button:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    padding: "0.4rem 0.8rem"
  seg-button-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.night}"
    padding: "0.4rem 0.8rem"
  status-dot:
    backgroundColor: "{colors.keep}"
    rounded: "{rounded.dot}"
    size: "7px"
---

# Design System: Cloud Chamber

## Overview

**Creative North Star: "The Night Desk"**

The stylesheet names it on its first line: a dark three-pane console, with the
interface in Instrument Sans, the passages in Newsreader, and the draw log and
identifiers in IBM Plex Mono. One operator sits at it for long stretches. He
reads twenty rows at once, judges, and moves on. The surface is a workbench,
not a page. It has no hero, no marketing register and no explanation of the
pipeline to the person who built it.

Three type registers do the work that colour and iconography do elsewhere. The
typeface says what a thing is before the reader parses it: sans is chrome,
serif is generated prose, mono is machine identity. Colour is spent on one
thing only, the verdict. Keep, pass, artifact and running each own a hue, and
one gold is held back for the chosen candidate, the selected row and the focus
ring. Nothing else is coloured.

Depth is tonal, never cast. Three slate greys step from the page to a pane to
a raised control, hairlines divide, and no surface throws a shadow. Selection
is a two-pixel inset bar on the left edge, not a fill. Disclosure is a caret
that opens content in place, so nothing is modal and the operator never loses
the list he came from.

**Key Characteristics:**

- Dark slate console, four fixed columns, hairline dividers
- Three type registers: sans chrome, serif prose, mono identity
- Colour means verdict; one gold accent for the chosen thing
- Dense chrome at 11 to 13.5px, tabular numbers, 7px status dots
- Tonal layering, no shadows
- Selection by inset bar, disclosure by caret, nothing modal
- Each column reflows on its own width through container queries

## Colors

Thirteen tokens, all cool slate but for five verdict hues, and the whole
palette lives on `:root` in `app/ui/src/styles.css`.

### Primary

- **Gold** (`gold`): the one accent. It marks the chosen candidate's bar, the
  inset selection bar on a row, the focus outline, a pressed source group and
  the `cell` identifier in an inspector. As a fill it appears only on the
  primary button and as a 10 percent gradient wash behind the chosen candidate.
- **On Gold** (`on-gold`): the text on a gold fill. It is the same value as
  the page background, so a primary button reads as a hole in the surface.

### Neutral

- **Night** (`night`): the page and the rail. Inputs use it too, so a field
  reads as recessed below the pane it sits in.
- **Surface** (`surface`): the list pane, the inspector, and every bordered
  panel: the seed, a brief file, the rounds table, the gate bar.
- **Raised** (`raised`): the hover and selected state of a row, the active
  nav link, the pressed chip, the default button face, the track of a
  probability bar.
- **Ink** (`ink`): primary text and the selected state of anything muted.
- **Mute** (`mute`): secondary text. Nav links, chips, buttons at rest, body
  copy in a candidate, the rail's pool counts.
- **Dim** (`dim`): tertiary text. Section headings, timestamps, help text,
  identifiers, the caret, placeholders, the disabled log steps.
- **Line** (`line`): every hairline. Pane borders, row dividers, control
  borders, the `todo` status dot, the profile rule.

### Verdict

- **Keep** (`keep`): a kept verdict, a done draw, an accepted finding, the
  best repair round, the default state of a status dot.
- **Pass** (`pass`): a passed verdict, a failed step, an error line, a high
  severity score and the reopen marker.
- **Art** (`art`): an artifact flag, a draw awaiting the gate, a scene over its
  word budget, a pending count. It sits close to gold on purpose: a flag is a
  judgement waiting, not a decoration.
- **Running** (`running`): a model call in flight, and nothing else.

### The light inversion

A `prefers-color-scheme: light` block swaps all thirteen values. Its accent is
a teal (`#2c7a72`) and its verdict hues are darkened for a pale page. It is a
mechanical inversion of the dark palette and whether it survives is an open
question in the redesign spec. This file documents the dark palette as
normative.

### Named Rules

**The Verdict Rule.** Colour means verdict, never brand. Keep, pass, art and
running are the only hues besides gold, and each appears only where its
verdict applies.

**The One Gold Rule.** Gold is reserved for the chosen thing: the chosen
candidate, the selected row, the focused control. It never fills a surface
larger than a button.

**The Tint Rule.** A verdict never fills a block. A badge, a chosen row or a
pressed art button is the verdict colour mixed at 10 to 20 percent into the
surface, with the text in the verdict colour itself.

## Typography

**Display Font:** Newsreader (with Georgia, serif), optical sizing on
**Body Font:** Instrument Sans (with system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, Menlo, monospace)

**Character:** A quiet humanist sans for the chrome, a transitional serif for
anything the pipeline wrote, and a mono for anything the machine named. The
three families are the information architecture. A reader learns in one
screen that serif means "read this" and mono means "this is an identifier".

### Hierarchy

- **Display** (Newsreader 500, 18px, 1.1): the wordmark in the rail, and only
  the wordmark. Its subtitle drops to an 11px sans in dim.
- **Headline** (Instrument Sans 600, 18 to 20px, tracking -0.01em): the draw
  name in the reading pane and the start form's title.
- **Title** (Instrument Sans 600, 12 to 12.5px, in dim): every section
  heading: `h2.sec`, the inspector's `h3`, a facet heading. A title is smaller
  than body text and lighter in colour. The hierarchy runs on weight and
  colour, not size.
- **Body** (Instrument Sans 400, 13.5px, 1.5): the base. Candidate premises,
  finding bodies and table cells step down to 12.5px.
- **Prose** (Newsreader 400, 17.5px, 1.6, max 38rem): a passage read in full.
  The same voice appears smaller wherever prose sits inside chrome: 15.5px in
  a scene, 15px italic in the seed, 14.5px in a table cell, a vignette preview
  or a quoted finding span, 14px in a list row title, 13.5px italic in a draw
  row's seed and a flag's quote.
- **Label** (Instrument Sans 500, 11 to 12px): chips, small buttons, table
  headers, crumbs, timestamps, facts. Numbers are always tabular.
- **Machine** (IBM Plex Mono 400, 10.5 to 12px): the step log, draw and step
  identifiers, badges, the `cell` code, checker names, pointers, the judge
  line and every `kbd`.

The incumbent uses 20 distinct sizes between 10.5 and 20px. The steps above
are the clusters they fall into. The redesign spec collapses them to seven.

### Named Rules

**The Register Rule.** The typeface tells you what a thing is. Chrome is sans,
generated prose is serif, machine identity is mono. A serif never labels a
control and a mono never carries a sentence.

**The Small Title Rule.** A section heading is smaller than the text under it
and set in dim. Headings orient; they do not announce.

**The Tabular Rule.** Every number that can sit under another number uses
tabular figures: scores, probabilities, counts, durations, timestamps.

## Layout

The shell is one CSS grid: a 168px rail, a 340px list pane, a fluid reading
pane with a 0 minimum, and a 268px inspector, at 100vh with each column
scrolling on its own. The rail collapses to 40px and its four links become
single mono letters. A reading pane can span the inspector's column (`wide`,
`span`) or the list's too (`full`, the browse table with filters hidden).

Panes carry their own padding: list and inspector at 0.75 to 1rem, the
reading pane at 2rem by 3rem, or 1.5rem when wide. Blocks inside the reading
pane cap at 58rem: the seed, a candidate, an example row, the brief pair and
the gate bar. Long prose caps at 38rem, a form or a scene at 40rem, a rounds
table at 46rem.

Density is the point. Rows run at 0.7rem vertical padding with a hairline
between them. Chip gaps are 0.35rem, control gaps 0.5rem, section gaps 1.25
to 1.75rem. The list pane's filter strip and the draws pane's new-draw bar are
sticky at the top of their column; table headers are sticky too.

A column reflows on its own width. The reading pane is a named container
(`pane`), and each column inside a two-column draw body is a container of its
own. At 58rem of pane the draw body splits three to two; the develop pane
splits at 50rem. Under 30rem a finding stacks its gutter above its body. At a
1100px viewport the whole shell falls to one column and the rail becomes a
horizontal strip.

### Named Rules

**The Own-Width Rule.** A block asks how wide its column is, not how wide the
window is. Breakpoints are container queries; the single media query is the
one that dissolves the shell.

**The 58rem Rule.** Nothing in the reading pane grows past 58rem unless the
pane has split into two columns, at which point the cap lifts.

## Elevation & Depth

No surface casts a shadow. Depth is three slate steps: night for the page,
surface for a pane or panel, raised for a control or a hovered row. A control
sits on the layer above its pane; an input sits on the layer below it. Every
edge is a 1px hairline in `line`.

`box-shadow` appears in exactly two roles and neither is a shadow: the 2px
inset selection bar, and the 3px halo ring around a waiting or running status
dot, drawn as the dot's colour at 25 percent.

### Named Rules

**The Hairline Rule.** Boundaries are 1px lines, never shadows or gradients.
The one gradient in the system is the 10 percent verdict wash behind a chosen
candidate or an accepted finding, and it fades to nothing by 70 percent of the
row.

**The Inset Bar Rule.** Selection is a 2px gold bar inset on the left edge of
the row, plus the raised fill on hover. Selection never recolours text.

## Shapes

Corners are small and scale with the thing. A bar or chart cell is 2px, a
tag, badge, `kbd` or icon button is 3px, a chip, nav link or `pre` is 4px, a
button, input, segmented control or flag card is 5px, a panel such as the seed
or a brief file is 6px. Status and finding dots are circles.

Recurring silhouettes: a 7px status dot, with a 3px halo when it waits or
runs; a 6px probability bar; a 1.9rem square score tile with a 1px border; a
1.1rem-wide caret that rotates 90 degrees when open; a 22px vertical hairline
that separates gate bar groups.

The incumbent uses six radii. The redesign spec collapses them to three.

## Components

### Buttons

- **Character:** flat, bordered, labelled in the body size. A button is a
  raised slate tile with a hairline that darkens on hover.
- **Shape:** control radius (5px), 1px border in `line`, padding 0.55rem by
  0.75rem, flex with space-between so a trailing `kbd` sits at the right edge.
- **Default:** raised fill, ink text, weight 500. Hover moves the border to
  `dim`. Disabled drops to 50 percent opacity.
- **Primary:** gold fill, on-gold text, weight 600, centred, no visible
  border. One per surface: Draw, Continue, the gate's accept.
- **Keep / Pass:** the default tile with the text in the verdict colour and
  the border as that colour at 35 percent.
- **Art:** the default tile with the text in art. Pressed, it fills with art
  at 18 percent and takes an art border.
- **Quiet:** no fill, mute text, centred. Archive, delete, prev, next.
- **Small:** 0.25rem by 0.6rem padding at label size, on any variant above.
- **Focus:** a 2px gold outline offset 1px, on every control in the system.
- **Motion:** colour, background and border transition at 120ms, and only
  when the user has not asked for reduced motion.

### Chips

- **Style:** transparent, 1px `line` border, mute text at 11.5px, chip radius
  (4px), 0.2rem by 0.55rem padding.
- **State:** pressed (`aria-pressed`) fills raised, lifts the text to ink and
  the border to `dim`. Hover lifts the text only.
- **Use:** the kind switch in the browse pane, the genre shortcuts on the
  start form, the filter toggle.

### Inputs / Fields

- **Style:** night fill, ink text, 1px `line` border, control radius, 12.5px,
  0.5rem by 0.6rem padding, full width. A textarea resizes vertically from
  4.5rem; the seed textarea is 15px Newsreader.
- **Focus:** the system outline. No glow, no border shift.
- **Placeholder:** dim.
- **Error:** a line of 12.5px text in pass under the control, never a red
  border.
- **Select:** a raised tile with an inline chevron SVG in mute at the right.
- **Segmented control:** a raised, bordered strip of buttons divided by
  hairlines. The pressed segment inverts to ink on night.
- **Field:** an 8rem label column then the control, hairline above, 0.9rem
  vertical padding. Help text sits under the control in dim at 12.5px.

### Navigation

- **Rail:** 168px, night, hairline on the right, wordmark then four links then
  the pool counts pinned to the bottom. A toggle in the top corner collapses
  it to 40px, where each link is one mono letter and a 6px art dot marks a
  tab with a flag.
- **Link:** mute, weight 500, chip radius, 0.4rem by 0.5rem. Active fills
  raised and lifts to ink. Hover lifts to ink. A trailing count is dim and
  tabular.
- **Crumbs:** dim 11.5px, bold words in mute, 0.75rem apart, above the
  reading pane's content.

### Rows

- **List row:** a grid of title and meta, 0.7rem by 0.75rem, hairline below.
  Hover fills raised; selected fills raised and takes the inset bar. The
  title is 14px Newsreader clamped to two lines.
- **Draw row:** the same shell, with a name line, a status line led by a
  status dot, a two-line italic seed preview and a mono identifier. An old
  or archived draw drops its lines to 60 percent opacity. An open row grows
  a facts list and the step log in place.
- **Table row:** 12.5px cells, 0.6rem padding, hairline below, sticky header
  in dim at 11.5px. Hover tints the cells with surface at 60 percent; the
  selected row fills surface and its first cell takes the inset bar. The text
  cell is 14.5px Newsreader at 42 percent width and opens to full pre-wrapped
  text with its verdict tools beneath.

### Badge and status dot

- **Badge:** mono 11px, tag radius, the status colour at 20 percent behind
  text in the status colour. Neutral badges use mute.
- **Dot:** 7px circle. Keep by default, art with a halo when waiting, running
  with a halo when in flight, pass when failed, `line` when still to do,
  `dim` for a repair.

### Metadata-gutter row

The signature component. Five blocks share it: a candidate, a finding, a
beat, a claim and a flag.

- **Shape:** a grid of a fixed gutter, a fluid body and optional actions,
  0.8rem vertical padding, hairline above, 1rem gaps. The gutter is 6 to
  9.25rem wide depending on the block; the redesign spec unifies it.
- **Gutter:** the score or number in 15px weight 600 tabular with a dim
  index beside it, a 6px bar in raised with a mute fill, then tags in gold
  at 11px, then a small button.
- **Body:** 12.5px sans at 1.55, with the generated text in serif under it:
  a vignette preview clamped to two lines, a quoted span in italic with dim
  quotation marks, a beat's job at 14px.
- **Chosen or accepted:** the row bleeds 1rem into its margins and takes the
  10 percent verdict wash. Dismissed rows drop to 55 percent opacity.
- **Actions:** a column of small buttons at the right, with a mono state line
  aligned right beneath them.

### Log

A mono list under a left hairline. Each step is a grid of a status dot, the
stage name with dim suffixes for candidate index, attempt and failure, and a
tabular duration at the right. Depth is indentation. The selected step takes
gold at 14 percent; a step still to come sits at 45 percent opacity.

### Disclosure

A `details` element or a fold button with a 1.1rem caret in dim. Open rotates
the caret 90 degrees and the content appears in place under the summary. The
vignette preview toggles from a two-line clamp to the full markdown by the
same means. Nothing opens a modal or leaves the pane.

### Panels

The seed, a brief file, the rounds table, the reopen note and the gate bar
share one shell: surface fill, 1px `line` border, panel radius (6px), 0.6 to
1rem padding. The seed sets its text in 15px italic Newsreader with a dim sans
label above. The gate bar lays its controls in a wrapping flex row with a
22px hairline between groups. `pre` uses the same shell at chip radius, 12px,
and scrolls past 28rem.

## Do's and Don'ts

### Do:

- **Do** keep the four-column grid: rail 168px, list 340px, fluid reading
  pane, inspector 268px, each scrolling on its own.
- **Do** set generated prose in Newsreader and identifiers in IBM Plex Mono.
  A step name, a draw id, a `cell` code and a badge are always mono.
- **Do** mark selection with the 2px gold inset bar and a raised fill.
- **Do** use tabular figures for every count, score, probability and time.
- **Do** keep chrome between 11 and 13.5px and headings at 12 to 12.5px in
  dim, weight 600.
- **Do** reflow a block on its container's width, not the viewport's.
- **Do** open content in place with a caret. A vignette, a step log, an
  example passage and a brief file all expand under their summary line.
- **Do** show a status dot beside every status word, with a halo when the
  state is waiting or running.

### Don't:

- **Don't** cast a shadow. Depth is night, surface, raised and a hairline.
- **Don't** use colour for anything but a verdict, a running state or the
  chosen thing. No brand colour, no decorative hue.
- **Don't** fill a block with a verdict colour. Mix it at 10 to 20 percent
  and put the verdict in the text.
- **Don't** open a modal, a drawer or a toast. The operator stays in the
  list he is judging.
- **Don't** enlarge a heading to show hierarchy. Weight and dim do it.
- **Don't** set a sentence in mono or a control label in serif.
- **Don't** add marketing register: no exclamation, no onboarding copy, no
  explanation of the pipeline to its author.
