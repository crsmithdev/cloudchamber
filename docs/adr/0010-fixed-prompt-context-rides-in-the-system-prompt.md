# Fixed prompt context rides in the system prompt, word for word the same

The CLI caches a call's system prompt and never its user prompt. A later call reads the cache only when its whole system prompt matches, and only when it starts some seconds after the call that wrote it. So text that stays fixed across a run of calls goes in the system prompt. The scene ask carries the examples, outline, ledger and schedule there. Every stage that reads the whole brief gets the brief as its system prompt, with one shared stage line, and one call leads a check pass by 15 s. Measured on 22 Sep, drafting fell from $6.22 to $4.62 and a check pass from $1.38 to $0.99.

## Consequences

A stage line cannot differ between the check stages without losing the hits. The first attempt put a different stage line after the shared brief and saved nothing. Moving text between the system and user prompts changes what the model sees, so it is judged, not assumed neutral.
