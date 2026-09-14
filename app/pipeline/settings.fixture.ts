/** A four-list setting in the canonical shape, written to <dir>/settings for draw, distill and lint tests. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURE_SETTING = `---
id: basin
name: The Basin
claims: setting
seed_segments: []
---

## Matrix

Take the regional element out and a mechanism goes with it.

## Hard rules

- One impossibility, bought openly.
- Nothing resolves.

## Do not build

- A second impossibility.

## Jobs

- matrix: Close the regional element. Name the body, instrument or place the story is built out of, and show that removing it removes a mechanism.

## Bodies

- The Basin Recorder — indexes a deed by grantor and grantee within 5 days; amends the book only by appending; cannot correct an entry already indexed
- The Office of the Public Administrator — takes possession of an estate nobody claims; sells at auction; cannot distribute before 4 months have run
- The Hiring Hall — dispatches in order of registration under the 1934 award; stops all work on 5 July; cannot dispatch a worker who missed the morning call

## Instruments

- The diseño — a hand-drawn boundary sketch a court will still accept as title, called to a willow that no longer stands
- The Notice of Withdrawal — filed under penalty of perjury naming every unit on a parcel; takes effect in 120 days
- Certificate of Death — without it no permit issues, and no body may be held past 8 days

## Places

- The Recorder's counter — the one window where the book is amended, and only by appending
- Cypress Lawn, Colma — holds the county's dead, who outnumber its living 900 to 1
- Pier 34 dispatch floor — the 5.30 call that decides who works that day

## Terms

- Diseño — the sketch that is still title
- Ellis — to withdraw every unit on a parcel from rent; used as a verb
- 5 July — the date the contract stops the waterfront, named without a year
`;

export const FIXTURE_REFERENCE: Record<string, string> = {
  "land.md": `---
topic: Land and title
sources:
  - fixture
fetched: 2026-09-05
---
# Land and title

- A diseño is a hand-drawn boundary sketch that a court will still accept as title; one calls its line to a willow that no longer stands.
- The Basin Recorder indexes a deed by grantor and grantee within 5 days and amends the book only by appending.
`,
  "labour.md": `---
topic: Labour
sources:
  - fixture
fetched: 2026-09-05
---
# Labour

- The 1934 award established jointly operated hiring halls and the contract still stops all work on 5 July.
- Dispatch is from the Pier 34 floor at the 5.30 call, in order of registration.
`,
  "death.md": `---
topic: Death
sources:
  - fixture
fetched: 2026-09-05
---
# Death

- The Public Administrator (Probate Code §7600) takes possession of an estate nobody claims, inventories it and sells at auction.
- Unclaimed cremated remains are held for a statutory interval and then interred in common at Cypress Lawn, Colma.
`,
};

export function settingsFixture(dir: string, text: string = FIXTURE_SETTING): string {
  const sdir = join(dir, "settings");
  mkdirSync(join(sdir, "basin", "reference"), { recursive: true });
  writeFileSync(join(sdir, "basin.md"), text);
  for (const [f, body] of Object.entries(FIXTURE_REFERENCE)) writeFileSync(join(sdir, "basin", "reference", f), body);
  return sdir;
}
