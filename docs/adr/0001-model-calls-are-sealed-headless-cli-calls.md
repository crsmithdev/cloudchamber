# Every model call is a sealed, headless `claude -p` subprocess

Every stage calls the model by spawning `claude -p` with `CLAUDECODE` unset, `--tools ""`, `--setting-sources ""`, `--no-session-persistence`, a one-line `--system-prompt` and an explicit `--model`, not through an API client. The calls run on the operator's subscription login, and the flags drop hooks, plugins, skills, MCP and both CLAUDE.md files, which took the overhead from about 20,000 tokens a call to 5,757. The adapter in `app/pipeline/model.ts` is the one seam the tests replace.

## Considered Options

- **`--bare`**: skips the stored subscription login and returns "Not logged in"; it needs an API key.
- **An API client**: per-token billing instead of the subscription, and a second auth path.

## Consequences

`--setting-sources ""` also drops the configured default model, so every stage must name its model in `stages.toml`. The CLI decides where cache breakpoints go; see ADR-0010.

## Amendment (2026-09-27): session calls

Since 46c3057 a call can belong to a session. It then drops `--no-session-persistence`, and a later call adds `--resume <id> --fork-session`. The sequential scenes of a draft and the ledger binds that fork from one base session use this, so each call reads the story so far from the cache and does not send it again. The call is still a sealed `claude -p` subprocess with the same flags otherwise, and `FakeModel` still stands in for it at the same seam.
