# The verdict log is the source of truth; the verdicts table is a replay

Every keep and pass is appended to the tracked `bank/verdicts.jsonl`, and the `verdicts` table is rebuilt from it (`cloudchamber replay`). Judgement is the one thing that cannot be regenerated, so it lives in git, beside the code, and the SQLite store can be thrown away and rebuilt from the corpus plus `bank/`. The latest line for a target wins, and a verdict on a passage that re-extraction replaced is inherited at 80% token overlap.
