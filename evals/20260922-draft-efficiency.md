# Evaluation run — one brief drafted twice, before and after the drafting trims

Run 2026-09-22 (night), after `perf/draft-efficiency`: the scene ask's fixed
part (examples, outline, ledger, schedule) moves to the system prompt, where
the CLI caches it, and `sceneSignal` asks for the numbers a person would say
aloud, not the exact number. The question: does the draft cost less, and does
it lose anything with the judges?

Seed typed from a Void of Fears title, *I Survived a Plane Crash. We Didn't
Crash on Earth*; source `vs-hIS0zHK8` (6,785 words of narration).

## Method

1. One draw and one repair chain, on a copy of the store, with `main` code:
   `draw --genre "hard scifi" --shape listen --sampling standard --auto`,
   then `gate auto` to the floor. Tip `20260922014945-70ae`.
2. The store copied. The same tip drafted in each copy at the same time with
   `draft --profile listen`, no `--auto`: `main` in one, the branch in the
   other. Premise, brief, ledger and open findings are the same in both arms.
3. Each draft, scenes alone (`story?flags=0`), judged blind against the
   source by the panel of five over OpenRouter, three passes each, order
   swapped on alternate passes (`evals/judge.py`).

## Deviations

1. **Nothing kept.** Both drafts are in scratch stores, not the live one.
2. **The chain restarted.** The API returned 500 and 529 on seven calls in
   the hour (none in the live store's history). `invoke` does not retry an
   error, so `gate auto` stopped mid-chain twice and was started again from
   the tip; the chain ran more rounds than one `auto` would. Both arms share
   it.
3. **Dropped passes.** Six of thirty passes came back incomplete after three
   attempts: four on base, two on new. The totals below are of the passes
   that answered.

## Cost and time, the drafting phase (schedule to the last screen)

| arm | cost | wall | scene cache write | scene cache read | auto rewrites | beats |
|---|---|---|---|---|---|---|
| base (`main`) | $6.22 | 13.6 min | 285k | 84k | 1 | 12 |
| new (branch) | **$4.62** | 12.4 min | 159k | 194k | 0 | 12 |

The scene calls alone fell from $3.58 to $2.30. This seed drew few figures:
base made one numeral rewrite, against eleven on `c933`, so the register
change saved one scene call here and the caching saved the rest.

## Parity, on the scenes alone

| arm | passes | overall won or tied | axes won or tied |
|---|---|---|---|
| base | 11 | 11/11 | 76/88 (86%) |
| new | 13 | 12/13 | 91/104 (88%) |

| axis | base | new |
|---|---|---|
| hook | 7/11 | 10/13 |
| presence | 8/11 | 10/13 |
| people | 10/11 | 11/13 |
| feeling | 11/11 | 13/13 |
| cost | 11/11 | 13/13 |
| ending | 9/11 | 10/13 |
| clarity | 11/11 | 12/13 |
| momentum | 9/11 | 12/13 |

The one source win is GLM-4.7's second pass on new. Every judge gives both
arms parity.

## Reading

The trims cost no detectable quality: the same brief, drafted both ways,
scores within a pass of itself, and the draft costs a quarter less. One run
per arm, so this is "no loss at this resolution", as run 11 was.

The effort probe (the checks at `effort = "medium"`) is not adopted: on
`769a` today the default already thinks 2k to 4k tokens a call, against 6k
to 10k on 20 Sep, and medium thought the same.

Follow-up: retry an `error` step that carries a 5xx or 529, with backoff,
before `invoke` throws.
