# UI redesign: the night desk, on Tailwind

The UI is four pages of hand-written React over one 395-line stylesheet. The
stylesheet has a real idea in it. The code around that idea has drifted.

This file is the design of record for the redesign. Decided with Chris on
2026-09-15. `PRODUCT.md` holds the product truth the redesign must preserve;
this file holds the visual contract and the order of work.

> Landed on `main` on 2026-09-16 (`2f7c641`): phase D1, the tide table won.
> The worktree and branch named here are gone, and `DESIGN.incumbent.md` is
> no longer needed.

The work happened in the worktree `.worktrees/ui-redesign`, on branch
`refactor/ui-redesign`.

## Why

Measured over `app/ui/src`, 1475 lines of TSX and 395 lines of CSS:

| Fact | Value |
|---|---|
| Distinct font sizes | 20 — ten in `font-size`, ten more inside `font:` shorthands, 10.5px to 20px |
| Border radii | 6 — 2, 3, 4, 5, 6px and 50% |
| Classes | 188, of which 63 are one to three letters (`.t`, `.w`, `.l1`, `.sd`, `.j`) |
| Inline `style={{}}` | 44 — 29 in `Develop.tsx`, 14 in `Draws.tsx` |
| Linters or formatters | none |
| Polling loops | 4 near-identical `setInterval` pairs at 2.5s busy, 15-20s idle |

The colour tokens, the container queries and the three type families are
sound. The scale, the component boundary and the class names are not.

## The essence

Eight invariants. `styles.css:1` states the first one itself: "Night desk: a
dark three-pane console. Interface in Instrument Sans, passages in Newsreader,
the draw log and identifiers in IBM Plex Mono."

| # | Invariant | Where it lives today |
|---|---|---|
| 1 | Three type registers carry meaning. Sans is chrome, Newsreader is generated prose, mono is machine identity. The typeface tells you what a thing is. | all four pages |
| 2 | A workbench, not a page. Four columns: rail 168px, list 340px, fluid reading pane, inspector 268px. The rail collapses. | the `.app` grid |
| 3 | Colour means verdict, never brand. keep, pass, art, running, and one gold accent reserved for the chosen thing. | `.badge.*`, `.st.*`, `.cand.chosen` |
| 4 | The metadata-gutter row is the repeating unit: a fixed label column with score, bar and tags, then a fluid body, then actions. | `.cand`, `.finding`, `.beat`, `.claim`, `.flag` |
| 5 | Density earns its pixels. 11-13px chrome, tabular numbers, 1px hairlines, a 7px status dot, no shadows. | throughout |
| 6 | Selection is an inset accent bar, not a fill. | `inset 2px 0 0 var(--accent)` |
| 7 | A column reflows on its own width, not the window's. | `@container pane`, `.drawbody .col` |
| 8 | Progressive disclosure by caret. Line-clamped previews open in place. Nothing is modal. | `details.ctx`, `button.fold`, `.vigtoggle` |

A redesign that keeps these is a refinement in impeccable's vocabulary, however
far it rebuilds what sits inside them. A redesign that drops invariant 2 or
invariant 1 is a replacement, and replaces `DESIGN.md`.

The test of faith is simple: a screenshot after the work still reads as Cloud
Chamber.

## Drift to discard

The 20 font sizes. The 6 radii. The 63 cryptic class names. The 44 inline
styles. The `▸` text caret and the one raw `<svg>`, both of which Chris
annotated "use an icon font". Table CSS written twice, once for `table` and
again for `.rounds table`. The one-off blocks `.cons`, `.slop`, `.chart` and
`.md`. The five gutter widths — 7, 7.25, 7.75, 9 and 9.25rem — that make one
repeating row look like five.

The light theme is a mechanical inversion of the dark one and its teal accent
reads as a different product. Whether it survives is open.

## What the redesign must hold

From `PRODUCT.md`, the two facts that constrain the visual work most:

1. **Three of the four tabs hold a running operation and a judgement surface at
   the same time.** A draw runs 36 minutes and 79 calls, detached. Ideate,
   check and write each show work in progress beside the thing being judged.
   Browse is the only pure workbench. One surface carrying both registers is
   the central problem, not a choice between them.

2. **Four tabs is the final shape.** Red-teaming shipped as the check tab: the
   six checkers, the repair rounds and gate 1. The write tab produces the
   story. No fifth stage is designed for.

## The stack

| Layer | Decision |
|---|---|
| CSS | Tailwind v4 via `@tailwindcss/vite`. CSS-first, no `tailwind.config.js` |
| Tokens | the 12 colours keep their exact hexes, moved into `@theme` |
| Type scale | 20 ad-hoc sizes become 7 steps |
| Radii | 6 values become 3 |
| Fonts | `--font-sans` Instrument Sans, `--font-serif` Newsreader, `--font-mono` IBM Plex Mono, self-hosted |
| Icons | one `<Icon>` component over Material Symbols, full name list |
| Dark mode | `@custom-variant dark`, so a manual toggle stays possible |
| Lint | `prettier-plugin-tailwindcss` for class order, `eslint-plugin-jsx-a11y` |
| Component layer | **open**: shadcn/ui, Base UI, or hand-written primitives. Decided when a direction exists, because the direction decides which overlays are needed |

Primitives to build, sized by current usage: `Btn` (43 uses) with its
`primary`, `keep`, `pass`, `art`, `quiet` and `sm` variants, `Chip` (10),
`Field` (12), `Section` heading (22), `Dot` (6), `Seg` (3), `Badge`, `Bar`,
`Caret`, `Facts`, `Icon`, and one `Row` that absorbs `cand`, `finding`,
`beat`, `claim` and `flag`.

## Order of work

Phases 0 to C write no application code.

| Phase | Work | Output |
|---|---|---|
| 0 | `impeccable context`, `init`, `hooks on`, `document` | `PRODUCT.md`, `DESIGN.md`, and `DESIGN.incumbent.md` as the copy |
| A | `shape`, then `new-work`: two divergent worlds, each named with a point of view | two direction contracts |
| B | mock both over real fixtures | static HTML at 1920 and 1280 |
| C | judge against the four questions below | a world, or neither |
| D1 | a world wins: replace `DESIGN.md`, port the app, then `extract`, `typeset`, `layout`, `clarify`, `polish` | the redesigned UI |
| D2 | neither wins: restore `DESIGN.incumbent.md`, run the constrained refinement | tokens, primitives and icons only |

Rules the order depends on:

1. **`document` runs before anything changes.** `DESIGN.md` is generated from
   the incumbent code, so the language is derived rather than translated.
   `cp DESIGN.md DESIGN.incumbent.md` immediately. `redesign` replaces
   `DESIGN.md` and impeccable refuses to "split the difference into polish on
   the discarded look", so without that copy phase D2 does not exist.

2. **Two worlds, not one.** With one alternative, "it does not feel right"
   cannot be told apart: a direction failure and an execution failure look the
   same. The incumbent is the third thing in the comparison.

3. **Mockups use `tmp/mockups/`.** `gen.ts` there already renders all four tabs
   from real store fixtures — `draws.json`, `gate.json`, `checked.json`,
   `findings.json`, `brief.json`. The four-tab IA was decided from exactly
   these mockups on 2026-09-10. A world costs a stylesheet and a regenerate.

4. **The mockup stylesheets are Tailwind from the start.** Each world gets its
   own `@theme` block rather than a fork of `styles.css`. So the winner's
   tokens and utilities carry straight into the app, the CSS is authored once,
   and the worlds are judged in the system that ships. Tailwind therefore
   enters the worktree at phase B, not phase D.

5. **Real content, always.** A console mockup with placeholder text flatters
   itself about density, which is the thing being judged. Prose length is most
   of what density means here.

6. **The draw page goes first.** It carries the gate decision, the seed, five
   candidates with score bars and vignettes, the crumbs and the draw controls.
   It is the densest surface and every pending annotation sits on it. If a
   world survives it, the check page is the harder second test.

## The test

Written before the mockups exist, so "feel" has something to bite on.

1. At 1920, can Chris pick a premise at the gate without scrolling?
2. Do the three type registers still tell him what a thing is — chrome, prose,
   machine identity?
3. Does a running draw's state read from across the room?
4. Is anything he currently uses now hidden?

A world that fails three of four is a direction failure; drop it. A world that
fails one is an execution note worth a second pass.

## Decided

| Decision | Value |
|---|---|
| Users | one operator now, other writers possible later. No onboarding, accounts or roles |
| Registers | ideate, check and write are both monitor and workbench. Browse is a workbench |
| Tabs | four, final |
| Build path | code-first. `buildPath: "code"` in `.impeccable/config.json` |
| Design hook | enabled. It fires on Edit or Write to UI files |
| Mockup CSS | Tailwind v4 with a per-world `@theme` |
| Depth | rebuild what sits inside the eight invariants; the shell itself is open only if a world argues for it and Chris agrees |

## Skills this uses

| Skill | Use |
|---|---|
| `impeccable` 4.3.1 | the whole flow: `document`, `shape`, `new-work`, `extract`, `typeset`, `layout`, `clarify`, `polish`, and `detect` once at the end |
| `web-design-guidelines` | Vercel's 100+ rules, fetched fresh per run. The audit gate per page |
| `vercel-composition-patterns` | the primitive APIs, so variants do not become boolean soup |
| `vercel-react-best-practices` | `Develop.tsx` at 469 lines, polling at 2.5s, memoizing nothing |
| `writing-guidelines` | labels and error copy |
| `make-interfaces-feel-better` | optical alignment, icon weight, hover, motion restraint |

## Not settled here

- The component layer: shadcn/ui, Base UI, or hand-written. Decided at phase D.
- Whether the light theme survives.
- What `reject`, `delete` and `archive` each mean on a draw. Raised on
  2026-09-09, recorded as open in `PRODUCT.md`. Five of the nine pending draw
  page annotations wait on this answer.
- The nine pending annotations themselves, deferred by Chris on 2026-09-15.
- Whether the four duplicated polling loops become one hook or a server-sent
  event stream. A 36-minute draw polls about 900 times.
