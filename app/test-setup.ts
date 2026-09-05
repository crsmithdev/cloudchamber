/** bun test preload: keep every test away from the tracked bank/, packets/ and data/. */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "fogbelt-test-"));
process.env.FOGBELT_BANK = join(dir, "bank");
process.env.FOGBELT_PACKETS = join(dir, "packets");
process.env.FOGBELT_DB = join(dir, "test.db");
