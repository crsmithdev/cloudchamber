# Redesign directions

Four directions for the Cloud Chamber UI, each drawn over the four tabs
(ideate, check, write, sources) with real store content. Open `index.html`
for the side-by-side view. The app code in `app/ui/` is unchanged.

| Direction | Screens | Trade-off |
|---|---|---|
| [Computation pad](pad/ideate.html) | light, green engineering paper, three columns | The boxed result at the foot of each entry puts the gate's one decision in view at all times, and the prose reads best in daylight. The cost is a third column, so the premises get the narrowest measure of the four; the pad's grid is a texture the operator sees all day; and a light theme breaks from the night scene in PRODUCT.md. |
| [Timetable](timetable/ideate.html) | light, black bars, condensed grotesk, route strip | The route strip answers "where is this draw, and what does it wait for" on every tab, and folding the step log into the premise rows removes a column without hiding a fact. The cost: black bars and red give it the loudest chrome of the four, and the numbers leave the mono, so ids and figures no longer look different from each other. |
| [Signal bench](bench/ideate.html) | dark, a scope screen over the work, keycap actions | Each screen gets one real data graphic (calls over time, scores against the filter level, words against the cap, passages per cell), and the one orange key makes the action obvious. The cost: the screen takes about 200 px of height from the work, the instrument register is the furthest from a writing tool, and a scope that shows little on a quiet draw is still there. |
| [Standard](standard/ideate.html) | dark, sidebar, list, cards, badges, one sans | Anyone knows how to use it at once, and it takes the least effort to build and keep. The cost: cards and badges take the most room, so the fewest rows fit in the viewport, and the one sans for generated prose drops the register that tells the pipeline's text from the interface. |

## What each mockup shows

| Tab | Draw | Content |
|---|---|---|
| ideate | `affair-arranges-childs` | seed, five premises with p, premise 2 opened on its vignette, 12 steps (6 done, the gate, 5 to come), examples, facts |
| check | `something-building-dyson-19` | five open findings, the first opened on result, evidence and replacement; dismiss reasons; instruction; open findings by outline section |
| write | `county-agricultural-extension-2` | form facts, three beats against their caps, five screen flags marked in the scenes, repeated trigrams |
| sources | the scp source | 14 unreviewed passages, source and voice/mode counts, keep/pass/artifact |

Two states in the mockups are not in the store:

- `disturbing-story-large-49` shows as running ("write vignette 4 of 5") in
  the ideate list, so that each direction must draw the running state.
- Passage 1 shows as kept and passage 4 as passed on the sources tab.

Draws under a setting were removed from the store copy before the capture, so
no setting name is in these files.

## How the directions were chosen

The impeccable skill's direction roll (seed `ec901cab`, operate mode) chose
from seven grounded worlds for a solitary operator who reads long runs late,
in this order: a galley proof, a railway timetable, a film editor's take log,
a broadcast cue sheet, a terminal multiplexer, a card catalogue and a lab
notebook. The tide table was left off the list because it is the current UI.
The galley proof was not built, because the September round already showed it.

| Card | Source | Verdict |
|---|---|---|
| Computation pad | the roll's assignment, candidate 7 (the lab notebook) | built |
| Timetable | the skill's own top pick | built |
| Signal bench | challenger: an oscilloscope on a signal bench | competitive (holds audience fit; loses on clarity), built as an alternate |
| Standard | the category standard played straight | built as the baseline |
| — | challengers: arcade CRT, cloud quarry, deep dive, vertical feed, hardware desk | declined on both axes; the hardware desk gave the bench its one orange key |

No decision page, comps or finish review ran: this is the direction round, and
no direction is chosen yet. DESIGN.md is unchanged.

## Rebuild

```
bun docs/redesign/src/build.ts
```

The build reads `src/data.json`, a fixture taken from the local API
(`/api/draws`, `/api/draws/:id`, `/api/draws/:id/findings`,
`/api/draws/:id/story`, `/api/items`, `/api/status`, `/api/facets`) on a copy
of the store. It writes `<direction>/<tab>.html` and `index.html`. The
screenshots in `shots/` are 1600 × 1000 captures of each page and of the
running app.

The fonts in `fonts/` are latin subsets from Google Fonts under the SIL Open
Font License 1.1: Public Sans, Source Serif 4, JetBrains Mono, Archivo,
Literata, Barlow Semi Condensed, Chivo Mono and Inter.
