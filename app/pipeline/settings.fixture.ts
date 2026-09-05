/** A three-domain setting in the typed shape, written to <dir>/settings for draw, distill and lint tests. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURE_SETTING = `---
id: fog
name: The Fog
draw: 2
seed_segments: []
names: true
---

## Matrix

Take the regional element out and a mechanism goes with it.

## Hard rules

- One impossibility, bought openly.
- Nothing resolves.

## Do not build

- A second impossibility.

## Open ground

- An interval getting shorter as the spine.

## Jobs

- matrix: Close the regional element. Name the instrument and show that removing it removes a mechanism.

## Domains

### 1. Land and title

#### Frame

What proof a court will accept, and ground that was manufactured.

#### Mechanisms

- A boundary called to a willow and a heap of stones, read by a court that accepts only survey lines, so the title fails on cartography.
- Confirming ownership consumes what it confirms, with a filing bar and a wait of decades paid out in undivided shares.

#### Roles

- the deputy who inventories the flat
- the heir with twelve months to move in

#### Institutions

- The county recorder, which indexes but never corrects, and answers to nobody who reads the index.

#### Instruments

- the diseño, a sketch map submitted as proof to a tribunal that accepts only survey lines

#### Clocks

none

#### Places

- the recorder's counter, where the book is amended by appending

#### Vocabulary

- quiet title: a suit that ends every other claim to a parcel

#### Sources

- reference/land-and-title.md

### 6. Labour

#### Frame

A queue that is the income, and an employer nobody can name.

#### Mechanisms

- Work is a queue position drawn by lottery, with a rate posted where nobody may enforce it, and a week that closes at a negative number.

#### Roles

- the casual at the dispatch window

#### Institutions

- The joint labor relations committee, which sets the registration lists and answers to the contract.

#### Instruments

- the weekly settlement sheet, where the truck payment is deducted before the wage

#### Clocks

- the one day a year the whole waterfront stops for men shot outside a hall

#### Places

- the dispatch hall

#### Vocabulary

- low-hours-first: dispatch order that hands the next job to whoever has worked least

#### Sources

- reference/labour.md

### 12. Death and its administration

#### Frame

A city that evicted its dead, and the officer who prices your furniture.

#### Mechanisms

- Nobody to claim you, so a county acts: the flat inventoried and auctioned, the ashes held their interval, then a name read aloud once.

#### Roles

- the public administrator's deputy

#### Institutions

- The Public Administrator under the Probate Code, which takes an estate nobody claims and answers to the probate court.

#### Instruments

- the final account, the last document in a file that never closes

#### Clocks

- the interval the ashes are held before the common interment

#### Places

- the annual reading of names

#### Vocabulary

- escheat: the estate passing to the state when no heir is found

#### Sources

- reference/death.md
`;

export const FIXTURE_REFERENCE: Record<string, string> = {
  "land-and-title.md": `---
topic: Land and title
sources:
  - fixture
fetched: 2026-09-05
---
# Land and title

- The Land Act of 1851 required every holder of a Mexican grant to prove title before a commission, and the proving took decades.
- Recorded modifications append a page behind the deed; the original stays in the book.
`,
  "labour.md": `---
topic: Labour
sources:
  - fixture
fetched: 2026-09-05
---
# Labour

- The 1934 award established jointly operated hiring halls and the contract still stops all work on 5 July.
`,
  "death.md": `---
topic: Death
sources:
  - fixture
fetched: 2026-09-05
---
# Death

- The Public Administrator (Probate Code §7600) takes possession of an estate nobody claims, inventories it and sells at auction.
- Unclaimed cremated remains are held for a statutory interval and then interred in common, with a list of names read aloud.
`,
};

export function settingsFixture(dir: string, text: string = FIXTURE_SETTING): string {
  const sdir = join(dir, "settings");
  mkdirSync(join(sdir, "fog", "reference"), { recursive: true });
  writeFileSync(join(sdir, "fog.md"), text);
  for (const [f, body] of Object.entries(FIXTURE_REFERENCE)) writeFileSync(join(sdir, "fog", "reference", f), body);
  return sdir;
}
