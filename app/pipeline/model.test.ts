import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeCli } from "./model.ts";

// a stand-in `claude` on PATH: it records its arguments and answers as the CLI does, with the session's running cost
function fakeClaude(replies: object[]): { log: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
  const log = join(dir, "args.log"), queue = join(dir, "queue.json");
  writeFileSync(queue, JSON.stringify(replies));
  writeFileSync(join(dir, "claude"), `#!/usr/bin/env bun
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const q = JSON.parse(fs.readFileSync(${JSON.stringify(queue)}, "utf8"));
const r = q.shift();
fs.writeFileSync(${JSON.stringify(queue)}, JSON.stringify(q));
await Bun.stdin.text();
console.log(JSON.stringify(r));
`);
  chmodSync(join(dir, "claude"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${dir}:${path}`;
  return { log, restore: () => { process.env.PATH = path; } };
}

test("a session call keeps its transcript, a resumed call forks, and each reports its own cost", async () => {
  const reply = (id: string, total: number) => ({ result: "<ok/>", stop_reason: "end_turn", session_id: id, total_cost_usd: total, usage: { input_tokens: 2, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 3 } });
  const f = fakeClaude([reply("s1", 0.17), reply("s2", 0.185), reply("s3", 0.2)]);
  try {
    const cli = new ClaudeCli();
    const a = await cli.call("scene", "sys", "p", "m", "", undefined, {});
    const b = await cli.call("scene", "sys", "p", "m", "", undefined, { resume: a.session });
    const c = await cli.call("scene", "sys", "p", "m");
    const args = readFileSync(f.log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);

    expect(a.session).toBe("s1");
    expect(args[0]).not.toContain("--no-session-persistence");
    expect(args[0]).not.toContain("--resume");
    expect(a.usage!.cost_usd).toBeCloseTo(0.17);

    expect(b.session).toBe("s2");
    expect(args[1].slice(args[1].indexOf("--resume"), args[1].indexOf("--resume") + 3)).toEqual(["--resume", "s1", "--fork-session"]);
    // the CLI's total carries the parent's 0.17; the call's own cost is the rest
    expect(b.usage!.cost_usd).toBeCloseTo(0.015);

    // a call that asks for no session keeps nothing and reports none
    expect(c.session).toBeUndefined();
    expect(args[2]).toContain("--no-session-persistence");
    expect(c.usage!.cost_usd).toBeCloseTo(0.2);
  } finally {
    f.restore();
  }
});
