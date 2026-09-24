# The store holds drafts that cannot be rebuilt, so it needs a backup

ADR-0003 says nothing is lost when the store moves, because the corpus and `bank/` rebuild it. That premise is false since the drafting pipeline and `cloudchamber lab`. A draft is a set of model replies. The same code and brief give a different draft every time, and an experiment's arms are draws in the store (`bank/judgements.jsonl` names them by draw id). Lose the store and every logged judgement points at text that no longer exists.

The store stays outside the repository, on ext4, for the reasons in ADR-0003. The prose cannot move into this repository either: a draft under a setting names that setting's bodies, places and terms, and the public repository names no setting.

So the store needs a backup. On 24 September it had none: `~/.cloudchamber` was 4.4 GB with no `backups/`. ADR-0003 stands for where the store lives and is superseded on why its loss is harmless.
