# Evaluation run — the listen profile under a linear chronology

Run 2026-09-22, after `191a9bb` fixed `form.chronology = "linear"` in
`profiles.listen`. The same brief as `evals/20260922-head-to-head.md`
(`20260922134631-ad7c`, the Ark seed) was drafted a third time, by `191a9bb`,
from a copy of the store with the brief's draft phase removed. The new draft
was then judged head to head against both earlier drafts by the panel of five,
four passes each, two in each order.

## The draft

```
schedule         linear on the first attempt, no shape retry
form             past · third, close on Sade Mbeki · linear, one timeline · single continuous narrative
draft            12 beats · 10,029 words · 1 auto rewrite
drafting         $4.64 · 10.6 minutes
```

## Linear against the nonlinear draft (same drafting code; only the chronology differs)

| judge | linear first | nonlinear first |
|---|---|---|
| gemini-3.1-pro | linear, linear | linear, linear |
| kimi-k2.5 | linear, linear | linear, nonlinear |
| gpt-5.1 | linear, linear | nonlinear, nonlinear |
| grok-4.3 | linear, linear | nonlinear, nonlinear |
| glm-4.7 | linear, linear | nonlinear, nonlinear |

Linear 13, nonlinear 7. Gemini chose linear in both orders on every pass,
and Kimi on three of four. Clarity goes to linear in both orders, 6–4 and
9–1, which mirrors the earlier run, where clarity went to the linear draft
9–1 and 6–4. The other axes follow the order.

## Linear against the old linear draft (`b2b5206`; both linear)

| judge | new first | old first |
|---|---|---|
| gemini-3.1-pro | new, new | old, old |
| kimi-k2.5 | new, new | old, old |
| gpt-5.1 | new, new | new, old |
| grok-4.3 | new, new | old, old |
| glm-4.7 | new, old | old, old |

New 10, old 10. No axis holds in both orders: clarity is 2–6 with new first
and 6–4 with old first.

## Reading

- The fix does what it was for: the schedule came out linear at the first
  attempt, and the linear draft beats the nonlinear one on clarity in both
  orders, as the earlier run predicted.
- With the chronology held equal, the 22 Sep changes are dead even with the
  code before them, 10 to 10, and cost 25% less ($4.64 against $6.14).
- One draft per condition. The claim is "no loss this panel can see", and a
  clarity gain from linear that has now appeared in two independent pairs.

Judging cost $1.17 (40 passes).
