# Evaluation run — one brief drafted by the code before and after the 22 Sep changes, judged head to head

Run 2026-09-22 (morning). The earlier runs judged each draft against a
narrated source, and every draft won almost every pass: at that ceiling a
small loss does not show. This run judges the two drafts against each other.

## Method

1. One brief from `main` (`e01d61c`): the Ark seed (*Humanity's Last Ark Left
   Earth 400 Years Ago. Something Was Hiding Among Us*), hard scifi, `--shape
   listen`, standard sampling, auto; `gate auto` to the floor in 3 rounds.
   Tip `20260922134631-ad7c`.
2. The store copied; the tip drafted at the same time with `--profile listen`
   by `b2b5206` (before the changes) and by `e01d61c`.
3. `evals/judge.py --ours new --source old`, the panel of five over
   OpenRouter, **four passes each**, two in each order.

## Cost and time, the drafting phase

| arm | cost | wall | scenes | cache write / read | auto rewrites |
|---|---|---|---|---|---|
| old `b2b5206` | $6.14 | 11.0 min | $3.46 | 431k / 320k | 1 |
| new `e01d61c` | **$4.56** | 9.6 min | **$2.23** | 290k / 384k | 0 |

−26%, the same as the plane-crash A/B. This brief drew few figures, so the
register change saved one rewrite; its larger saving is still unshown.

## Verdicts

20 complete passes, none dropped (a first attempt at three passes lost 7 of
15 to an empty OpenRouter balance and is not counted).

| judge | new first | old first |
|---|---|---|
| gemini-3.1-pro | old, new | old, old |
| gpt-5.1 | new, new | old, old |
| grok-4.3 | new, new | old, old |
| kimi-k2.5 | new, new | old, old |
| glm-4.7 | new, new | old, old |

**The judges pick the story they read first.** Four of five followed the
order on every pass; Gemini departed once, for old. Overall: old 11, new 9.
Two near-copies of one brief are below what this panel can separate, and a
three-pass run (two passes one way) would have read the order as a win.

By axis, with the order balanced, one lean survives the order:

| axis | new first: new–old–tie | old first: new–old–tie |
|---|---|---|
| clarity | 1–9–0 | 4–6–0 |
| people | 4–5–1 | 0–8–2 |
| presence | 5–1–4 | 0–6–4 |
| cost | 5–0–5 | 0–8–2 |

Clarity goes to old either way. The judges' notes say why: new opens on Deck
Zero at the second bell and goes back three days, where old runs in order.

## The cause is the schedule, not the changes

Both arms sent the schedule stage the same prompt (24,117 characters) and
the same system line; neither change touches it. The model chose:

- old: `linear, one strand, from the draw in spring 2606 to 14 March 2607`
- new: `opens on Deck Zero at the second bell on 14 March 2606, goes back three days to the draw, then runs forward`

So the one quality difference is one sample of an unchanged stage.

## Reading

- The cost saving holds on a second brief: −26%.
- No quality loss is attributable to the changes; this run cannot show a
  gain or a loss finer than the schedule's own variance.
- `--profile listen` leaves `form.chronology = "auto"`, and the one
  nonlinear draft lost clarity in both orders. `profiles.signal` fixes it to
  `linear`. Fixing it in `listen` too is the finding to act on.
- A head-to-head of two drafts needs an even number of passes, half in each
  order, and reads overall verdicts only across both orders.
