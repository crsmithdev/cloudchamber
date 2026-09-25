# Cloud Chamber, for Gemini

Read `CLAUDE.md` first. Its rules hold for you too: the corpus, `docs/knobs.md`,
the specs and prompt accretion.

@[CLAUDE.md](CLAUDE.md)

## Where you work

- Make a worktree from the main checkout, then work only inside it:

  ```
  git worktree add .worktrees/<name> -b <prefix>/<name>
  ```

- A worktree has no `corpus/` link. Make one when a step reads the corpus:

  ```
  ln -s ~/cloudchamber-corpus .worktrees/<name>/corpus
  ```

- `bun install` once in a new worktree.
- The store at `~/.cloudchamber/cloudchamber.db` is shared by every checkout.
  Read it freely. Do not change its schema.
- A commit on `main` rebuilds the UI and restarts the service. That is why you
  never commit there.

## Checks before you report

```
bun test app
bun run typecheck
```

Both must pass in your worktree after your last edit. Report the counts.

## Model calls

`bun run cloudchamber <command>` calls Claude for most commands, and `lab`
calls the OpenRouter judges. `help`, `status`, `findings`, `report`, `draws`,
`draw-show`, `candidates` and `brief` only read. Ask before any other command,
and say what it costs.

## The plan

`docs/reviews/2026-09-24-the-plan-by-goal.md` is the plan of record. Each step
names its guard. A step lands only through its guard. Your task for now is in
`docs/reviews/2026-09-25-brief-for-gemini.md`.
