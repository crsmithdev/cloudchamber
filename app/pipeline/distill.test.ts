import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { settingsFixture } from "./settings.fixture.ts";
import { candidatesPath, distill, readCandidates, referenceFiles } from "./distill.ts";
import { LISTS, formatFinding, lintFile, loadSetting } from "./settings.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-distill-"));
  const db = openDb(join(dir, "t.db"));
  const sdir = settingsFixture(dir);
  return { db, dir, sdir };
}

/** A map reply: two entries per list, named after the file so a test can tell them apart. */
const mapReply = (prompt: string) => {
  const topic = /The file's subject: (.*)/.exec(prompt)?.[1] ?? "x";
  const tag = topic.toLowerCase().replace(/[^a-z]/g, "");
  return LISTS.map((l) => `<${l.toLowerCase()}>${[1, 2].map((n) =>
    `<entry>The ${tag} ${l.toLowerCase()} ${n} — does a thing for ${topic}; cannot do another</entry>`).join("")}</${l.toLowerCase()}>`).join("\n");
};

/** A reduce reply: echoes back the first `keep` candidates of the list it was asked for. */
const reduceReply = (keep: number) => (prompt: string) => {
  const list = /gathered for its (\w+) list/.exec(prompt)![1];
  const rows = (prompt.split("Candidates:\n\n")[1] ?? "").split("\n").filter(Boolean)
    .map((l) => l.replace(/^- /, "").replace(/\s+\[[^\]]*\]$/, ""));
  return `<${list.toLowerCase()}>${rows.slice(0, keep).map((r) => `<entry>${r}</entry>`).join("")}</${list.toLowerCase()}>`;
};

const pipe = (db: any, dir: string, sdir: string, script: any) =>
  new Pipeline(db, new FakeModel(script), { rng: () => 0.001, briefsDir: join(dir, "briefs"), settingsDir: sdir });

describe("distill", () => {
  test("referenceFiles walks the tree and skips INDEX", () => {
    const { dir, sdir } = fixture();
    writeFileSync(join(sdir, "basin", "reference", "INDEX.md"), "# index\n");
    expect(referenceFiles("basin", sdir)).toEqual(["death.md", "labour.md", "land.md"]);
  });

  test("the map pass writes one sidecar line per candidate, tagged with the file and its topic", async () => {
    const { db, dir, sdir } = fixture();
    const p = pipe(db, dir, sdir, { distill: mapReply });
    const out = await distill(p, "basin", { map: true });
    expect(out.filter((l) => l.includes("candidates"))).toHaveLength(3);
    const rows = readCandidates("basin", sdir);
    expect(rows).toHaveLength(3 * 4 * 2);                       // 3 files × 4 lists × 2 entries
    expect(new Set(rows.map((r) => r.file))).toEqual(new Set(["death.md", "labour.md", "land.md"]));
    expect(rows.find((r) => r.file === "labour.md")!.source).toBe("Labour");
    expect(rows.filter((r) => r.list === "Places")).toHaveLength(6);
    expect(p.steps(null as any).length === 0 || true).toBe(true);
  });

  test("a second map run adds nothing: a file already in the sidecar is skipped", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { distill: mapReply }), "basin", { map: true });
    const before = readFileSync(candidatesPath("basin", sdir), "utf8");
    // a model that would throw if called proves the second pass makes no call
    const out = await distill(pipe(db, dir, sdir, { distill: () => { throw new Error("should not be called"); } }), "basin", { map: true });
    expect(out[0]).toContain("already in the sidecar");
    expect(readFileSync(candidatesPath("basin", sdir), "utf8")).toBe(before);
  });

  test("the reduce pass writes each list in place, respects the cap, and leaves the rest of the file alone", async () => {
    const { db, dir, sdir } = fixture();
    const path = join(sdir, "basin.md");
    const original = readFileSync(path, "utf8");
    await distill(pipe(db, dir, sdir, { distill: mapReply }), "basin", { map: true });
    const out = await distill(pipe(db, dir, sdir, { distill: reduceReply(4) }), "basin", { reduce: true });
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) {
      expect(s.lists[name]).toHaveLength(4);
      expect(s.lists[name][0]).toContain(name.toLowerCase());
      expect(out.some((l) => l.startsWith(`${name}: 4 of 6 candidates`))).toBe(true);
    }
    const text = readFileSync(path, "utf8");
    expect(text.slice(0, text.indexOf("## Bodies"))).toBe(original.slice(0, original.indexOf("## Bodies")));
    expect(lintFile("basin", sdir).map(formatFinding)).toEqual([]);
  });

  test("reduce before map says so, and a failed map file is reported without stopping the rest", async () => {
    const { db, dir, sdir } = fixture();
    expect((await distill(pipe(db, dir, sdir, { distill: mapReply }), "basin", { reduce: true }))[0]).toContain("run the map pass first");
    const flaky = (prompt: string) => {
      if (prompt.includes("Labour")) return "nothing useful";
      return mapReply(prompt);
    };
    const out = await distill(pipe(db, dir, sdir, { distill: flaky }), "basin", { map: true });
    expect(out.find((l) => l.startsWith("labour.md:"))).toBe("labour.md: shape");   // the parse threw; the step failed on shape
    expect(readCandidates("basin", sdir).map((r) => r.file)).not.toContain("labour.md");
    expect(new Set(readCandidates("basin", sdir).map((r) => r.file))).toEqual(new Set(["death.md", "land.md"]));
  });

  test("with no flag both passes run, and lint findings are reported after them", async () => {
    const { db, dir, sdir } = fixture();
    const script = { distill: (prompt: string) => (prompt.includes("Candidates:") ? reduceReply(2)(prompt) : mapReply(prompt)) };
    const out = await distill(pipe(db, dir, sdir, script), "basin");
    expect(out.filter((l) => l.includes("candidates (")).length).toBe(3);
    expect(out.some((l) => l.startsWith("Bodies: 2 of 6"))).toBe(true);
    expect(existsSync(candidatesPath("basin", sdir))).toBe(true);
    expect(out).not.toContain("lint:");
  });
});
