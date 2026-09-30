# To do

Things to build or look at in cloudchamber. `aleph todo` owns this file.
Item numbers never change: commits, the spec and the vault quote them.

## 1. Gate 2: the first click within about 3 s of a page load is lost (seen twice on the How control)
---
id: 1
status: open
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ui]
---

### Notes

- 2026-09-29 18:22: 29 Sep, live on 3007, b82d: the How control mounts once about 0.94 s after load and never moves or remounts (MutationObserver in an iframe over 8 s); a synthetic click at mount sticks. Not layout shift and not a remount. Not reproduced with real input: the MCP tab reports visibilityState hidden, so timing is throttled. Next: reproduce by hand with DevTools Performance recording the first click.

## 2. Plan step 5: read the plan findings on the next five drafts; S4 runs only if at least half read real
---
id: 2
status: open
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 16:54: 7fdc63f: mark each finding real / not real at the plan gate (chips, or gate <draw> mark --finding ID --real|--not-real); stored as reading artifacts

## 3. Decide IR spec §15.9 (gate 1 into the IR): shape A or B, auto amend, T3′, reader check, T4 timing; then T1 (L2 at the plan gate)
---
id: 3
status: done
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 10:07: Shape A accepted; red-teamed; L2 killed at 0 of 4; T1′ (claims on the plan) landed in 8089752

## 4. T2 prerequisite: decide what --auto does when the plan-gate rule fails (S1′ alone stops about 29% of unattended drafts); and whether T3′ ($6) is a check replay under rule 3
---
id: 4
status: done
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 16:54: 7fdc63f: --auto passes the plan gate and its findings show at gate 2 (option b); Chris skipped T3′

## 5. T3: retire gate 1's code; first decide where the brief's structure, resemblance and reader checks go, since a manual draw no longer runs them (IR spec §15.12)
---
id: 5
status: done
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 18:39: 6f96094: the brief's structure, resemblance and reader checks run in draft beside the schedule and show at the plan gate

## 6. repair.ts: strip span and patch placement (place, applyPatches, localPatch, settled spans); since T3 only span-less operator instructions reach repair
---
id: 6
status: done
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 19:49: b3a870c: placement, repair prompts and constraint lines removed; 358 tests pass

## 7. T4 kill rule: two drafts of one declared brief, judged by ear (about $12); kill if the ending is flatter or outline shape failures pass one in five (0 of 2 so far)
---
id: 7
status: done
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 20:02: 30 Sep: both drafts are written, on DB copies, from one candidate (2dae, execute-a79422be). Before T4 (a410812, prose outline): .worktrees/ear-pre/output/20260929135622-2dae/report.html. T4 (declared outline, 49 symbols): .worktrees/ear-t4/output/20260929135622-2dae/report.html. Both at gate 2. About $9 spent. Waits on Chris's ear; then remove both worktrees and scratchpad pre.db and t4.db.
- 2026-09-29 20:24: Kept T4. Ear test on draw 2dae: 0 of 2 outline shape failures; the T4 ending is more restrained (it stops on the climb, before the fall) and loses the Colin aftermath, but Chris judged it not flatter. One sample each, so sampling noise is not ruled out.
