import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TITLE, draftScript, drawn } from "./drafting.fixture.ts";
import { parseTitle, titlePrompt, TITLE_WORDS_MAX } from "./title.ts";
import { TEMPLATES } from "./prompts.ts";

describe("the title", () => {
  test("a draft ends on one title call that reads the premise, the scenes and what the schedule keeps back; the title is on the view, the export and the trail, and not in the story", async () => {
    const { d, draw, model, dir } = await drawn();
    await d.draft(draw.id);
    const calls = model.calls.filter((c) => c.stage === "title");
    expect(calls).toHaveLength(1);
    expect(model.calls.at(-1)!.stage).toBe("title");   // after the last screen
    const ask = calls[0].prompt;
    expect(ask).toContain("<premise>\nPremise 2 text.\n</premise>");   // the auto gate took the lowest stated probability
    expect(ask).toContain("Scene 1 opens.");
    expect(ask).toContain("Scene 8 opens.");
    expect(ask.indexOf("<premise>")).toBeLessThan(ask.indexOf("<story>"));
    // withheld until beat 7 and beat 6 of 8: past the midpoint, so the title is told not to name them
    expect(ask).toContain("- the instrument's wording\n- why she answers only Lauro");
    expect(ask).toContain(`at most ${TITLE_WORDS_MAX} words`);
    expect(d.view(draw.id).title).toBe(TITLE);
    expect(d.story(draw.id)).not.toContain(TITLE);   // the judges and the listen render read the scenes alone
    const { dir: out } = d.keep(draw.id);
    expect(readFileSync(join(out, "story.md"), "utf8").startsWith(`# ${TITLE}\n\nScene 1 opens.`)).toBe(true);
    expect(readFileSync(join(out, "trail.md"), "utf8")).toContain(`## draft\n\ntitle: ${TITLE}\n`);
    expect(readFileSync(join(out, "trail.md"), "utf8")).toContain("- title: claude-opus-5");
    expect(dir).toBeTruthy();
  });

  test("the ask names no withheld item when every reveal is early, and the parser takes the tag's text alone", () => {
    expect(titlePrompt("p", ["a", "b"], [])).not.toContain("keeps these back");
    expect(titlePrompt("p", ["a", "b"], ["x"])).toContain("the title names none of them:\n- x");
    expect(parseTitle('<title>"I Run the Dam. The Water Rises."</title>')).toBe("I Run the Dam. The Water Rises");
    expect(parseTitle("<title>\n  Two   Lines.\n  Joined\n</title>")).toBe("Two Lines. Joined");
    expect(() => parseTitle("no tag")).toThrow("no <title> tag");
    expect(() => parseTitle("<title>''</title>")).toThrow("empty <title>");
    expect(() => parseTitle(`<title>${Array.from({ length: TITLE_WORDS_MAX + 5 }, (_, i) => `w${i}`).join(" ")}</title>`)).toThrow(/over 16/);
    expect(parseTitle(`<title>${Array.from({ length: TITLE_WORDS_MAX + 4 }, (_, i) => `w${i}`).join(" ")}</title>`)).toContain("w0");
    expect(TEMPLATES.title).not.toMatch(/\b(reason|think)\b/i);
  });

  test("a failed title call leaves its step and the draft at gate 2 with no title; title writes one, a typed one replaces it, and a kept draft is exported again", async () => {
    const { p, d, draw, dir } = await drawn(draftScript({ title: [{ stop: "error", error: "boom" }, "<title>Second Try. It Holds</title>"] }));
    const out = await d.draft(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(d.view(draw.id).title).toBeNull();
    expect(p.steps(draw.id).filter((s) => s.stage === "title").map((s) => s.status)).toEqual(["failed"]);
    await d.retitle(draw.id);
    expect(d.view(draw.id).title).toBe("Second Try. It Holds");
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");
    await d.retitle(draw.id, "  My   Own Title ");
    expect(d.view(draw.id).title).toBe("My Own Title");
    expect(p.steps(draw.id).filter((s) => s.stage === "title").map((s) => s.model)).toEqual(["claude-opus-5", "claude-opus-5", "operator"]);
    await expect(d.retitle(draw.id, "  ")).rejects.toThrow("title text required");
    d.keep(draw.id);
    expect(readFileSync(join(dir, "drafts", draw.id, "story.md"), "utf8").startsWith("# My Own Title\n")).toBe(true);
    await d.retitle(draw.id, "Kept Title");
    expect(p.draw(draw.id).status).toBe("drafted");
    expect(readFileSync(join(dir, "drafts", draw.id, "story.md"), "utf8").startsWith("# Kept Title\n")).toBe(true);
  });

  test("the title is refused before the scenes exist", async () => {
    const { d, draw } = await drawn();
    await d.draft(draw.id, { plan: true });
    await expect(d.retitle(draw.id)).rejects.toThrow("is awaiting_plan_gate, not awaiting_draft_gate | drafted");
  });
});
