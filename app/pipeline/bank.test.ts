import { describe, expect, test } from "bun:test";
import { openDb, type Db } from "./store/db.ts";
import { eligiblePassages, sourceLabel } from "./bank.ts";

function fixture(): Db {
  const db = openDb(":memory:");
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES
    ('scp', 'sources/horror/scp/scp-*.md', 'scp', 'horror'),
    ('datlow-01', 'sources/horror/Ellen Datlow - The Best Horror of the Year Volume 01.pdf', 'pdf', 'horror'),
    ('watts-blindsight', 'sources/scifi/Peter Watts - Blindsight.pdf', 'pdf', 'scifi')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES
    ('scp/a', 'scp', 0, 'A', '', 'horror', 100, 'x'),
    ('datlow-01/b', 'datlow-01', 0, 'B', '', 'horror', 100, 'y'),
    ('watts-blindsight/c', 'watts-blindsight', 0, 'C', '', 'scifi', 100, 'z')`);
  const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen) VALUES (?, ?, 'p', 100, 0, 0, 0, 'now')");
  ins.run("p1", "scp/a"); ins.run("p2", "datlow-01/b"); ins.run("p3", "watts-blindsight/c");
  return db;
}

describe("the example pool", () => {
  test("a segment names no source, one, or several", () => {
    const db = fixture();
    expect(eligiblePassages(db).map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(eligiblePassages(db, { source: "scp" }).map((p) => p.id)).toEqual(["p1"]);
    expect(eligiblePassages(db, { source: ["scp", "watts-blindsight"] }).map((p) => p.id).sort()).toEqual(["p1", "p3"]);
    expect(eligiblePassages(db, { source: [], genre: "scifi" }).map((p) => p.id)).toEqual(["p3"]);
  });

  test("a source is named by its own file, and by its id when the file does not name one", () => {
    expect(sourceLabel("datlow-01", "sources/horror/Ellen Datlow - The Best Horror of the Year Volume 01.pdf"))
      .toEqual({ group: "Ellen Datlow", title: "The Best Horror of the Year Volume 01" });
    expect(sourceLabel("watts-blindsight", "sources/scifi/Peter Watts - Blindsight.pdf")).toEqual({ group: "Peter Watts", title: "Blindsight" });
    expect(sourceLabel("scp", "sources/horror/scp/scp-*.md")).toEqual({ group: "scp", title: "scp" });
  });
});
