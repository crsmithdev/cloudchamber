import { describe, expect, test } from "bun:test";
import { draftScript, drawn, fromAsk, sceneFor } from "./drafting.fixture.ts";
import { SceneSession } from "./scenesession.ts";
import { passId } from "./briefparts.ts";
import type { Resolved } from "./draftconfig.ts";

// beat 3 carries a figure a listener cannot hold and a sentence too long to say in one breath, so either edit has a sentence to swap
const FIGURES = "In 1,106 cases 42 of 97 wards burned on 3 May.";
const LONG = `The ward ${Array.from({ length: 34 }, () => "burned").join(" ")}.`;
const withFaults = (prompt: string) => {
  const out = sceneFor(prompt);
  return /Write beat 3 of the story/.test(prompt) ? out.replace("</scene>", ` ${FIGURES} ${LONG}</scene>`) : out;
};
// a figure is rounded; a long sentence is split in two
const swap = (prompt: string) => [...prompt.matchAll(/<sentence>([\s\S]*?)<\/sentence>/g)]
  .map(([, s]) => `<edit><from>${s}</from><to>${/\d/.test(s!) ? "About a thousand wards burned in May." : "The ward burned. It burned."}</to></edit>`).join("");

/** A drafted draw and a session over it; `after` lists the calls `revise` made. */
async function revising() {
  const t = await drawn(draftScript({ scene: withFaults, "scene-edit": swap }));
  await t.d.check(t.draw.id);
  // no ceiling sends a beat back while drafting: the test drives the changes itself
  await t.d.draft(t.draw.id, { overrides: { "screens.listen.numerals_max": 1000, "screens.listen.long_share_max": 1 } });
  const cfg = (JSON.parse(t.p.draw(t.draw.id).draft_config!) as Resolved).config;
  const session = SceneSession.resume(t.p, t.draw.id, cfg, passId());
  const mark = t.model.calls.length;
  const after = () => t.model.calls.slice(mark);
  const beatsOf = (stage: string) => [...new Set(after().filter((c) => c.stage === stage && !c.prompt.includes("<base/>"))
    .map((c) => Number(fromAsk(c.prompt, /<scene n="(\d+)">/, "the scene number"))))].sort((a, b) => a - b);
  return { ...t, session, after, beatsOf, M: session.schedule.beats.length };
}

describe("SceneSession.revise", () => {
  test("a numeral edit binds its beat and the beat after it, and screens neither for structure", async () => {
    const { session, after, beatsOf } = await revising();
    await session.revise([{ beat: 3, kind: "edit", lines: ["round the figures"], fault: { long: false, numerals: true } }]);
    expect(after().filter((c) => c.stage === "scene-edit")).toHaveLength(1);
    expect(session.scenes().find((s) => s.beat === 3)!.text).toContain("About a thousand wards burned in May.");
    expect(beatsOf("screen-ledger")).toEqual([3, 4]);
    expect(beatsOf("screen-structure")).toEqual([]);
  });

  test("a length edit changes no fact and binds nothing", async () => {
    const { session, after, beatsOf } = await revising();
    await session.revise([{ beat: 3, kind: "edit", lines: ["split the long sentences"], fault: { long: true, numerals: false } }]);
    expect(after().filter((c) => c.stage === "scene-edit")).toHaveLength(1);
    expect(session.scenes().find((s) => s.beat === 3)!.text).toContain("The ward burned. It burned.");
    expect(beatsOf("screen-ledger")).toEqual([]);
    expect(beatsOf("screen-structure")).toEqual([]);
  });

  test("two adjacent rewrites bind each once and the beat after the pair, and screen all three for structure", async () => {
    const { session, after, beatsOf } = await revising();
    await session.revise([{ beat: 4, kind: "rewrite", constraints: "<constraints>x</constraints>" }, { beat: 3, kind: "rewrite", constraints: "<constraints>x</constraints>" }]);
    const written = after().filter((c) => c.stage === "scene").map((c) => Number(fromAsk(c.prompt, /Write beat (\d+) of the story/, "the beat")));
    expect(written).toEqual([3, 4]);
    expect(beatsOf("screen-ledger")).toEqual([3, 4, 5]);
    expect(beatsOf("screen-structure")).toEqual([3, 4, 5]);
    expect(after().some((c) => c.prompt.includes("<base/>"))).toBe(false);
  });

  test("five binds or more fork from one base session", async () => {
    const { session, after, M } = await revising();
    const beats = [1, 3, 5].filter((k) => k <= M);
    await session.revise(beats.map((beat) => ({ beat, kind: "rewrite" as const })));
    // 1, 2, 3, 4, 5 and 6 when the schedule reaches it: at least five binds
    expect(after().filter((c) => c.stage === "screen-ledger" && c.prompt.includes("<base/>"))).toHaveLength(1);
  });
});
