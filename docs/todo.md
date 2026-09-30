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
- 2026-09-29 20:41: 29 Sep, headless Chromium (Playwright, visible page, real mouse events) on a DB copy served from HEAD b647ea8 on 3014: a click on How at 0.2, 0.5, 1, 1.5, 2, 3 and 4 s after load registers every time (b82d). The How group mounts once at 0.4-0.9 s at the same place, and no remount or scroll follows over 7 s, whether the page opens at #go/<id>, #write/<id> or #write. Still not reproduced; the headless page rules out timer throttling. Left: your hand, with DevTools Performance recording. Code read: Develop's effect on 'current' calls setD(null), which unmounts gate 2, but 'current' is stable once the hash names the draw.

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

## 8. Outlines carry setting: provenance tags on a draw with no setting (seen on 2dae, unrestricted)
---
id: 8
status: dropped
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [ir]
---

### Notes

- 2026-09-29 20:25: Harmless, by design. SYM_RULES (prompts.ts:23) asks for '; setting:<area>' by the kind of fact (body, place, rite...), not by whether the draw has a setting. The only reader is settingEligible/l2Resolve in ir/s2.ts:78-100. Only evals/20260928-ir-harness.ts calls it (L2 is killed), and it returns at once when the setting has no claims authority. If L2 stays dead, the grammar clause and l2Resolve can go together.
- 2026-09-29 20:47: 29 Sep: done anyway in 8ee09a4. l2Resolve and the setting: clause in both grammars are deleted. Live outline on a copy of 2dae: 50 <sym> tags, 0 with setting:, the shape check passed, $0.19.

## 9. Plan step 3: one change for the hook; the diagnosis is done, the change and two drafts (~$30) wait on step 1's listen
---
id: 9
status: open
created: 2026-09-29
updated: 2026-09-29
priority: medium
labels: [plan]
---

### Notes

- 2026-09-29 20:41: Diagnosis from the stored steps of 3cee and 1b09 (29 Sep, $0): the hook-late screen question (prompts.ts:516-517, added for beat 1 at write.ts:240) ran and answered 'absent' on both drafts (screen-structure-00c0334d, screen-structure-3b4e47df). The first thing wrong comes at word 101 (3cee) and 83 (1b09), inside the 150-word window, after 80-100 words of time, place, routine and history. So the register flag (write.ts:63) queued no rewrite, and HOOK_LINE (write.ts:41) never reached a model. The layer to change is the screen question: it has two conditions ('in the first 150 words' and 'before routine, setting or history'), and the model resolves them in favour of the window. Suggested: flag when the first one or two sentences (about 40 words) give time, place, routine or history before anything is wrong; both stored openings would fire. Risks: HOOK_LINE also says 150 words (a rewrite under it may change little: the next layer); sceneSignal (prompts.ts:441) tells the first sentence to give time and place; the schedule put the worst moment at beat 3 under linear chronology. Judgements: 3cee lost hook to channel F 11 of 12 (vs-hIS0zHK8).

## 10. evals/20260928-ir-harness.ts does not build: it imports l5Link, which ir/s2.ts no longer exports (already broken before 8ee09a4)
---
id: 10
status: done
created: 2026-09-29
updated: 2026-09-30
priority: medium
labels: [ir, evals]
---

### Notes

- 2026-09-30 08:55: The harness is a record of a run on ir-s1 at cea5888. It builds there (checked); on main its old arm needs gate 1, which 6f96094 removed. evals/20260928-ir-harness.md says how to run it again.

## 11. The premises stop labels the chosen premise and a fork 'in check' (Draws.tsx:437, :442); the check step is gone since 947dcf4
---
id: 11
status: open
created: 2026-09-30
updated: 2026-09-30
priority: medium
labels: [ui]
---
