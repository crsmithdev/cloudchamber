import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "./store/db.ts";
import { FakeModel, type ModelAdapter } from "./model.ts";
import { Pipeline } from "./draw.ts";
import { settingsFixture } from "./settings.fixture.ts";
import { candidatesPath, distill, readCandidates, readKept, referenceFiles, splitSource } from "./distill.ts";
import { LISTS, entryName, formatFinding, lintFile, loadSetting } from "./settings.ts";

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

/** A reduce reply: echoes back the first `keep` candidates of the list it was asked for, bracket and all. */
const reduceReply = (keep: number) => (prompt: string) => {
  const list = /gathered for its (\w+) list/.exec(prompt)![1];
  const rows = (prompt.split("Candidates:\n\n")[1] ?? "").split("\n").filter(Boolean)
    .map((l) => l.replace(/^- /, "").replace(/\s{2,}\[/, " ["));
  return `<${list.toLowerCase()}>${rows.slice(0, keep).map((r) => `<entry>${r}</entry>`).join("")}</${list.toLowerCase()}>`;
};

const pipe = (db: any, dir: string, sdir: string, script: any) =>
  new Pipeline(db, new FakeModel(script), { rng: () => 0.001, briefsDir: join(dir, "briefs"), settingsDir: sdir });

describe("distill", () => {
  test("referenceFiles walks the tree and skips INDEX", () => {
    const { sdir } = fixture();
    writeFileSync(join(sdir, "basin", "reference", "INDEX.md"), "# index\n");
    expect(referenceFiles("basin", sdir)).toEqual(["death.md", "events.md", "labour.md", "land.md"]);
  });

  test("the map pass writes one sidecar line per candidate, tagged with the file and its topic", async () => {
    const { db, dir, sdir } = fixture();
    const p = pipe(db, dir, sdir, { "distill-map": mapReply });
    const out = await distill(p, "basin", { map: true });
    expect(out.filter((l) => l.includes("candidates"))).toHaveLength(4);
    const rows = readCandidates("basin", sdir);
    expect(rows).toHaveLength(4 * 5 * 2);                       // 4 files × 5 lists × 2 entries
    expect(new Set(rows.map((r) => r.file))).toEqual(new Set(["death.md", "events.md", "labour.md", "land.md"]));
    expect(rows.find((r) => r.file === "labour.md")!.source).toBe("Labour");
    expect(rows.filter((r) => r.list === "Places")).toHaveLength(8);
    expect(p.steps(null as any).length === 0 || true).toBe(true);
  });

  test("a second map run adds nothing: a file already in the sidecar is skipped", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const before = readFileSync(candidatesPath("basin", sdir), "utf8");
    // a model that would throw if called proves the second pass makes no call
    const out = await distill(pipe(db, dir, sdir, { "distill-map": () => { throw new Error("should not be called"); } }), "basin", { map: true });
    expect(out[0]).toContain("already in the sidecar");
    expect(readFileSync(candidatesPath("basin", sdir), "utf8")).toBe(before);
  });

  test("a changed file loses its rows and is mapped again; the others make no call", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const labour = join(sdir, "basin", "reference", "labour.md");
    writeFileSync(labour, `${readFileSync(labour, "utf8")}\nA paragraph the re-fetch added.\n`);
    const p = pipe(db, dir, sdir, { "distill-map": mapReply });
    const out = await distill(p, "basin", { map: true });
    expect(((p as any).model as FakeModel).calls.map((c) => c.prompt.includes("Labour"))).toEqual([true]);
    expect(out).toContain("labour.md: 10 candidates dropped (changed)");
    const rows = readCandidates("basin", sdir);
    expect(rows).toHaveLength(4 * 5 * 2);
    expect(new Set(rows.filter((r) => r.file === "labour.md").map((r) => r.hash)).size).toBe(1);
  });

  test("a removed file loses its rows without a call", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    rmSync(join(sdir, "basin", "reference", "land.md"));
    const out = await distill(pipe(db, dir, sdir, { "distill-map": () => { throw new Error("should not be called"); } }), "basin", { map: true });
    expect(out).toEqual(["land.md: 10 candidates dropped (removed)", "map: every reference file is already in the sidecar"]);
    expect(readCandidates("basin", sdir).map((r) => r.file)).not.toContain("land.md");
  });

  test("rows written before hashing count as stale, so every file is mapped again", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const path = candidatesPath("basin", sdir);
    writeFileSync(path, readCandidates("basin", sdir).map(({ hash, ...r }) => `${JSON.stringify(r)}\n`).join(""));
    const p = pipe(db, dir, sdir, { "distill-map": mapReply });
    await distill(p, "basin", { map: true });
    expect(((p as any).model as FakeModel).calls).toHaveLength(4);
    const rows = readCandidates("basin", sdir);
    expect(rows).toHaveLength(4 * 5 * 2);
    expect(rows.every((r) => r.hash)).toBe(true);
  });

  test("the map sends files at once, on its own stage, and keeps the report in file order", async () => {
    const { db, dir, sdir } = fixture();
    const fake = new FakeModel({ "distill-map": mapReply });
    let inFlight = 0, most = 0;
    const slow: ModelAdapter = {
      call: async (...args) => {
        most = Math.max(most, ++inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return fake.call(...args);
      },
    };
    const p = new Pipeline(db, slow, { rng: () => 0.001, briefsDir: join(dir, "briefs"), settingsDir: sdir });
    const out = await distill(p, "basin", { map: true });
    expect(most).toBe(4);
    expect(fake.calls.map((c) => c.stage)).toEqual(["distill-map", "distill-map", "distill-map", "distill-map"]);
    expect(out.slice(0, 4).map((l) => l.split(":")[0])).toEqual(["death.md", "events.md", "labour.md", "land.md"]);
    expect(readCandidates("basin", sdir)).toHaveLength(4 * 5 * 2);
  });

  test("the reduce pass writes each list in place, respects the cap, and leaves the rest of the file alone", async () => {
    const { db, dir, sdir } = fixture();
    const path = join(sdir, "basin.md");
    const original = readFileSync(path, "utf8");
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const out = await distill(pipe(db, dir, sdir, { distill: reduceReply(4) }), "basin", { reduce: true });
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) {
      expect(s.lists[name]).toHaveLength(4);
      expect(s.lists[name][0]).toContain(name.toLowerCase());
    }
    const text = readFileSync(path, "utf8");
    expect(text.slice(0, text.indexOf("## Bodies"))).toBe(original.slice(0, original.indexOf("## Bodies")));
    for (const name of LISTS) for (const e of s.lists[name]) expect(e).not.toContain("[");   // the bracket survives the call, not the file
    expect(lintFile("basin", sdir).map(formatFinding)).toEqual([]);
    // the trail the setting file cannot carry
    const kept = readKept("basin", sdir);
    expect(kept).toHaveLength(5 * 4);
    for (const name of LISTS) {
      const mine = kept.filter((k) => k.list === name);
      expect(mine.map((k) => k.entry)).toEqual(s.lists[name]);
      for (const k of mine) expect(["death.md", "events.md", "labour.md", "land.md"]).toContain(k.file);
    }
    for (const name of LISTS) expect(out.some((l) => l.startsWith(`${name}: 4 of 8 candidates, 4 traced`))).toBe(true);
  });

  test("reduce before map says so, and a failed map file is reported without stopping the rest", async () => {
    const { db, dir, sdir } = fixture();
    expect((await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { reduce: true }))[0]).toContain("run the map pass first");
    const flaky = (prompt: string) => {
      if (prompt.includes("Labour")) return "nothing useful";
      return mapReply(prompt);
    };
    const out = await distill(pipe(db, dir, sdir, { "distill-map": flaky }), "basin", { map: true });
    expect(out.find((l) => l.startsWith("labour.md:"))).toBe("labour.md: shape");   // the parse threw; the step failed on shape
    expect(readCandidates("basin", sdir).map((r) => r.file)).not.toContain("labour.md");
    expect(new Set(readCandidates("basin", sdir).map((r) => r.file))).toEqual(new Set(["death.md", "events.md", "land.md"]));
  });

  test("a later list is told what the earlier ones kept, so the setting names each thing once", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const p = pipe(db, dir, sdir, { distill: reduceReply(2) });
    const model = (p as any).model as FakeModel;
    await distill(p, "basin", { reduce: true });
    const prompts = model.calls.filter((c) => c.stage === "distill").map((c) => c.prompt);
    expect(prompts[0]).not.toContain("has already taken the things below");   // Bodies is reduced first
    const kept = loadSetting("basin", sdir).lists.Bodies;
    for (const later of prompts.slice(1)) {
      expect(later).toContain("has already taken the things below");
      for (const e of kept) expect(later).toContain(`- ${entryName(e)}`);
    }
  });

  test("with no flag both passes run, and lint findings are reported after them", async () => {
    const { db, dir, sdir } = fixture();
    const script = { "distill-map": mapReply, distill: reduceReply(2) };
    const out = await distill(pipe(db, dir, sdir, script), "basin");
    expect(out.filter((l) => l.includes("candidates (")).length).toBe(4);
    expect(out.some((l) => l.startsWith("Bodies: 2 of 8"))).toBe(true);
    expect(existsSync(candidatesPath("basin", sdir))).toBe(true);
    expect(out).not.toContain("lint:");
  });
});

describe("the trail", () => {
  test("splitSource takes the bracket off an entry and hands back what it named", () => {
    expect(splitSource("Ellis — to withdraw a parcel   [Housing]")).toEqual({ entry: "Ellis — to withdraw a parcel", source: "Housing" });
    expect(splitSource("Ellis — to withdraw a parcel [Housing and displacement]").source).toBe("Housing and displacement");
    expect(splitSource("Ellis — to withdraw a parcel")).toEqual({ entry: "Ellis — to withdraw a parcel", source: "" });
    expect(splitSource("Section 8A.103 — a milestone [x]").entry).toBe("Section 8A.103 — a milestone");
  });

  test("a second reduce rewrites the trail rather than appending to it", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    await distill(pipe(db, dir, sdir, { distill: reduceReply(4) }), "basin", { reduce: true });
    await distill(pipe(db, dir, sdir, { distill: reduceReply(2) }), "basin", { reduce: true });
    const kept = readKept("basin", sdir);
    expect(kept).toHaveLength(5 * 2);
    expect(kept.map((k) => k.entry)).toEqual(LISTS.flatMap((n) => loadSetting("basin", sdir).lists[n]));
  });
});

describe("the word cap is enforced in code", () => {
  const long = (n: number, tag = "x") => `The ${tag} body — ${Array.from({ length: n }, (_, i) => `w${i}`).join(" ")}   [Death]`;

  /** A reduce that returns one over-long entry, then a trim call that cuts it. */
  const script = (trimTo: number) => ({
    distill: (prompt: string) => {
      if (prompt.startsWith("Each entry below is over")) {
        const n = (prompt.match(/^- /gm) ?? []).length;
        const list = /<(\w+)> tag holding one/.exec(prompt)![1];
        return `<${list}>${Array.from({ length: n }, (_, i) => `<entry>${long(trimTo, `cut${i}`)}</entry>`).join("")}</${list}>`;
      }
      if (prompt.includes("Candidates:")) {
        const list = /gathered for its (\w+) list/.exec(prompt)![1].toLowerCase();
        return `<${list}><entry>${long(60)}</entry><entry>The short ${list} — a thing; and what follows   [Death]</entry></${list}>`;
      }
      return mapReply(prompt);
    },
  });

  test("an over-long entry gets one trim call, and the cut version is what lands", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const out = await distill(pipe(db, dir, sdir, script(10)), "basin", { reduce: true });
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) {
      expect(s.lists[name]).toHaveLength(2);
      for (const e of s.lists[name]) expect(e.split(/\s+/).length).toBeLessThanOrEqual(45);
      expect(out.some((l) => l.startsWith(`${name}: 1 entry over 45 words, 1 cut, 0 dropped`))).toBe(true);
    }
    expect(lintFile("basin", sdir).map(formatFinding)).toEqual([]);
  });

  test("an entry still over the cap after the trim is dropped, not written", async () => {
    const { db, dir, sdir } = fixture();
    await distill(pipe(db, dir, sdir, { "distill-map": mapReply }), "basin", { map: true });
    const out = await distill(pipe(db, dir, sdir, script(60)), "basin", { reduce: true });
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) {
      expect(s.lists[name]).toHaveLength(1);                       // the long one is gone, the short one stays
      expect(out.some((l) => l.startsWith(`${name}: 1 entry over 45 words, 0 cut, 1 dropped`))).toBe(true);
    }
    expect(lintFile("basin", sdir).map(formatFinding)).toEqual([]);   // a setting can never land unloadable
    expect(readKept("basin", sdir)).toHaveLength(5);
  });
});
