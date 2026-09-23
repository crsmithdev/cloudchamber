import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { noPdf, renderReport, writeReport } from "./report.ts";
import { writeBrief } from "./brief.ts";
import { draftScript, drawn } from "./drafting.fixture.ts";

/** One drafted draw, as gate 2 leaves it. */
async function drafted() {
  const { p, d, draw, db, dir } = await drawn(draftScript({}));
  await d.check(draw.id);
  await d.draft(draw.id);
  return { p, d, draw, db, dir };
}

describe("the report", () => {
  test("it holds the story, the brief it came from, and the cost by stage", async () => {
    const { p, draw } = await drafted();
    const html = renderReport(p, draw.id);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(draw.id);
    expect(html).toContain("Scene 1 opens.");            // the story
    expect(html).toContain("Section departure body.");    // the brief's outline
    expect(html).toContain("scene");                      // the cost table names the stages
    expect(html).toContain("claude-opus-5");
    // the fonts are embedded, because headless Chrome hangs on Google Fonts
    expect(html).not.toContain("fonts.googleapis.com");
  });

  test("writeReport writes the html, and the pdf only when its printer prints one", async () => {
    const { p, draw } = await drafted();
    const out = mkdtempSync(join(tmpdir(), "cc-report-"));
    const none = await writeReport(p, draw.id, out, noPdf);
    expect(existsSync(none.html)).toBe(true);
    expect(none.pdf).toBeNull();
    let asked: string[] = [];
    const fake = async (html: string, pdf: string) => { asked = [html, pdf]; await Bun.write(pdf, "%PDF-1.4"); return true; };
    const withPdf = await writeReport(p, draw.id, out, fake);
    expect(asked).toEqual([withPdf.html, join(out, draw.id, "report.pdf")]);
    expect(withPdf.pdf).toBe(join(out, draw.id, "report.pdf"));
  });
});

describe("the brief on disk", () => {
  test("one file per part, and a trail naming every premise, the chosen one, and the models", async () => {
    const { p, draw, db, dir } = await drafted();
    const base = join(dir, "briefs-test");
    const at = writeBrief(db, draw.id, base);
    for (const f of ["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "trail.md"]) {
      expect([f, existsSync(join(at, f))]).toEqual([f, true]);
    }
    const trail = readFileSync(join(at, "trail.md"), "utf8");
    // every premise the model stated, whether or not it was executed, and the one the gate took
    expect(trail.match(/^- \*\*0\.0\d\*\*/gm)).toHaveLength(5);
    expect(trail).toContain("← chosen");
    expect(trail).toContain("(not executed)");
    expect(trail).toContain("gate: auto");
    expect(trail).toContain("- scene: claude-opus-5");
    expect(readFileSync(join(at, "context-1.md"), "utf8")).toContain("*Job: Test the first thing");
  });
});
