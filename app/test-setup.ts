/** bun test preload: keep every test away from the tracked bank/, briefs/ and data/. */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "cloudchamber-test-"));
process.env.CLOUDCHAMBER_BANK = join(dir, "bank");
process.env.CLOUDCHAMBER_BRIEFS = join(dir, "briefs");
process.env.CLOUDCHAMBER_DRAFTS = join(dir, "drafts");
process.env.CLOUDCHAMBER_DB = join(dir, "test.db");
