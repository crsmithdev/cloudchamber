# The store lives outside the repository, on the Linux filesystem

The SQLite store is at `~/.cloudchamber/cloudchamber.db` (`CLOUDCHAMBER_DB` moves it), not under the repository. When the checkout lived on the Windows mount, one pass over every draw's findings took 2,670 ms there against 245 ms on ext4. Nothing is lost by moving it, because the store is rebuildable from the corpus and `bank/` (ADR-0002). *Superseded on this point by ADR-0012: the store now holds drafts that cannot be rebuilt.*
