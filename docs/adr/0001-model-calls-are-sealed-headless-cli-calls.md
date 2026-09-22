# Every model call is a sealed, headless `claude -p` subprocess

Every stage calls the model by spawning `claude -p` with `CLAUDECODE` unset, `--tools ""`, `--setting-sources ""`, `--no-session-persistence`, a one-line `--system-prompt` and an explicit `--model`, not through an API client. The calls run on the operator's subscription login, and the flags drop hooks, plugins, skills, MCP and both CLAUDE.md files, which took the overhead from about 20,000 tokens a call to 5,757. The adapter in `app/pipeline/model.ts` is the one seam the tests replace.

## Considered Options

- **`--bare`**: skips the stored subscription login and returns "Not logged in"; it needs an API key.
- **An API client**: per-token billing instead of the subscription, and a second auth path.

## Consequences

`--setting-sources ""` also drops the configured default model, so every stage must name its model in `stages.toml`. The CLI decides where cache breakpoints go; see ADR-0010.
