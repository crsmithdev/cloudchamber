---
version: 1
slug: "app-ui-src-draws-tsx"
primary_target: "app/ui/src/Draws.tsx"
related_targets: ["tmp/mockups/tide-table.css","tmp/mockups/galley-proof.css"]
---

# The draw page

Shape brief, phase A of `docs/specs/2026-09-15-ui-redesign.md`. Mode: Operate.
Derived from PRODUCT.md and the spec; no interview ran. Assumptions are marked.

## Job and audience

One operator, alone, late, back from a detached 36-minute run. He picks one of
five premises at the gate, or reads a draw that has moved on. He knows every
term.

## Outcome and proof

Primary task: choose a premise. Success is the four-question test in the spec:
choose at 1920 without scrolling; the three registers still tell him what a
thing is; a running draw reads from across the room; nothing he uses is
hidden. Real content only: `tmp/mockups/gate.json` and `draws.json`.

## Scope and boundaries

Fidelity: static HTML mockups at 1920 and 1280 from `tmp/mockups/gen.ts`, one
stylesheet per world, Tailwind v4 with a per-world `@theme`. The draw page
first; the check page is the second test. Untouched: the four-column shell
unless a world argues for it and Chris agrees; the three type families
Instrument Sans, Newsreader, IBM Plex Mono; the twelve verdict and neutral
hues as meaning, not as values; the four tabs. Anti-goals: onboarding copy,
a modal, a brand colour, a fifth stage.

## States and ranges

Five candidates, each a one-line premise and a 400-word vignette; one seed of
one to four lines; six examples; a step log of seven to twelve steps. States:
running (a step in flight), awaiting the gate, chosen (the draw has moved to
check), failed step, flagged draw, forked, superseded, archived, and the
start form when there is no draw.

## Interaction and layout

The candidate list is the page. Each candidate carries index, probability,
bar, premise, folded vignette, and choose. Selection and disclosure stay
in place. The step log stays visible while the candidates are judged.

## Constraints and open decisions

Two worlds, decided by the roll under seed `de67593c`: the assigned direction
in `tmp/mockups/tide-table.css` and the pick in `tmp/mockups/galley-proof.css`,
each with its own direction contract. Chris judges them at phase C. Open,
not to be invented: what reject, delete and archive mean; the light theme;
the component layer.

## Grounded list, for a re-roll

Seven candidates, ordered by resonance, four material families:

1. The galley proof. Typeset galleys with the proofreader's marks in the
   margin in one second colour. Judgement lives in the margin, never on the
   text. Print. Carries: the three registers (compositor's slug in mono, body
   type, the marking hand), the metadata gutter, verdict as a mark.
2. The editor's flatbed. A Steenbeck: the reel runs while the take is judged;
   bins, take numbers, edge codes, the counter. Mechanical film. Carries:
   monitor and judge on one surface, the log as edge code, running as motion.
3. The card catalogue. Typewritten slips, drawers, date stamps for keep and
   pass. Card and typewriter. Carries: the verdict log, recorded once and
   replayed, the row as a card.
4. The broadcast desk. The ON AIR lamp, cue sheets, mono clocks, faders.
   Electronic instrument. Carries: running state legible across the room,
   one lit thing at a time.
5. The nautical almanac. Tide tables for the bay: ruled columns, small caps,
   dense tabular numerals. Print, tabular. Carries: density courage, the
   distribution as a column of numbers.
6. The tote board. Odds ladders, prices moving, the tail as long odds.
   Signage. Carries: the stated distribution and the band sampled. Risk: a
   gambling register on a writing tool.
7. The scanning table. A chamber photograph on a light table, event numbers,
   curvature measured by hand. Photographic. The name read literally; spent
   here and nowhere else.

Families: print (1, 5), film (2), card (3), instrument (4), signage (6),
photographic (7).

Roll: `impeccable concept-seed --scope direction --mode operate --from de67593c --candidate-count 7` assigned index 5. Six catalog challengers were dealt and all six declined; their kept disciplines are the raises on world A.
