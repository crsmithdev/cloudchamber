# Evaluation run — retries, a cached brief for the checks, and resume

Run 2026-09-22 (night), after `perf/resilience`: `invoke` retries a 5xx or
529, the check stages share the brief as one cached system prompt with one
call leading the pass, and `draw --resume` carries a failed draw on. The
question: does each change do what it claims, and does the whole pipeline
still reach parity?

Same seed and source as `evals/20260922-draft-efficiency.md`: *I Survived a
Plane Crash. We Didn't Crash on Earth*, against `vs-hIS0zHK8` (Void of
Fears). Everything ran on copies of the store in scratch.

## Resume, on the real failures of the night

The three draws the outage left behind, resumed with the new code:

| draw | how it had failed | calls on resume | end |
|---|---|---|---|
| `1146` | 1 of 5 executes (529) | 1 execute, outline, 2 context, ending | done |
| `bed0` | 5 of 5 executes (500) | 5 executes, outline, 2 context, ending | done |
| `7754` | outline (529), left at the gate | outline, 2 context, ending | done |

No resume ran the premises again. Before this, each retry was a new draw.

## The check pass, `main` and new on the same brief

One pass each over the resumed briefs, the two arms at the same time:

| brief | arm | cost | cache write | cache read | wall | reported |
|---|---|---|---|---|---|---|
| `1146` | main | $1.38 | 78k | 67k | 80 s | 1 |
| `1146` | new | **$0.99** | 44k | 92k | 78 s | 1 |
| `bed0` | main | $1.53 | 86k | 75k | 88 s | 0 |
| `bed0` | new | **$1.01** | 36k | 125k | 85 s | 0 |

A pass costs about 30% less, at the same wall time.

The first version of this change (commit `4b8a02e`) put the brief ahead of
each stage's own line and saved nothing: on the E brief it wrote 76k and
read 64k, where `main` read 72k. A cache hit needs the whole system prompt to
match. A probe showed the other half: of five calls started together all
five wrote, and calls started 16 s and 60 s later read 18.5k and wrote 1.5k.
So the stages share one line, and one call leads the pass by 15 s.

## Retries

No 5xx came back during these runs, so the retry did not fire outside the
tests. The tests script a 529 then a 500 then a success, four 529s that run
out, and a non-API error that is not retried.

## The whole pipeline, end to end (E)

Draw, `gate auto` and `draft --profile listen` on the new code, as of
`4b8a02e` (the checks then carried the first version of the change; the
drafting code is the same as now). Draw `1654`, tip `ce14`.

```
chain            1654 → ce14 · auto stopped on floor · 2 rounds
draft            9,792 words · 2 auto rewrites
run              107 calls · none failed · $9.53 · 21.1 minutes, draw to gate 2
```

| axis | E |
|---|---|
| hook | 10/13 |
| presence | 9/13 |
| people | 12/13 |
| feeling | 13/13 |
| cost | 13/13 |
| ending | 12/13 |
| clarity | 13/13 |
| momentum | 13/13 |
| **total** | **95/104 (91%)** |

13 of 13 passes won overall; 2 of 15 dropped as incomplete. The two drafts of
the efficiency run scored 86% and 88% on other briefs of the same seed, so
this is parity again, not a gain: one run, a different brief.

For scale, the Ark draws `c933` and `7797` cost $15.45 and $17.94 and took
37 and 47 minutes. They are other seeds, so this is not an A/B.
