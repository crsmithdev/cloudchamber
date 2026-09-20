import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeModel } from "./model.ts";
import { BODY_LINE, COST_LINE, LENGTH_LINE, NUMERAL_LINE, PRESENCE_LINE, parseConflicts, rewritePlan } from "./drafting.ts";
import { parseSchedule, structurePrompt } from "./write.ts";
import { checkersNext, NOT_IN_PROSE, parseVerdicts } from "./check.ts";
import { settingsFixture } from "./settings.fixture.ts";
import { LISTS, loadSetting } from "./settings.ts";
import { latest, readLog } from "./verdicts.ts";
import { status } from "./status.ts";
import { TEMPLATES } from "./prompts.ts";
import { loadStages } from "./config.ts";
import { loadDraftConfig } from "./draftconfig.ts";
import { VERDICT_LOG } from "./paths.ts";
import { A, B, LEDGER, SCENE_3_PATCH, SPAN_A, SPAN_B, SPAN_C, cleanSamples, derivationSamples, draftScript, drawn, finding, fixture, ledgerSamples, schedule, screenStructure, vignette } from "./drafting.fixture.ts";
import { briefParts, partsIn, partsOf } from "./briefparts.ts";
import { chainOf } from "./chain.ts";
import { renderStory } from "./drafts.ts";

/** The default floor is 7; B, an particulars finding at two of three samples, sits at 6, so a test that needs two fixes at once lowers it. */
const floor6 = () => ({ ...loadDraftConfig().config, repair: { ...loadDraftConfig().config.repair, stop_score: 6 } });
/** A chosen vignette that carries the given spans, so a finding quoting one is in the prose a reader sees. */
const withWords = (words: string[]) => (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)).replace("</vignette>", ` ${words.join(". ")}.</vignette>`);
const stagesOf = (model: FakeModel, re: RegExp) => model.calls.filter((c) => re.test(c.stage)).map((c) => c.stage);

describe("check and gate 1", () => {
  test("K checkers × S samples, recurrence, cross-checker merge, ordering, profiles, examined lists, same-family line", async () => {
    const { model, p, d, draw } = await drawn();
    const r = await d.check(draw.id);
    expect(p.draw(draw.id).status).toBe("awaiting_check_gate");
    expect(stagesOf(model, /^check-/).sort()).toEqual(["check-derivation", "check-derivation", "check-derivation", "check-ledger", "check-ledger", "check-ledger", "check-resemblance", "check-structure", "check-verify", "check-verify"]);
    expect(r.claims).toBe("off");
    // A recurs 3/3 in both checkers and merges; B recurs 2/3; C (1/3) is not stored
    const f = d.findings(draw.id);
    expect(f.findings.map((x) => [x.checkers, x.n, x.invalidates, x.decision])).toEqual([[["derivation", "ledger"], 3, "departure", "open"], [["ledger"], 2, "particulars", "open"]]);
    expect(f.findings[0].replacement).toBe("Only the assembler can fire the reliquary.");
    expect(f.findings[1].samples).toEqual([1, 3]);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(2);
    expect(p.artifacts(draw.id).some((a) => a.kind === "finding" && a.content.includes("tears"))).toBe(false);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "ledger")).toHaveLength(1);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "profile").map((a) => a.meta.checker).sort()).toEqual(["resemblance", "structure"]);
    expect(f.examined.filter((e) => e.stage === "check-ledger")).toHaveLength(3);
    expect(f.examined.find((e) => e.stage === "check-ledger")!.examined).toContain("ledger×chosen");
    expect(f.judge).toBe("checked on opus; judge and generator share a family");
    expect(f.claims).toEqual([]);
    // every check step stores no tools and the brief in its prompt
    for (const s of p.steps(draw.id).filter((s) => /^check-/.test(s.stage))) { expect(s.tools).toBe(""); expect(s.prompt).toContain('<vignette name="chosen">'); expect(s.parsed).toBeTruthy(); }
    expect(model.calls.find((c) => c.stage === "check-resemblance")!.prompt).toContain("3. The madman");
    await expect(d.check("nope")).rejects.toThrow(/no draw nope/);
    expect((status(p.db).draws as any[]).find((x) => x.status === "awaiting_check_gate").n).toBe(1);
  });

  test("the gate reads one partition: listed, reopened, left, the summary, and what the auto rule would consider", async () => {
    const { d, draw } = await drawn();
    await d.check(draw.id);
    const f = d.findings(draw.id);
    const [a, b] = f.findings;
    expect(f.listed.map((x) => x.id)).toEqual([a.id, b.id]);
    expect([f.reopened, f.left]).toEqual([[], []]);
    expect(f.findings.every((x) => x.auto_eligible)).toBe(true);
    expect(f.summary).toEqual({ pass: f.pass, reported: 2, accepted: 0, open: 2, total: a.score + b.score });
    // a dismissed finding stays on the list, ruled on; the summary counts it out of open
    d.dismiss(draw.id, b.id, "deliberate");
    const g = d.findings(draw.id);
    expect(g.listed.map((x) => [x.id, x.decision])).toEqual([[a.id, "open"], [b.id, "dismissed"]]);
    expect(g.summary).toMatchObject({ reported: 2, accepted: 0, open: 1 });
    // what left the list is there only when asked for, under its own head, and the auto rule does not consider it
    expect(d.findings(draw.id, { all: true }).left.map((x) => [x.reported, x.decision])).toEqual([[false, "open"]]);
  });

  test("dismiss is a finding verdict; a re-check does not raise the finding again; hold changes nothing", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...ledgerSamples()], "check-derivation": [...derivationSamples(), ...derivationSamples()] }));
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings;
    const dis = d.dismiss(draw.id, b.id, "the seam is deliberate");
    expect(dis.decision).toBe("dismissed");
    expect(latest(p.db, "finding", b.id)).toMatchObject({ verdict: "pass", note: "the seam is deliberate" });
    expect(d.hold(draw.id).status).toBe("awaiting_check_gate");
    await d.check(draw.id);
    const again = d.findings(draw.id).findings;
    expect(again.map((x) => x.id)).toEqual([a.id]);
    expect(stagesOf(model, /^check-ledger$/)).toHaveLength(6);
    expect(() => d.dismiss(draw.id, "f-nothere")).toThrow(/no reported finding f-nothere/);
  });

  test("accept repairs into a linked draw: the ending holding the span is rewritten, the vignette and the outline carried, then re-checked", async () => {
    const { p, d, draw, model, dir } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    expect(next.id).not.toBe(draw.id);
    expect(next.repaired_from).toBe(draw.id);
    expect(next.status).toBe("awaiting_check_gate");
    expect(next.seed_text).toBe("a typed seed");
    expect(next.example_ids).toBe(draw.example_ids);
    expect(p.draw(draw.id)).toMatchObject({ status: "repaired", superseded_by: next.id });
    expect(latest(p.db, "finding", a.id)).toMatchObject({ verdict: "keep" });
    const steps = p.steps(next.id);
    const by = (stage: string) => steps.filter((s) => s.stage === stage);
    expect(by("repair-vignette").map((s) => s.model)).toEqual(["copied"]);            // the span is not in the vignette
    expect(by("repair-ending")).toHaveLength(1);
    expect(by("repair-ending")[0].model).not.toBe("copied");                       // the span is in the ending
    expect(by("repair-outline").map((s) => s.model)).toEqual(["copied"]);       // the outline is the chain's contract, carried, never re-derived
    // no accepted finding lands in a context vignette, so both are carried over and no jobs call runs
    expect(by("jobs").map((s) => s.model)).toEqual(["copied"]);
    expect(by("context").map((s) => s.model)).toEqual(["copied", "copied"]);
    expect(model.calls.filter((c) => c.stage === "jobs" || c.stage === "context")).toHaveLength(3);   // the draw's own one and two, not the repair's
    expect(p.artifacts(next.id).filter((a) => a.kind === "job").map((a) => a.content)).toEqual(["Test the first thing: scene one.", "Test a second thing: scene two."]);
    expect(model.calls.find((c) => c.stage === "repair-ending")!.prompt).toContain(SPAN_A);
    expect(model.calls.find((c) => c.stage === "repair-ending")!.prompt).toContain("Rewrite the ending");
    expect(model.calls.filter((c) => c.stage === "execute")).toHaveLength(5);      // nothing regenerated from the premise
    // the new brief and its trail
    const bdir = join(dir, "briefs", next.id);
    for (const f of ["vignette.md", "outline.md", "context-1.md", "context-2.md", "ending.md", "ending.previous.md", "trail.md"]) expect(existsSync(join(bdir, f))).toBe(true);
    expect(readFileSync(join(bdir, "ending.previous.md"), "utf8")).toContain(SPAN_A);
    expect(readFileSync(join(bdir, "ending.md"), "utf8")).toContain("Only the assembler");
    expect(readFileSync(join(bdir, "vignette.md"), "utf8")).toContain("w2_0");
    const outlineMd = readFileSync(join(bdir, "outline.md"), "utf8");
    expect(outlineMd).toContain("Section departure body.");                   // the author's outline
    expect(outlineMd).toContain("- Only the assembler can fire the reliquary.");   // with the fix appended, as the check reads it
    const trail = readFileSync(join(bdir, "trail.md"), "utf8");
    expect(trail).toContain("# Trail (repaired)");
    expect(trail).toContain(`## repaired_from\n\n${draw.id}\n\n- Only the assembler can fire the reliquary.`);
    // the re-check ran on the new draw and found nothing
    expect(p.steps(next.id).filter((s) => s.stage === "check-ledger")).toHaveLength(3);
    expect(d.findings(next.id).findings).toEqual([]);
    expect(d.findings(next.id).judge).toBe("checked on opus; judge and generator share a family");
    await expect(d.accept(draw.id, [a.id])).rejects.toThrow(/is repaired, not awaiting_check_gate/);
  });

  test("archive acts on the whole repair chain, and unarchive brings it back", async () => {
    const { p, d, draw } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    expect(chainOf(p, next.id).rounds).toEqual([draw.id, next.id]);
    p.archive(next.id);
    expect([p.draw(draw.id).archived_at, p.draw(next.id).archived_at].map(Boolean)).toEqual([true, true]);
    p.archive(next.id, false);
    expect([p.draw(draw.id).archived_at, p.draw(next.id).archived_at]).toEqual([null, null]);
  });

  test("a finding whose span is inside the chosen vignette rewrites the vignette and copies the ending", async () => {
    const span = "the twelfth relic, the Verona clavicle";
    const script = draftScript({
      execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0), `Here lies ${span} on the silk.`),
      "check-ledger": [...ledgerSamples(B(span), B(span)), ...cleanSamples()],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const f = d.findings(draw.id).findings.filter((x) => x.reported);           // C's span is not in this vignette, so it is dropped under the bar
    expect(f).toHaveLength(1);
    expect(f[0].invalidates).toBe("particulars");
    const next = await d.accept(draw.id, [f[0].id]);
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("repair-vignette")[0].model).not.toBe("copied");
    expect(by("repair-vignette")[0].prompt).toContain(span);
    // particulars invalidated: the ending is rewritten even though the span is not in it
    expect(by("repair-ending")[0].model).not.toBe("copied");
    expect(p.artifacts(next.id).find((a) => a.kind === "vignette" && a.step_id === next.chosen_step)!.content).toContain("rewritten vignette");
  });

  test("the clusters below keep_if are reported on request, scored, and can be accepted and dismissed", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const calls = model.calls.length;
    const reported = d.findings(draw.id).findings;
    const all = d.findings(draw.id, { all: true }).findings;
    expect(reported.map((x) => x.span)).toEqual([SPAN_A, SPAN_B]);
    expect(model.calls).toHaveLength(calls);                                    // reconstructed from the steps, nothing re-run
    // C recurred in one sample of three: below the bar, still a reading
    const sub = all.filter((x) => !x.reported);
    expect(sub.map((x) => [x.span, x.n, x.samples_run, x.invalidates])).toEqual([[SPAN_C, 1, 3, "knowledge"]]);
    expect(all.map((x) => x.score)).toEqual([10, 6, 5]);                        // sorted; B is particulars at 2 of 3, so it is under the floor
    expect(sub[0].artifact_id).toBe("");                                        // no artifact until it is decided on
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(2);
    // dismissing one promotes it to an artifact, so a re-check does not raise it again
    d.dismiss(draw.id, sub[0].id, "the silk is meant to be wet");
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(3);
    expect(latest(p.db, "finding", sub[0].id)).toMatchObject({ verdict: "pass" });
    // it stays on the gate as a record of the decision, still marked below the bar, and a re-check will not raise it
    const after = d.findings(draw.id, { all: true }).findings.find((x) => x.span === SPAN_C)!;
    expect([after.decision, after.reported]).toEqual(["dismissed", false]);
    expect(d.findings(draw.id).findings.filter((x) => x.reported)).toHaveLength(2);
  });

  test("context-1.md holds job 1 however the context calls finish", async () => {
    // the second context call returns first, so its artifact row lands first
    let seen = 0;
    const script = draftScript({
      context: (p: string) => { seen++; return `<vignette>context for ${/Its job: (.*)/.exec(p)?.[1]}</vignette>`; },
      "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { d, draw, dir } = await drawn(script);
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    for (const id of [draw.id, next.id]) {
      const one = readFileSync(join(dir, "briefs", id, "context-1.md"), "utf8");
      const two = readFileSync(join(dir, "briefs", id, "context-2.md"), "utf8");
      expect(one).toContain("Test the first thing: scene one.");
      expect(two).toContain("Test a second thing: scene two.");
    }
    expect(seen).toBe(2);                                                      // the repair copied both, so no third call
  });

  test("a sub-threshold finding can drive a repair", async () => {
    const { p, d, draw } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...cleanSamples(), ...cleanSamples()] }));
    await d.check(draw.id);
    const sub = d.findings(draw.id, { all: true }).findings.filter((x) => !x.reported);
    expect(sub.length).toBeGreaterThan(0);
    const next = await d.accept(draw.id, [sub[0].id]);
    expect(next.repaired_from).toBe(draw.id);
    expect(p.artifacts(next.id).find((a) => a.kind === "outline")!.content).toContain("- The silk is dry.");   // its fix amends the carried outline
    expect(p.artifacts(draw.id).find((a) => a.kind === "finding" && a.content.includes("tears"))!.meta.sub_threshold).toBe(true);
  });

  test("a finding carrying a patch is applied in place and regenerates nothing", async () => {
    const span = "the twelfth relic, the Verona clavicle";
    const patched = "the twelfth relic, the Bruges clavicle";
    const withPatch = `<finding><span>${span}</span><statement>the relic is named twice</statement><result>contradicted</result><evidence>a second quote from the outline</evidence><invalidates>none</invalidates><replacement>The twelfth relic is named once.</replacement><patch>${patched}</patch></finding>`;
    const script = draftScript({
      execute: (pr: string) => vignette(Number(/Premise (\d)/.exec(pr)?.[1] ?? 0), `Here lies ${span} on the silk.`),
      "check-ledger": [`<ledger>${LEDGER}</ledger>${withPatch}<examined>x</examined>`, `<ledger>${LEDGER}</ledger>${withPatch}<examined>x</examined>`, `<ledger>${LEDGER}</ledger>${withPatch}<examined>x</examined>`, ...cleanSamples()],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model, dir } = await drawn(script);
    await d.check(draw.id);
    const [f] = d.findings(draw.id).findings;
    expect(f.patch).toBe(patched);
    const before = model.calls.length;
    const next = await d.accept(draw.id, [f.id]);

    // the vignette holding the span is patched, not rewritten; everything else is carried, so the round makes no call at all
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("repair-vignette").map((s) => s.model)).toEqual(["patched"]);
    expect(by("repair-outline").map((s) => s.model)).toEqual(["copied"]);
    expect(by("repair-ending").map((s) => s.model)).toEqual(["copied"]);
    expect(by("context").map((s) => s.model)).toEqual(["copied", "copied"]);
    expect(model.calls.slice(before).map((c) => c.stage).filter((x) => /^repair|^context$|^jobs$/.test(x))).toEqual([]);

    const out = readFileSync(join(dir, "briefs", next.id, "vignette.md"), "utf8");
    expect(out).toContain(patched);
    expect(out).not.toContain(span);
    expect(p.artifacts(next.id).find((a) => a.kind === "vignette" && a.step_id === next.chosen_step)!.meta.patched).toEqual([f.id]);
  });

  test("a finding inside one context vignette rewrites that one and carries the other over with its job", async () => {
    const span = "context for Test the first thing: scene one.";
    const inContext = () => finding(span, "context-1 contradicts the ledger", "knowledge", "The first context holds.", "a second quote from the outline");
    const script = draftScript({
      "check-ledger": [
        `<ledger>${LEDGER}</ledger>${inContext()}<examined>ledger×context-1</examined>`,
        `<ledger>${LEDGER}</ledger>${inContext()}<examined>ledger×context-1</examined>`,
        `<ledger>${LEDGER}</ledger>${inContext()}<examined>ledger×context-1</examined>`,
        ...cleanSamples(),
      ],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model } = await drawn(script);
    await d.check(draw.id);
    const f = d.findings(draw.id).findings;
    expect(f).toHaveLength(1);
    const next = await d.accept(draw.id, [f[0].id]);
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("jobs").map((s) => s.model)).toEqual(["copied"]);                  // both jobs travel with their vignettes
    expect(by("repair-context")).toHaveLength(1);                               // the one with the finding is rewritten from itself
    expect(by("context").map((s) => s.model)).toEqual(["copied"]);              // the other is carried over
    const jobs = p.artifacts(next.id).filter((a) => a.kind === "job").sort((a, b) => a.meta.index - b.meta.index);
    expect(jobs.map((a) => [a.content, a.meta.copied])).toEqual([["Test the first thing: scene one.", true], ["Test a second thing: scene two.", true]]);
    const ctx = p.artifacts(next.id).filter((a) => a.kind === "vignette" && [...by("context"), ...by("repair-context")].some((s) => s.id === a.step_id))
      .sort((a, b) => a.meta.index - b.meta.index);
    expect(ctx[0].content).toContain("rewritten context");
    // the part names the step it was rewritten from, which is the context of the draw being repaired
    const srcContext1 = partsIn(partsOf(p, draw.id), "context")[0];
    expect(ctx[0].meta).toMatchObject({ index: 1, job: "Test the first thing: scene one.", rewritten_from: srcContext1.stepId });
    expect(ctx[1].content).toBe("context for Test a second thing: scene two.");
    expect(model.calls.filter((c) => c.stage === "context")).toHaveLength(2);    // two on the draw, none on the repair
    expect(model.calls.find((c) => c.stage === "repair-context")!.prompt).toContain("The first context holds.");
  });

  test("a fix accepted in an earlier round is carried into every later repair and is not re-argued", async () => {
    // A is accepted in round 1 and reported again by every re-check; auto's floor stop re-checks once more
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...ledgerSamples(), ...ledgerSamples(), ...ledgerSamples()],
      "check-derivation": [...derivationSamples(), ...derivationSamples(), ...derivationSamples(), ...derivationSamples()],
    });
    const { p, d, draw, dir } = await drawn(script);
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);

    // the settled block reaches the next repair's prompts, and the trail records it
    const again = d.findings(next.id, { all: true }).findings;
    const same = again.find((f) => f.span === SPAN_A)!;
    expect(same.relitigates).toMatchObject({ round: 1, draw: draw.id });
    expect(same.relitigates!.replacement).toBe("Only the assembler can fire the reliquary.");

    // a third repair, driven by hand, carries the round-1 fix as settled rather than as a constraint: B lands in the vignette, which is rewritten
    const third = await d.accept(next.id, [again.find((f) => f.span === SPAN_B)!.id]);
    const prompt = p.steps(third.id).find((s) => s.stage === "repair-vignette")!.prompt;
    expect(prompt).toContain("<settled>\n- Only the assembler can fire the reliquary.\n</settled>");
    expect(prompt).toContain("The twelfth relic is the Verona clavicle in every account.");   // this round's constraint
    expect(readFileSync(join(dir, "briefs", third.id, "trail.md"), "utf8")).toContain("## settled in earlier rounds\n\n- round 1: Only the assembler can fire the reliquary.");

    // auto will not act on A and leaves it open for a person; the floor is held at 7 so nothing else is accepted
    const aId = d.findings(third.id, { all: true }).findings.find((f) => f.span === SPAN_A)!.id;
    const r = await d.autoRounds(third.id, { cfg: { ...loadDraftConfig().config, repair: { ...loadDraftConfig().config.repair, stop_score: 7 } } });
    expect(r.rounds[0].accepted).toBe(0);
    expect(r.stopped).toBe("floor");
    expect(latest(p.db, "finding", aId)).toBeNull();
    expect(d.findings(r.id).findings.find((f) => f.id === aId)).toMatchObject({ decision: "open", relitigates: { round: 1 } });
  });

  test("the ledger is extracted once for the chain and every later round is checked against it", async () => {
    // a second extraction would return a different ledger; the pinned one must win
    let extracts = 0;
    const script = draftScript({
      "ledger-extract": () => { extracts++; return `<ledger>${extracts === 1 ? LEDGER : "time: a different ledger entirely"}</ledger>`; },
      "check-ledger": [...ledgerSamples(), ...ledgerSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model } = await drawn(script);
    await d.check(draw.id);
    expect(extracts).toBe(1);
    expect(model.calls.filter((c) => c.stage === "check-ledger")[0].prompt).toContain(LEDGER);

    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    expect(extracts).toBe(1);                                                  // the repair's re-check reuses the pin
    const later = model.calls.filter((c) => c.stage === "check-ledger").at(-1)!.prompt;
    expect(later).toContain(LEDGER);
    expect(later).not.toContain("a different ledger entirely");
    expect(later).toContain("amended by the findings accepted since; where an amendment and a line above disagree, the amendment holds and the line above is void:");        // the accepted fix amends it, and overrides
    expect(later).toContain("Only the assembler can fire the reliquary.");
    // and the repair itself writes against the same contract: the ending holds the span, so it is the passage rewritten
    expect(p.steps(next.id).find((s) => s.stage === "repair-ending")!.prompt).toContain(LEDGER);
    expect(p.artifacts(next.id).filter((x) => x.kind === "ledger")).toHaveLength(0);   // one ledger, on the root
  });

  test("structure and resemblance profile the premise once for the chain; a repair round runs neither", async () => {
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...ledgerSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model } = await drawn(script);
    await d.check(draw.id);
    const profiled = () => stagesOf(model, /^check-(structure|resemblance)$/).sort();
    expect(profiled()).toEqual(["check-resemblance", "check-structure"]);

    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    expect(profiled()).toEqual(["check-resemblance", "check-structure"]);      // the re-check runs neither again
    expect(p.artifacts(next.id).filter((x) => x.kind === "profile")).toHaveLength(0);
    // the same rule answers what the next check would run, which is what the page states
    const enabled = ["claims", "derivation", "ledger", "structure", "resemblance"];
    expect(checkersNext(p, draw.id, enabled)).toEqual(["derivation", "ledger"]);   // profiled already, and the draw has no setting
    expect(checkersNext(p, draw.id, ["derivation"])).toEqual(["derivation"]);

    const profiles = d.findings(next.id).profiles as any[];                    // the gate still shows both
    expect(profiles.map((x) => x.checker).sort()).toEqual(["resemblance", "structure"]);
    expect(profiles.every((x) => x.from_draw === draw.id)).toBe(true);
  });

  test("a repair rewrites without the six example passages; a first draft keeps them", async () => {
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...ledgerSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { d, draw, model } = await drawn(script);
    expect(model.calls.find((c) => c.stage === "execute")!.prompt).toContain("horror passage");

    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    await d.accept(draw.id, [a.id]);
    const rewrites = model.calls.filter((c) => c.stage === "repair-vignette" || c.stage === "repair-ending");
    expect(rewrites.length).toBeGreaterThan(0);                                // one passage is rewritten, the other copied
    for (const c of rewrites) {
      expect(c.prompt).not.toContain("horror passage");
      expect(c.prompt).toContain("Only the assembler can fire the reliquary.");
    }
  });

  test("flag at gate 1 starts nothing and keeps the gate open", async () => {
    const { p, d, draw } = await drawn();
    await d.check(draw.id);
    p.flag(draw.id, "looks wrong");
    expect(p.draw(draw.id)).toMatchObject({ status: "awaiting_check_gate", flagged: 1, flag_note: "looks wrong" });
    expect(readLog(VERDICT_LOG).filter((v) => v.kind === "brief" && v.target_id === draw.id)).toHaveLength(0);
  });
});

describe("claims", () => {
  test("claims: world runs extract then one search-enabled verify per claim on sonnet; contradicted becomes a finding", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir, claims: "world" });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("world");
    expect(stagesOf(model, /claims/)).toEqual(["check-claims-extract", "check-claims-verify", "check-claims-verify"]);
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify.every((c) => c.tools === "WebSearch,WebFetch" && c.model === loadStages()["check-claims-verify"].model)).toBe(true);
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-verify").every((s) => s.tools === "WebSearch,WebFetch")).toBe(true);
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.tools).toBe("");
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.prompt).toContain("That a place, institution, product or person exists is not a claim");
    const f = d.findings(draw.id);
    const claims = f.findings.filter((x) => x.checkers.includes("claims"));
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ n: 1, result: "contradicted", replacement: "Naples to Van is about 2,000 km." });
    expect(claims[0].evidence).toContain("https://example.org/distance");
    expect((f.claims as any[]).map((c) => c.result).sort()).toEqual(["contradicted", "supported"]);
    expect(f.judge).toBeNull();     // sonnet verified; not every judge shares the generator's family
  });

  test("claims: setting verifies against the whole distillate, every list, and asks for claims about the setting", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir, claims: "setting" });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("setting");
    expect(model.calls.find((c) => c.stage === "check-claims-extract")!.prompt).toContain("claims about the setting the story is set in");
    const verify = model.calls.filter((c) => c.stage === "check-claims-verify");
    expect(verify).toHaveLength(2);
    expect(verify.every((c) => c.tools === "")).toBe(true);
    const s = loadSetting("basin", sdir);
    for (const name of LISTS) for (const e of s.lists[name]) expect(verify[0].prompt).toContain(e);
    expect(verify[0].prompt).toContain("<setting>");
    expect(verify[0].prompt).toContain("Find the line in the setting above");
    expect(p.steps(draw.id).filter((s) => s.stage === "check-claims-verify").every((s) => s.tools === "")).toBe(true);
  });

  test("no claims key: the checker does not run", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const { d, draw, model } = await drawn(draftScript({ outline: () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir });
    const r = await d.check(draw.id);
    expect(r.claims).toBe("off");
    expect(stagesOf(model, /claims/)).toEqual([]);
  });

  test("a bad claims value fails lint", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    writeFileSync(join(sdir, "basin.md"), readFileSync(join(sdir, "basin.md"), "utf8").replace("claims: setting", "claims: everywhere"));
    const { lintFile } = await import("./settings.ts");
    expect(lintFile("basin", sdir).map((f) => f.reason)).toContain("claims must be world | setting, got everywhere");
  });
});

  test("a claim verified once is not verified again anywhere in the chain", async () => {
    const { dir } = fixture();
    const sdir = settingsFixture(dir);
    const script = draftScript({
      outline: () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n"),
      "repair-outline": () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Repaired ${n} body.</section>`).join("\n"),
      "check-ledger": [...ledgerSamples(), ...cleanSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model } = await drawn(script, { id: "basin", dir: sdir, claims: "world" });
    await d.check(draw.id);
    const first = model.calls.filter((c) => c.stage === "check-claims-verify").length;
    expect(first).toBe(2);

    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    // the repair's re-check extracts the same two claims and verifies neither again
    expect(model.calls.filter((c) => c.stage === "check-claims-extract")).toHaveLength(2);
    expect(model.calls.filter((c) => c.stage === "check-claims-verify")).toHaveLength(first);
    // the pane and the export still see the whole set, marked with where each verdict came from
    const claims = p.artifacts(next.id).filter((x) => x.kind === "claim");
    expect(claims).toHaveLength(2);
    expect(claims.map((x) => x.meta.cached_from)).toEqual([draw.id, draw.id]);
    expect(d.findings(next.id).claims).toHaveLength(2);
  });

describe("draft: schedule, scenes, screens, gate 2", () => {
  test("sequential draft: schedule shape, scenes carry the text so far, screens per scene, slop, flags, status", async () => {
    const { p, d, draw, model, dir } = await drawn();
    await d.check(draw.id);
    // overrides re-resolve from the defaults, so the fixture's three screen samples are restated here
    const out = await d.draft(draw.id, { overrides: { "form.tense": "past", "screens.samples": 3, "screens.keep_if": 2 } });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(JSON.parse(out.draft_config!).config.form.tense).toBe("past");
    expect(JSON.parse(out.draft_config!).overridden).toEqual(["form.tense", "screens.samples", "screens.keep_if"]);
    // schedule
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("beats: between 5 and 10, each between 400 and 800 words, caps summing to about 5000");
    expect(sched.prompt).toContain("tense: past");
    expect(sched.prompt).toContain("form: derive person, chronology, container from the brief and state them");
    expect(sched.prompt).toContain("ending: the brief's ending is the last beat, in place");
    const sa = p.artifacts(draw.id).find((a) => a.kind === "schedule")!;
    expect(sa.meta.beats).toHaveLength(8);
    expect(sa.meta.form).toEqual({ tense: "past", person: "third", chronology: "linear", container: "prose" });
    expect(sa.meta.beats[0].withheld).toEqual([{ item: "the instrument's wording", until: 7 }, { item: "why she answers only Lauro", until: 6 }]);
    // scenes, in sequence, each carrying the text so far and its beat's material
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    expect(scenes[0].prompt).not.toContain("<story-so-far>");
    expect(scenes[1].prompt).toContain("<story-so-far>\nScene 1 opens.");
    expect(scenes[7].prompt).toContain("Scene 7 opens.");
    expect(scenes[0].prompt.indexOf("horror passage")).toBeLessThan(scenes[0].prompt.indexOf("<outline>"));
    expect(scenes[0].prompt).toContain("<ledger>\ntime: the fire was on the 3rd");
    expect(scenes[0].prompt).toContain("Under 625 words");
    expect(scenes[0].prompt).toContain("Form: tense past; person third; chronology linear; container prose");
    expect(scenes[0].prompt).toContain("Still withheld after it: the instrument's wording (beat 7); why she answers only Lauro (beat 6)");
    expect(scenes[2].prompt).toContain("<material>\nw2_0");                  // beat 3 absorbs the chosen vignette
    expect(scenes[7].prompt).toContain(`<material>\n${SPAN_A}`);             // beat 8 absorbs the ending
    expect(scenes[1].prompt).not.toContain("<material>");
    expect(scenes.every((c) => !/theme/i.test(c.prompt.slice(c.prompt.indexOf("Write beat"))))).toBe(true);   // nothing about theme in the ask
    const sceneArts = p.artifacts(draw.id).filter((a) => a.kind === "scene").map((a) => a.meta);
    expect(sceneArts.find((m) => m.beat === 2)!.warnings).toEqual(["over_cap"]);
    expect(sceneArts.find((m) => m.beat === 1)!.warnings).toEqual([]);
    // screens: ledger ×3 and structure ×1 per scene, slop once
    expect(stagesOf(model, /^screen-ledger$/)).toHaveLength(24);
    expect(stagesOf(model, /^screen-structure$/)).toHaveLength(8);
    const st5 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="5">/.test(c.prompt))!;
    expect(st5.prompt).toContain("withheld after this beat: the instrument's wording — beat 7\nwhy she answers only Lauro — beat 6");   // until 6 > 5: still withheld after beat 5
    const st6 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="6">/.test(c.prompt))!;
    expect(st6.prompt).toContain("withheld after this beat: the instrument's wording — beat 7");
    expect(st6.prompt).not.toContain("Lauro");                               // until 6 is not > 6: beat 6's own reveal is not a leak
    const st7 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="7">/.test(c.prompt))!;
    expect(st7.prompt).toContain("withheld after this beat: none");           // the instrument's wording is revealed in beat 7
    expect(st5.prompt).toContain("resolved: the scene settles a question");
    const st8 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="8">/.test(c.prompt))!;
    expect(st8.prompt).toContain("resolves-everything:");
    expect(st8.prompt).not.toContain("resolved:");
    expect(st5.prompt).toContain("Implication and foreshadowing are not reveals");
    const sl2 = model.calls.find((c) => c.stage === "screen-ledger" && /<scene n="2">/.test(c.prompt))!;
    expect(sl2.prompt).toContain("<previous-scene>\nScene 1 opens.");
    expect(p.steps(draw.id).filter((s) => s.stage === "screen-slop").map((s) => s.model)).toEqual(["deterministic"]);
    const v = d.view(draw.id);
    expect(v.screenFindings.map((f) => [f.beat, f.screen, f.n, !!f.patch])).toEqual([[3, "ledger", 3, true], [4, "ledger", 3, false]]);
    expect(v.profiles.find((x) => x.beat === 5)!.flags).toEqual(["theme-stated"]);
    expect(v.profiles.find((x) => x.beat === 4)!.flags).toEqual([]);
    expect(v.slop!.words).toBeGreaterThan(2000);
    expect(v.slop!.paragraphs).toHaveLength(8);
    const story = d.story(draw.id);
    expect(story).toContain("Scene 1 opens.");
    expect(story).toContain("* * *");
    expect(story).toContain("[screen-ledger beat 3] Scene 3 opens → The fire was on the 3rd.");
    expect(story).toContain("[screen-structure beat 5] theme-stated: quote theme-stated 5");
    expect(story.trimEnd().endsWith("checked on opus; judge and generator share a family")).toBe(true);
    // the flag-free render is the draft as a listener hears it: scenes and breaks, no screen note, no judge
    const clean = renderStory(d.view(draw.id), false);
    expect(clean).toContain("Scene 1 opens.");
    expect(clean).toContain("* * *");
    expect(clean).not.toContain("[screen-");
    expect(clean).not.toContain("judge and generator share a family");
    expect(existsSync(join(dir, "drafts", draw.id))).toBe(false);          // nothing exported before keep
  });

  test("the narrated profile: the schedule is asked for the told shape, every scene carries the register, the last beat is asked what it paid, and a beat that names no body is rewritten once", async () => {
    const toldForm = "tense: past\nperson: first\nchronology: linear\ncontainer: told";
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: toldForm, cap: 875 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "narrated", overrides: { "screens.samples": 3, "screens.keep_if": 2, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("told afterward, by its narrator, to a listener");
    expect(sched.prompt).toContain("<set_piece>");
    expect(sched.prompt).toContain("container: told");
    expect(sched.prompt).toContain("target length: 7000 words");
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.every((c) => c.prompt.includes("<register>"))).toBe(true);
    // eight beats, and beat 2 again: the fixture names no body in beat 2, and the told template pays for its register
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2"]);
    expect(scenes[8].prompt).toContain("the narrator says what the body did before saying what it meant");
    // the fixture marks no beat, so the shaped default holds: the beat before the last is asked whether a presence arrived and a cost was paid
    const st7 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="7">/.test(c.prompt))!;
    expect(st7.prompt).toContain("presence-arrives:");
    expect(st7.prompt).toContain("resolved:");
    const st8 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="8">/.test(c.prompt))!;
    expect(st8.prompt).not.toContain("presence-arrives:");
    expect(st8.prompt).toContain("resolves-everything:");
    const st4 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="4">/.test(c.prompt))!;
    expect(st4.prompt).not.toContain("presence-arrives:");
    const v = d.view(draw.id);
    expect(v.profiles.find((x) => x.beat === 7)!.answers["cost-paid"]).toBeDefined();
    expect(v.profiles.find((x) => x.beat === 8)!.answers["cost-paid"]).toBeUndefined();
    expect(v.listen).not.toBeNull();
    expect(v.listen!.beats).toHaveLength(8);
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");
    expect(JSON.parse(p.draw(draw.id).draft_config!).config.structure.template).toBe("told");
  });

  test("the signal profile asks for the mission shape, carries its register into every scene, and pays for it", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("follows one specialist, close");
    expect(sched.prompt).toContain("person: third");
    expect(sched.prompt).toContain("container: prose");
    expect(sched.prompt).toContain("target length: 10000 words");
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.every((c) => c.prompt.includes("Name the feeling as it is felt"))).toBe(true);
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2"]);
    expect(JSON.parse(p.draw(draw.id).draft_config!).config.structure.template).toBe("signal");
  });

  test("the listen profile states the requirements, fixes no form axis, and pays for its register", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ cap: 1100 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("Derive the shape from the brief");
    expect(sched.prompt).toContain("form: derive tense, person, chronology, container");
    expect(sched.prompt).not.toContain("<register>");
    // the listen profile fixes the signal register whatever container the schedule derives; the body rewrite of beat 2 still runs
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.every((c) => c.prompt.includes("Name the feeling as it is felt"))).toBe(true);
    expect(scenes.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "2"]);
    expect(JSON.parse(p.draw(draw.id).draft_config!).config.structure.template).toBe("listen");
  });

  test("a schedule that marks a beat <pays> moves the arrival screen to that beat", async () => {
    const withPays = schedule({ cap: 1100 }).replace(/(<beat n="5"[^>]*>)/, "$1<pays>yes</pays>");
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => withPays }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const st5 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="5">/.test(c.prompt))!;
    expect(st5.prompt).toContain("presence-arrives:");
    const st7 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="7">/.test(c.prompt))!;
    expect(st7.prompt).not.toContain("presence-arrives:");
    expect(d.view(draw.id).profiles.find((x) => x.beat === 5)!.answers["cost-paid"]).toBeDefined();
  });

  test("a beat over the long-sentence ceiling and a paying beat that pays off the page are each rewritten once", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    // the fixture writes every scene as one long sentence, so at the default ceiling every beat is over it
    const { p, d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8 } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    expect(rewrites.length).toBe(8);
    expect(rewrites.every((c) => c.prompt.includes("no sentence over thirty words"))).toBe(true);
    // beat 2 names no body: its rewrite carries the body line as well, once
    const two = rewrites.find((c) => /Write beat 2 /.test(c.prompt))!;
    expect(two.prompt).toContain("says what the body did before saying what it meant");
    expect(two.prompt.split("no sentence over thirty words").length).toBe(2);
  });

  test("a paying beat where the thing only stands behind glass is rewritten once, and the thing acts", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    const withPays = schedule({ form: signalForm, cap: 1100 }).replace(/(<beat n="5"[^>]*>)/, "$1<pays>yes</pays>");
    // on the paying beat the screen finds the thing present but not acting; a rewrite fixes it, and the screen then passes it
    const seen = new Set<string>();
    const glass = (prompt: string) => {
      const n = Number(/<scene n="(\d+)">/.exec(prompt)?.[1] ?? 0);
      const out = screenStructure(prompt);
      if (n !== 5 || seen.has("5")) return out;
      seen.add("5");
      return out.replace(/(<question name="presence-in-room"><answer>)present/, "$1absent");
    };
    const { d, draw, model } = await drawn(draftScript({ schedule: () => withPays, "screen-structure": glass }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    // beat 2 for the body, beat 5 for the presence; nothing else
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2", "5"]);
    const five = rewrites.find((c) => /Write beat 5 /.test(c.prompt))!;
    expect(five.prompt).toContain("it touches, moves, breaks or takes a person or a thing");
    expect(five.prompt).toContain("does not stand behind glass");
    // the screen asks for the harder bar, and the schedule asks the thing back for a second beat
    const st5 = model.calls.find((c) => c.stage === "screen-structure" && /<scene n="5">/.test(c.prompt))!;
    expect(st5.prompt).toContain("nothing between them: not glass, a screen, a channel");
    expect(st5.prompt).toContain("A thing that is seen, stands, or gestures and does nothing more is absent");
  });

  test("the listen schedule asks the thing back for a second beat, and every shape asks it to do harm", async () => {
    const { d, draw, model } = await drawn(draftScript({ schedule: () => schedule({ cap: 1100 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "listen", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const sched = model.calls.find((c) => c.stage === "schedule")!;
    expect(sched.prompt).toContain("does harm to that person or that place, and does not explain itself");
    expect(sched.prompt).toContain("in at least one more beat, before or after that one");
    expect(sched.prompt).not.toContain("does not answer");
  });

  test("a beat over the numeral ceiling is rewritten once, and a beat under it is not", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    // beat 3 carries 30 figures in 300 words; every other beat carries the one in "Scene N opens."
    const heavy = (prompt: string) => {
      const n = Number(/Write beat (\d+) of the story/.exec(prompt)?.[1] ?? 0);
      const rewrite = /<constraints>/.test(prompt) ? " REWRITTEN" : "";
      const figures = n === 3 ? Array.from({ length: 30 }, (_, i) => `${1000 + i}`) : [];
      const filler = Array.from({ length: 297 - figures.length }, (_, i) => `s${n}w${i}`);
      return `<scene>Scene ${n} opens.${rewrite} ${[...figures, ...filler].join(" ")}</scene>`;
    };
    const { d, draw, model } = await drawn(draftScript({ scene: heavy, schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8, "screens.listen.long_share_max": 1 } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    // beat 2 names no body and is rewritten for that; beat 3 is rewritten for its figures alone
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2", "3"]);
    const three = rewrites.find((c) => /Write beat 3 /.test(c.prompt))!;
    expect(three.prompt).toContain("A listener cannot hold a figure");
    expect(three.prompt).not.toContain("no sentence over thirty words");
    const two = rewrites.find((c) => /Write beat 2 /.test(c.prompt))!;
    expect(two.prompt).not.toContain("A listener cannot hold a figure");
  });

  test("the rewrite plan is a function of the profiles, the scenes and the ceilings", () => {
    const cfg = loadDraftConfig("signal").config;
    const figures = Array.from({ length: 30 }, (_, i) => `${1000 + i}.`).join(" ");
    const short = Array.from({ length: 30 }, () => "one two three four five six seven eight nine.").join(" ");
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + ".";
    const plan = rewritePlan(
      [{ beat: 2, flags: ["bodily-emotion"] }, { beat: 5, flags: ["theme-stated"] }, { beat: 7, flags: ["presence-in-room", "cost-in-scene", "presence-arrives"] }],
      [{ beat: 2, text: short }, { beat: 3, text: `${figures} ${short}` }, { beat: 4, text: long }, { beat: 5, text: short }, { beat: 7, text: short }],
      cfg);
    expect([...plan]).toEqual([[2, [BODY_LINE]], [7, [PRESENCE_LINE, COST_LINE]], [3, [NUMERAL_LINE]], [4, [LENGTH_LINE]]]);
    expect(rewritePlan([], [{ beat: 4, text: long }], { ...cfg, screens: { ...cfg.screens, listen: { long_share_max: 1 } } }).size).toBe(0);
  });

  test("a rewrite that breaks another ceiling gets one more rewrite; a beat flagged again for the same line waits", async () => {
    const signalForm = "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
    // every beat is short sentences; beat 3 carries 30 figures, and its numeral rewrite comes back as one long sentence
    const shortLines = (n: number, k: number) => Array.from({ length: k }, (_, i) => `s${n} w${i} a b c d e f g.`).join(" ");
    const scene = (prompt: string) => {
      const n = Number(/Write beat (\d+) of the story/.exec(prompt)?.[1] ?? 0);
      const rewrite = /<constraints>/.test(prompt);
      if (n === 3 && rewrite && /cannot hold a figure/.test(prompt) && !/thirty words/.test(prompt)) return `<scene>Scene 3 opens. REWRITTEN ${Array.from({ length: 300 }, (_, i) => `s3w${i}`).join(" ")}</scene>`;
      const figures = n === 3 && !rewrite ? Array.from({ length: 30 }, (_, i) => `${1000 + i}.`).join(" ") + " " : "";
      return `<scene>Scene ${n} opens.${rewrite ? " REWRITTEN" : ""} ${figures}${shortLines(n, 30)}</scene>`;
    };
    const { d, draw, model } = await drawn(draftScript({ scene, schedule: () => schedule({ form: signalForm, cap: 1100 }) }));
    await d.check(draw.id);
    await d.draft(draw.id, { profile: "signal", overrides: { "beats.min": 8 } });
    const rewrites = model.calls.filter((c) => c.stage === "scene" && c.prompt.includes("<constraints>"));
    // round one: beat 2 for the body, beat 3 for its figures; round two: beat 3 again, now for its length. Beat 2 still names no body and is not sent back
    expect(rewrites.map((c) => /Write beat (\d+)/.exec(c.prompt)![1])).toEqual(["2", "3", "3"]);
    expect(rewrites[1].prompt).toContain("A listener cannot hold a figure");
    expect(rewrites[1].prompt).not.toContain("no sentence over thirty words");
    expect(rewrites[2].prompt).toContain("no sentence over thirty words");
    expect(rewrites[2].prompt).not.toContain("A listener cannot hold a figure");
    expect(d.view(draw.id).scenes[2].text).toContain("REWRITTEN s3 w0 a b c d e f g.");
  });

  test("the outline has four sections and the ending is derived from three of them", async () => {
    const { model } = await drawn();
    const outline = model.calls.find((c) => c.stage === "outline")!;
    expect(outline.prompt).toContain('<section name="arrival">');
    expect(model.calls.find((c) => c.stage === "ending")!.prompt).toContain("derived from the particulars, knowledge and arrival sections");
  });

  test("parallel order carries no text so far; a bad schedule fails shape and retries; fixed form is checked; template mode refused", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ schedule: [schedule({ absorbsTwice: true }), schedule()] }));
    await d.check(draw.id);
    await expect(d.draft(draw.id, { overrides: { "structure.template": "frame" } })).rejects.toThrow(/structure.template must be auto, listen, told or signal, got frame/);
    expect(p.draw(draw.id).status).toBe("awaiting_check_gate");
    const out = await d.draft(draw.id, { overrides: { "scenes.order": "parallel" } });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.steps(draw.id).filter((s) => s.stage === "schedule").map((s) => [s.status, s.fail_reason])).toEqual([["failed", "shape"], ["done", null]]);
    expect(p.steps(draw.id).find((s) => s.stage === "schedule" && s.status === "failed")!.error).toMatch(/chosen absorbed by beats 3 and 4/);
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes).toHaveLength(8);
    expect(scenes.every((c) => !c.prompt.includes("<story-so-far>"))).toBe(true);
    expect(d.view(draw.id).scenes.map((s) => s.beat)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("a withheld item with no reveal beat is never revealed: it stays withheld past the last beat, and the screens say so", () => {
    const cfg = loadDraftConfig().config;
    const text = `<form>tense: past\nperson: first\nchronology: linear\ncontainer: prose</form>` + Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      const withheld = n === 1 ? "whether the reductions have a floor — beat 7 (unresolved until then)\nwhat brought them across —\nwho sent the second pass — never\nthe name on the band" : "none";
      return `<beat n="${n}" words="625"><job>Beat ${n}.</job><known>Thing ${n}.</known><withheld>${withheld}</withheld><stakes>x</stakes><absorbs>none</absorbs></beat>`;
    }).join("");
    const s = parseSchedule(text, cfg);
    expect(s.beats[0].withheld).toEqual([
      { item: "whether the reductions have a floor", until: 7 },
      { item: "what brought them across", until: 9 },
      { item: "who sent the second pass", until: 9 },
      { item: "the name on the band", until: 9 },
    ]);
    expect(structurePrompt(s.beats[0], "scene", false, 8)).toContain("what brought them across — never revealed");
    expect(structurePrompt(s.beats[0], "scene", false, 8)).toContain("whether the reductions have a floor — beat 7");
    expect(() => parseSchedule(text.replace("the name on the band", " — "), cfg)).toThrow(/withheld line without an item/);
  });

  test("a schedule contradicting a fixed axis, or outside the beat bounds, fails shape", async () => {
    const { d, draw, p } = await drawn(draftScript({ schedule: [schedule(), schedule()] }));
    await expect(d.draft(draw.id, { overrides: { "form.tense": "present" } })).rejects.toThrow(/schedule failed: shape/);
    expect(p.steps(draw.id).filter((s) => s.stage === "schedule")[0].error).toMatch(/tense is fixed to present, schedule said past/);
    expect(p.draw(draw.id)).toMatchObject({ status: "done", error: expect.stringMatching(/^schedule failed: shape/) });   // back to the brief it was drafting
    const { d: d2, draw: draw2, p: p2 } = await drawn(draftScript({ schedule: [schedule({ beats: 3, cap: 800 }), schedule({ beats: 3, cap: 800 })] }));
    await expect(d2.draft(draw2.id)).rejects.toThrow(/shape/);
    expect(p2.steps(draw2.id).filter((s) => s.stage === "schedule")[0].error).toMatch(/3 beats; config asks 5\.\.10/);
    const { d: d3, draw: draw3 } = await drawn(draftScript({ schedule: () => schedule({ beats: 3, cap: 500 }) }));
    const out = await d3.draft(draw3.id, { profile: "flash" });
    expect(out.status).toBe("awaiting_draft_gate");
    expect(JSON.parse(out.draft_config!).profile).toBe("flash");
  });

  test("a draft with accepted findings unrepaired is refused; a draft from done without a check extracts one ledger", async () => {
    const { p, d, draw, model } = await drawn();
    const out = await d.draft(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(stagesOf(model, /^check-|^ledger-/)).toEqual(["ledger-extract"]);   // the extract alone, no checking
    expect(p.artifacts(draw.id).filter((a) => a.kind === "ledger")).toHaveLength(1);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding" && a.meta.source === "check")).toHaveLength(0);
  });

  test("rewrite k regenerates one scene under the flag's replacement, binds k and k+1 to the ledger, re-screens both", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id);
    const before = model.calls.length;
    // beat 3's flag carried a patch and was settled as the scene was written; beat 4's needs a rewrite
    const flag = d.view(draw.id).screenFindings.find((f) => f.decision === "open")!;
    expect(flag.beat).toBe(4);
    const slopBefore = d.view(draw.id).slop!.words;
    const out = await d.rewrite(draw.id, 4, flag.id);
    expect(out.status).toBe("awaiting_draft_gate");
    // the deterministic reports are the draft as it stands, not the pre-rewrite measurement
    expect(p.steps(draw.id).filter((s) => s.stage === "screen-slop")).toHaveLength(2);
    expect(d.view(draw.id).slop!.words).toBe(slopBefore + 1);
    const after = model.calls.slice(before);
    expect(after.map((c) => c.stage).sort()).toEqual(["scene", ...Array(6).fill("screen-ledger"), "screen-structure", "screen-structure"]);
    const sc = after.find((c) => c.stage === "scene")!;
    expect(sc.prompt).toContain("<constraints>\n- 1,106 died.\n</constraints>");
    expect(sc.prompt).toContain("Every line of the constraints holds.");
    expect(sc.prompt).toContain("Write beat 4 of the story");
    expect(sc.prompt).toContain("<story-so-far>\nScene 1 opens.");
    expect(sc.prompt).toContain(SCENE_3_PATCH);                              // the story so far is the patched text
    expect(sc.prompt).not.toContain("Scene 5 opens");
    expect(new Set(after.filter((c) => /^screen/.test(c.stage)).map((c) => /<scene n="(\d+)">/.exec(c.prompt)![1]))).toEqual(new Set(["4", "5"]));
    const v = d.view(draw.id);
    expect(v.scenes[3].text).toContain("Scene 4 opens. REWRITTEN");
    expect(v.scenes).toHaveLength(8);
    expect(after.find((c) => c.stage === "screen-ledger" && /<scene n="5">/.test(c.prompt))!.prompt).toContain("REWRITTEN");   // scene 5 is screened against the new scene 4
    const rewrites = p.artifacts(draw.id).filter((a) => a.kind === "scene" && a.meta.rewrite).map((a) => a.meta);
    expect(rewrites.map((m) => [m.beat, m.rewrite_finding])).toEqual([[4, flag.id]]);   // the gate-2 record is on the scene
    expect(p.draw(draw.id).flag_note).toBe("");
    await expect(d.rewrite(draw.id, 9)).rejects.toThrow(/beat 9 is not in 1\.\.8/);
    await expect(d.rewrite(draw.id, 2, "f-nope")).rejects.toThrow(/no screen finding f-nope/);
    // rewriting the last beat re-screens it alone
    const b2 = model.calls.length;
    await d.rewrite(draw.id, 8);
    expect(model.calls.slice(b2).map((c) => c.stage).sort()).toEqual(["scene", "screen-ledger", "screen-ledger", "screen-ledger", "screen-structure"]);
  });

  test("a flag's own patch lands as the scene is written, costs no model call, and settles the flag", async () => {
    const { p, d, draw, model } = await drawn();
    await d.draft(draw.id);
    expect(model.calls.filter((c) => c.stage === "scene")).toHaveLength(8);   // no call beyond the scenes and the screens
    expect(stagesOf(model, /^screen-ledger$/)).toHaveLength(24);
    const scene3 = d.view(draw.id).scenes.find((s) => s.beat === 3)!;
    expect(scene3.text).toContain(SCENE_3_PATCH);
    expect(scene3.text).not.toContain("Scene 3 opens.");
    expect(d.story(draw.id)).toContain(SCENE_3_PATCH);
    expect(p.steps(draw.id).filter((s) => s.stage === "scene" && s.model === "patched")).toHaveLength(1);
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");
    // the patched flag is settled with a draw verdict; the one whose fix needs more than its span stays open for a rewrite
    const [f3, f4] = d.view(draw.id).screenFindings;
    expect([f3.beat, f3.decision, f3.note]).toEqual([3, "accepted", "patched as written"]);
    expect(latest(p.db, "finding", f3.id)).toMatchObject({ verdict: "keep", note: "patched as written" });
    expect([f4.beat, f4.decision, f4.patch]).toEqual([4, "open", ""]);
  });

  test("keep exports drafts/<draw>/ with story, schedule, findings, config and trail; pass records a draft verdict", async () => {
    const { p, d, draw, dir } = await drawn();
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings;
    d.dismiss(draw.id, a.id, "she can fire it");
    d.dismiss(draw.id, b.id, "deliberate seam");
    await d.draft(draw.id);
    await d.rewrite(draw.id, 4);
    const { draw: kept, dir: out } = d.keep(draw.id, "good enough");
    expect(kept.status).toBe("drafted");
    expect(out).toBe(join(dir, "drafts", draw.id));
    for (const f of ["story.md", "schedule.md", "findings.md", "config.toml", "trail.md"]) expect(existsSync(join(out, f))).toBe(true);
    const story = readFileSync(join(out, "story.md"), "utf8");
    expect(story).toContain("Scene 4 opens. REWRITTEN");
    expect(story).toContain(SCENE_3_PATCH);
    expect(story).not.toContain("[screen-");
    expect(readFileSync(join(out, "schedule.md"), "utf8")).toContain("## Beat 3 · 625 words · absorbs chosen");
    const findings = readFileSync(join(out, "findings.md"), "utf8");
    expect(findings).toContain(`**${a.id}** derivation+ledger ×3 [departure] dismissed: she can fire it`);
    expect(findings).toContain("### Beat 5\n\n- structure theme-stated: quote theme-stated 5");
    expect(findings).toContain("## Slop");
    expect(readFileSync(join(out, "config.toml"), "utf8")).toContain("[length]\nwords = 5000");
    const trail = readFileSync(join(out, "trail.md"), "utf8");
    expect(trail).toContain("a typed seed");
    expect(trail).toContain("## draft");
    expect(trail).toContain("- rewrite 4");
    expect(trail).toContain("- scene: claude-opus-5");
    expect(latest(p.db, "draft", draw.id)).toMatchObject({ verdict: "keep", note: "good enough" });
    expect(() => d.keep(draw.id)).toThrow(/is drafted, not awaiting_draft_gate/);
  });

  test("--auto: accepts findings at or above the score floor, leaves the rest open, repairs, re-checks, drafts, stops at gate 2", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples(), ...cleanSamples()] });
    const { p, d, draw, model } = await drawn(script);
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).not.toBe(draw.id);
    expect(out.repaired_from).toBe(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.draw(draw.id).status).toBe("repaired");
    // A reaches the floor; B is under it and C recurred once of three, under keep_if: both stay open for a person, undecided
    const first = d.findings(draw.id, { all: true }).findings;
    expect(first.map((f) => [f.score, f.decision, f.note])).toEqual([[10, "accepted", "auto"], [6, "open", ""], [5, "open", ""]]);
    expect(first[2].reported).toBe(false);
    expect(stagesOf(model, /^reconcile$/)).toHaveLength(0);                    // one fix: nothing to read against itself
    expect((p.db.query("SELECT DISTINCT method FROM verdicts WHERE kind = 'finding'").all() as any[]).map((v) => v.method)).toEqual(["draw"]);
    expect(stagesOf(model, /^check-ledger$/)).toHaveLength(9);                // one round of repair, then two clean passes end it
    expect(stagesOf(model, /^scene$/)).toHaveLength(8);
    expect(out.draft_config).toBeTruthy();
    expect(JSON.parse(out.draft_config!).config.length.words).toBe(5000);
  });

  test("auto stops on the floor and reports every round and the lowest-scoring one", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples(), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id);
    expect(r.stopped).toBe("floor");
    expect(r.floor).toBe(7);
    expect(r.rounds.map((x) => [x.round, x.open, x.total, x.accepted, x.passes])).toEqual([[1, 2, 16, 1, 1], [2, 0, 0, 0, 2]]);   // C is under keep_if: not open to auto; two clean passes end it
    expect(r.left_open).toBe(0);                                               // a floor stop leaves nothing to rule on
    expect(r.best.round).toBe(2);                                              // one row per brief: the second clean pass overwrote round 2's row
    expect(r.id).toBe(r.rounds[1].id);
    expect(r.id).not.toBe(draw.id);
    // the round table is stored on the brief auto stopped on, so the gate can render it
    const art = p.artifacts(r.id).find((a) => a.kind === "auto")!;
    expect(JSON.parse(art.content)).toMatchObject({ stopped: "floor", floor: 7 });
    expect(art.meta).toMatchObject({ rounds: 2, best: r.best.id });
  });

  test("auto stops as stalled when a repair leaves the same findings open on the new brief", async () => {
    // every pass reports A and B; round 1 accepts A, and round 2 raises A again as a re-opening of that fix
    const { d, draw } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...ledgerSamples(), ...ledgerSamples()], "check-derivation": [...derivationSamples(), ...derivationSamples(), ...derivationSamples()] }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 9, stop_score: 7, patience: 9, max_calls: 9999 } } });
    expect(r.stopped).toBe("stalled");
    expect(r.rounds).toHaveLength(2);
    expect(r.rounds[0].accepted).toBeGreaterThan(0);
    expect(r.rounds[1].accepted).toBe(0);                                     // the stall breaks before anything is applied
    expect(r.rounds[1].open).toBe(r.rounds[0].open);
  });

  test("auto stops on patience when the total score stops falling, and names the best round", async () => {
    // each pass reports a different defect of the same weight, so no round improves and none is a re-litigation
    // deliberately unrelated wording each round: a shared phrasing would cluster as one defect
    const WORDS = ["reliquary silk director", "clavicle Verona relic", "assembler forge tally", "director ledger hour", "silk tears cut",
      "relic bones sold", "forge iron count", "hour glass turned", "tally marks burned", "bones washed clean", "iron gate sealed", "glass eye watched"];
    let k = 0;
    const fresh = () => { const w = WORDS[k++ % WORDS.length]; return finding(w, `the ${w} does not hold`, "departure", `The ${w} holds.`); };
    const passes = Array.from({ length: 12 }, () => { const a = fresh(); return [`<ledger>${LEDGER}</ledger>${a}<examined>x</examined>`, `<ledger>${LEDGER}</ledger>${a}<examined>x</examined>`, `<ledger>${LEDGER}</ledger>${a}<examined>x</examined>`]; }).flat();
    const derivations = Array.from({ length: 12 }, () => Array.from({ length: 3 }, () => `<impossibility>One.</impossibility><examined>x</examined>`)).flat();
    const { d, draw } = await drawn(draftScript({ "check-ledger": passes, "check-derivation": derivations, execute: withWords(WORDS) }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 9, stop_score: 7, patience: 2, max_calls: 9999 } } });
    expect(r.stopped).toBe("patience");
    const totals = r.rounds.map((x) => x.total);
    expect(Math.min(...totals)).toBe(r.best.total);
    expect(totals.slice(-2)).toEqual([r.best.total, r.best.total]);            // two rounds at the floor with no fall ends it
    expect(r.rounds.length).toBeLessThan(9);                                   // patience, not the cap
    // patience breaks after the last round chose what to accept and before it was applied
    expect(r.rounds.at(-1)!.accepted).toBe(0);                                 // so the row claims no repair
    expect(r.left_open).toBeGreaterThan(0);                                    // and says what the gate still has to rule on
    expect(chainOf((d as any).p, r.id).findings(true).filter((f) => f.decision === "open" && f.score >= 7))
      .toHaveLength(r.left_open);
  });

  test("drafting a repaired draw uses the chain's pinned ledger, not its own", async () => {
    // the ledger lives on the chain root; a repaired draw has none of its own
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...cleanSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model } = await drawn(script);
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    expect(p.artifacts(next.id).filter((x) => x.kind === "ledger")).toHaveLength(0);

    await d.draft(next.id);
    const scenes = model.calls.filter((c) => c.stage === "scene");
    expect(scenes.length).toBeGreaterThan(0);
    for (const c of scenes) expect(c.prompt).toContain("time: the fire was on the 3rd");
    const screens = model.calls.filter((c) => c.stage === "screen-ledger");
    for (const c of screens) expect(c.prompt).toContain("time: the fire was on the 3rd");
    // the amendment travels with it
    expect(scenes[0].prompt).toContain("Only the assembler can fire the reliquary.");
  });

  test("auto stops on the call budget", async () => {
    const WORDS = ["reliquary silk director", "clavicle Verona relic", "assembler forge tally", "director ledger hour", "silk tears cut", "relic bones sold"];
    let k = 0;
    const fresh = () => { const w = WORDS[k++ % WORDS.length]; return finding(w, `the ${w} does not hold`, "departure", `The ${w} holds.`); };
    const passes = Array.from({ length: 6 }, () => { const a = fresh(); return [1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${a}<examined>x</examined>`); }).flat();
    const derivations = Array.from({ length: 6 }, () => [1, 2, 3].map(() => `<impossibility>One.</impossibility><examined>x</examined>`)).flat();
    const { d, draw } = await drawn(draftScript({ "check-ledger": passes, "check-derivation": derivations, execute: withWords(WORDS) }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 9, stop_score: 7, patience: 9, max_calls: 20 } } });
    expect(r.stopped).toBe("budget");
    expect(r.calls).toBeGreaterThanOrEqual(20);
    expect(r.rounds.at(-1)!.calls).toBeGreaterThanOrEqual(20);
    expect(r.rounds.length).toBeLessThan(9);                                   // the budget, not the cap
  });

  test("auto stops on the round cap", async () => {
    const WORDS = ["reliquary silk director", "clavicle Verona relic", "assembler forge tally", "director ledger hour", "silk tears cut", "relic bones sold", "forge iron count", "hour glass turned"];
    let k = 0;
    const fresh = () => { const w = WORDS[k++ % WORDS.length]; return finding(w, `the ${w} does not hold`, "departure", `The ${w} holds.`); };
    const passes = Array.from({ length: 8 }, () => { const a = fresh(); return [1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${a}<examined>x</examined>`); }).flat();
    const derivations = Array.from({ length: 8 }, () => [1, 2, 3].map(() => `<impossibility>One.</impossibility><examined>x</examined>`)).flat();
    const { d, draw } = await drawn(draftScript({ "check-ledger": passes, "check-derivation": derivations, execute: withWords(WORDS) }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 2, stop_score: 7, patience: 9, max_calls: 9999 } } });
    expect(r.stopped).toBe("cap");
    expect(r.rounds).toHaveLength(3);                                          // rounds 1 and 2 repair, the third is where it stops
  });

  test("--auto never accepts structure or resemblance, and an evidence-less finding is left open however it scores", async () => {
    const strip = (f: string) => f.replace(/<evidence>[^<]*<\/evidence>/, "<evidence>none</evidence>");
    const noEv = strip(A());
    const script = draftScript({ "check-ledger": [...ledgerSamples(noEv, strip(B())), ...cleanSamples()], "check-derivation": [...derivationSamples(noEv), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const fs = d.findings(draw.id).findings;
    expect(fs.map((f) => f.score)).toEqual([7, 3]);                            // C recurred once: under the bar, and no longer auto's to decide
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).toBe(draw.id);                                             // nothing accepted, no repair
    // auto ruled on nothing: 7 is over the floor with no quote to read it against, so a person still has to
    expect(fs.map((f) => latest(p.db, "finding", f.id))).toEqual([null, null]);
    expect(d.findings(draw.id).findings).toHaveLength(0);                     // the second, clean pass is what the gate now shows
    expect(p.steps(draw.id).filter((s) => /^repair/.test(s.stage))).toHaveLength(0);
  });
});

describe("templates and store", () => {
  test("every check and drafting template states a word cap and passes the vocabulary rule", () => {
    const names = ["checkDerivation", "checkLedger", "checkStructure", "checkResemblance", "claimsExtract", "claimsVerifyWorld", "claimsVerifyReference", "checkVerify", "reconcile", "repairVignette", "repairEnding", "schedule", "sceneAsk", "screenLedger", "screenStructure"] as const;
    for (const n of names) {
      const t = (TEMPLATES as any)[n] as string;
      expect(t).toMatch(/Under \{?\w*\}? ?words|Under \d+ words|Under \{cap\} words/);
      expect(t).not.toMatch(/\b(reason|think)\b/i);
    }
  });

  test("every new stage names a model, and only the claims verifier declares tools", () => {
    const s = loadStages();
    const withTools = Object.entries(s).filter(([, c]) => c.tools).map(([n]) => n);
    expect(withTools).toEqual(["check-claims-verify"]);
    expect(s["check-claims-verify"].tools).toBe("WebSearch,WebFetch");
    for (const n of ["check-derivation", "check-ledger", "check-structure", "check-resemblance", "repair-vignette", "repair-outline", "repair-ending", "schedule", "scene", "screen-ledger", "screen-structure"]) expect((s as any)[n].model).toMatch(/^claude-/);
  });
});

describe("finding ids are scoped by draw", () => {
  test("two draws with the same span do not share verdicts; a repaired draw's re-check does not inherit its source's accepted findings", async () => {
    const { p, d, draw } = await drawn(draftScript({ "check-ledger": [...ledgerSamples(), ...ledgerSamples()], "check-derivation": [...derivationSamples(), ...derivationSamples()] }));
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings;
    const next = await d.accept(draw.id, [a.id]);
    // the repaired draw's re-check reports the same span again (same fixture); it must be open there, not accepted
    const again = d.findings(next.id).findings;
    expect(again.length).toBeGreaterThan(0);
    expect(again[0].span).toBe(a.span);
    expect(again[0].id).not.toBe(a.id);
    expect(again.every((f) => f.decision === "open")).toBe(true);
    const out = await d.draft(next.id);                                   // not "accepted findings pending repair"
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.draw(draw.id).status).toBe("repaired");
  });
});

describe("a check pass scores against its own sample count", () => {
  test("a re-check at fewer samples reads a finding in every sample as that many, not an average over passes", async () => {
    const script = draftScript();
    script["check-ledger"].push(...[1, 2].map(() => `<ledger>${LEDGER}</ledger>${A()}<examined>x</examined>`));
    script["check-derivation"].push(...[1, 2].map(() => `<impossibility>One.</impossibility>${A()}<examined>x</examined>`));
    const { d, draw } = await drawn(script);
    await d.check(draw.id, { samples: 3 });
    const a3 = d.findings(draw.id).findings.find((f) => f.span === SPAN_A)!;
    expect([a3.n, a3.samples_run]).toEqual([3, 3]);
    await d.check(draw.id, { samples: 2 });
    const a2 = d.findings(draw.id).findings.find((f) => f.span === SPAN_A)!;
    expect([a2.n, a2.samples_run, a2.score]).toEqual([2, 2, a3.score]);         // 2 of 2 recurs as fully as 3 of 3
  });
});

describe("auto acts on reported findings only, and reads its accepted set against itself", () => {
  test("one clean pass with the budget spent stops on budget, not on the floor", async () => {
    const script = draftScript({
      "check-ledger": [1, 2].flatMap(() => [`<ledger>${LEDGER}</ledger><examined>x</examined>`, `<ledger>${LEDGER}</ledger><examined>x</examined>`]),
      "check-derivation": Array.from({ length: 4 }, () => `<impossibility>One.</impossibility><examined>x</examined>`),
    });
    const { db, d, draw, model } = await drawn(script);
    const cfg = loadDraftConfig(undefined, { "checks.samples": 2 });
    db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(JSON.stringify(cfg), draw.id);
    await d.check(draw.id);
    const checks = stagesOf(model, /^check-/).length;
    const r = await d.autoRounds(draw.id, { cfg: { ...cfg.config, repair: { ...cfg.config.repair, max_calls: 1 } } });
    expect([r.stopped, r.rounds.length, r.left_open]).toEqual(["budget", 1, 0]);
    expect(stagesOf(model, /^check-/)).toHaveLength(checks);                  // no second pass was paid for
  });

  test("a lone finding over the floor is left open, neither accepted nor dismissed", async () => {
    // two samples: A in one of them scores 2 + 3 + 2 = 7, over the floor, but under keep_if
    const script = draftScript({
      "check-ledger": [1, 2].flatMap(() => [`<ledger>${LEDGER}</ledger>${A()}<examined>x</examined>`, `<ledger>${LEDGER}</ledger><examined>x</examined>`]),
      "check-derivation": Array.from({ length: 4 }, () => `<impossibility>One.</impossibility><examined>x</examined>`),
    });
    const { db, p, d, draw } = await drawn(script);
    db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(JSON.stringify(loadDraftConfig(undefined, { "checks.samples": 2 })), draw.id);
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id);
    expect(r.stopped).toBe("floor");
    expect(r.rounds.map((x) => [x.round, x.open, x.total, x.accepted, x.passes])).toEqual([[1, 0, 0, 0, 2]]);   // two clean passes, one brief, one row
    expect(r.left_open).toBe(0);
    expect(p.steps(draw.id).filter((s) => /^repair/.test(s.stage))).toHaveLength(0);
    const [a] = d.findings(draw.id, { all: true }).findings;
    expect([a.span, a.score, a.reported, a.decision, a.note]).toEqual([SPAN_A, 8, false, "open", ""]);
  });

  test("of two accepted fixes that cannot both hold, the lower-scoring one is dismissed before the repair", async () => {
    let status = () => "";
    const during: string[] = [];
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...cleanSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples()],
      reconcile: () => { during.push(status()); return "<conflicts><conflict><a>1</a><b>2</b><why>one relic cannot be fired by two rules</why></conflict></conflicts>"; },
    });
    script["check-ledger"].push(...cleanSamples()); script["check-derivation"].push(...cleanSamples());
    const { p, d, draw, model } = await drawn(script);
    status = () => p.draw(draw.id).status;
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings;
    expect([a.score, b.score]).toEqual([10, 6]);
    const r = await d.autoRounds(draw.id, { cfg: floor6() });                  // both at or over this floor
    expect(r.stopped).toBe("floor");
    expect(r.rounds[0].accepted).toBe(1);                                      // the row counts what was applied
    expect(stagesOf(model, /^reconcile$/)).toHaveLength(1);
    expect(during).toEqual(["repairing"]);                                     // the gate is closed while the call runs
    const after = d.findings(draw.id, { all: true }).findings;
    expect(after.find((f) => f.id === a.id)!.decision).toBe("accepted");
    expect(after.find((f) => f.id === b.id)).toMatchObject({ decision: "dismissed", note: `auto: conflicts with ${a.id}` });
    const prompt = p.steps(r.id).find((s) => s.stage === "repair-ending")!.prompt;   // A's span is in the ending
    expect(prompt).toContain("Only the assembler can fire the reliquary.");
    expect(prompt).not.toContain("The twelfth relic is the Verona clavicle in every account.");
  });
});

describe("the verify pass", () => {
  test("a verdict drops only on the word drop; any other answer keeps, and a missing answer is a shape failure", () => {
    const v = (a: string) => parseVerdicts(`<verdict n="1"><answer>${a}</answer><why>w</why></verdict>`, 1)[0].answer;
    expect([v("keep"), v("Keep."), v("drop (loose wording)"), v("Drop"), v("underived"), v("Placeholder")]).toEqual(["keep", "keep", "drop", "drop", "keep", "keep"]);
    expect(() => parseVerdicts(`<verdict n="1"><why>w</why></verdict>`, 1)).toThrow(/no <answer>/);
    expect(() => parseVerdicts(`<verdict n="2"><answer>keep</answer></verdict>`, 2)).toThrow(/missing <verdict n="1">/);
  });

  test("a reported finding the verify pass drops goes under the bar with the reason, and the gate does not see it", async () => {
    const script = draftScript({
      // A and B are reported, C is under the bar; each of two readings reads all three, and one drop is enough
      "check-verify": [
        `<verdict n="1"><answer>keep</answer><why>holds</why></verdict><verdict n="2"><answer>drop</answer><why>the span does not name the relic</why></verdict><verdict n="3"><answer>keep</answer><why>holds</why></verdict>`,
        `<verdict n="1"><answer>keep</answer><why>holds</why></verdict><verdict n="2"><answer>keep</answer><why>holds</why></verdict><verdict n="3"><answer>drop</answer><why>the silk is never wet</why></verdict>`,
      ],
    });
    const { d, draw, model } = await drawn(script);
    const r = await d.check(draw.id);
    expect(r.findings.map((f) => f.span)).toEqual([SPAN_A]);                  // B is dropped from the result
    expect(d.findings(draw.id).findings.filter((f) => f.reported).map((f) => f.span)).toEqual([SPAN_A]);
    const all = d.findings(draw.id, { all: true }).findings;
    const b = all.find((f) => f.span === SPAN_B)!;
    expect([b.reported, (b as any).dropped]).toEqual([false, "the span does not name the relic"]);
    expect((all.find((f) => f.span === SPAN_C) as any).dropped).toBe("the silk is never wet");   // under the bar and dropped: the reason is kept
    expect(model.calls.find((c) => c.stage === "check-verify")!.prompt).toContain(`3. span: "${SPAN_C}"`);
    expect(model.calls.filter((c) => c.stage === "check-verify")).toHaveLength(2);   // two readings of one pass
    expect(model.calls.find((c) => c.stage === "check-verify")!.prompt).toContain(`1. span: "${SPAN_A}"`);
    expect(model.calls.find((c) => c.stage === "check-verify")!.prompt).toContain(`2. span: "${SPAN_B}"`);
  });

  test("the gate's list withholds a dropped finding until it is asked for, and says how many left the list", async () => {
    // the same pass as above: A holds, B is dropped, C is under the bar and dropped
    const script = draftScript({
      "check-verify": [
        `<verdict n="1"><answer>keep</answer><why>holds</why></verdict><verdict n="2"><answer>drop</answer><why>the span does not name the relic</why></verdict><verdict n="3"><answer>keep</answer><why>holds</why></verdict>`,
        `<verdict n="1"><answer>keep</answer><why>holds</why></verdict><verdict n="2"><answer>keep</answer><why>holds</why></verdict><verdict n="3"><answer>drop</answer><why>the silk is never wet</why></verdict>`,
      ],
    });
    const { d, draw } = await drawn(script);
    await d.check(draw.id);

    const gate = d.findings(draw.id);
    expect(gate.findings.map((f) => f.span)).toEqual([SPAN_A]);              // a dropped finding is not the gate's work
    expect(gate.off_list).toEqual({ dropped: 2, rare: null });               // the view says how many left the list, and why

    const all = d.findings(draw.id, { all: true });
    expect(all.findings.some((f) => f.span === SPAN_B)).toBe(true);          // asked for, it comes back
    expect(all.off_list.dropped).toBe(2);
    expect(all.off_list.rare).not.toBeNull();                               // the rare ones can only be counted here

    // ruled on, it is the gate's business again: it stays in the list and leaves the count
    const b = all.findings.find((f) => f.span === SPAN_B)!;
    d.dismiss(draw.id, b.id, "read it and disagreed", "draw");
    const after = d.findings(draw.id);
    expect(after.findings.find((f) => f.span === SPAN_B)).toMatchObject({ decision: "dismissed" });
    expect(after.off_list.dropped).toBe(1);
  });

  test("auto does not accept a dropped finding, whatever it scores", async () => {
    // A scores 10 and is dropped; B scores 6 and is kept, so the round accepts B alone
    const script = draftScript({
      "check-ledger": [...ledgerSamples(), ...cleanSamples(), ...cleanSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples(), ...cleanSamples()],
      "check-verify": [
        `<verdict n="1"><answer>drop</answer><why>the span is a figure of speech</why></verdict><verdict n="2"><answer>keep</answer><why>holds</why></verdict><verdict n="3"><answer>keep</answer><why>holds</why></verdict>`,
        `<verdict n="1"><answer>keep</answer><why>holds</why></verdict><verdict n="2"><answer>keep</answer><why>holds</why></verdict><verdict n="3"><answer>keep</answer><why>holds</why></verdict>`,
      ],
    });
    const { d, draw, model } = await drawn(script);
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: floor6() });
    expect(r.rounds[0].accepted).toBe(1);
    const first = d.findings(draw.id, { all: true }).findings;
    expect(first.find((f) => f.span === SPAN_A)).toMatchObject({ decision: "open", reported: false, score: 10 });
    expect(first.find((f) => f.span === SPAN_B)).toMatchObject({ decision: "accepted" });
    expect(stagesOf(model, /^reconcile$/)).toHaveLength(0);                  // one fix: nothing to reconcile
  });

  test("the reconcile prompt carries each fix's patch, and a conflict is read in either tag form", async () => {
    const script = draftScript({
      "check-ledger": [...ledgerSamples(A(), finding(SPAN_B, "the twelfth relic is named differently in the two vignettes", "particulars", "The twelfth relic is the Verona clavicle in every account.", undefined, undefined, "the twelfth relic, the Bruges clavicle")), ...cleanSamples(), ...cleanSamples()],
      "check-derivation": [...derivationSamples(), ...cleanSamples(), ...cleanSamples()],
      reconcile: ['<conflicts><conflict a="1" b="2"><why>one relic, two names</why></conflict></conflicts>'],
    });
    const { d, draw, model } = await drawn(script);
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: floor6() });
    expect(r.rounds[0].accepted).toBe(1);
    const prompt = model.calls.find((c) => c.stage === "reconcile")!.prompt;
    expect(prompt).toContain("2. The twelfth relic is the Verona clavicle in every account.\n   patch: \"the twelfth relic, the Bruges clavicle\"");
    expect(prompt).not.toContain("1. Only the assembler can fire the reliquary.\n   patch");
    expect(parseConflicts('<conflict a="1" b="2"><why>w</why></conflict><conflict><a>3</a><b>4</b></conflict>')).toEqual([{ a: 1, b: 2, why: "w" }, { a: 3, b: 4, why: "" }]);
  });
});

describe("what a reader sees", () => {
  test("a finding whose span is only in the outline is dropped with no model call", async () => {
    const outlineOnly = finding("Section particulars body", "the outline's sum is off", "particulars", "The sum holds.", "the fire was on the 3rd");
    const script = draftScript({
      "check-ledger": [...ledgerSamples(A(), outlineOnly)],
      "check-derivation": [...derivationSamples()],
    });
    const { d, draw, model } = await drawn(script);
    const r = await d.check(draw.id);
    expect(r.findings.map((f) => f.span)).toEqual([SPAN_A]);
    const all = d.findings(draw.id, { all: true }).findings;
    expect(all.find((f) => f.span === "Section particulars body")).toMatchObject({ reported: false, dropped: NOT_IN_PROSE });
    const prompt = model.calls.find((c) => c.stage === "check-verify")!.prompt;
    expect(prompt).not.toContain("Section particulars body\"");
    expect(prompt).toContain(`1. span: "${SPAN_A}"`);
  });

  test("a passage rewrite takes only the constraints that land in it; the outline takes them all", async () => {
    // A lands in the ending, B in the chosen vignette; neither carries a patch
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings.filter((f) => f.reported);
    expect([a.span, b.span]).toEqual([SPAN_A, SPAN_B]);
    const next = await d.accept(draw.id, [a.id, b.id]);
    const prompt = (stage: string) => p.steps(next.id).find((s) => s.stage === stage)!.prompt;
    const constraints = (stage: string) => /<constraints>([\s\S]*?)<\/constraints>/.exec(prompt(stage))![1];
    expect(constraints("repair-vignette")).toContain("The twelfth relic is the Verona clavicle in every account.");
    expect(constraints("repair-vignette")).not.toContain("Only the assembler can fire the reliquary.");
    expect(constraints("repair-ending")).toContain("Only the assembler can fire the reliquary.");
    // B is particulars with no patch, so it moves the mechanism and the ending takes it too
    expect(constraints("repair-ending")).toContain("The twelfth relic is the Verona clavicle in every account.");
    // the outline carries every fix as an amendment, with no call
    const outline = p.artifacts(next.id).find((a) => a.kind === "outline")!.content;
    expect(outline).toContain("- Only the assembler can fire the reliquary.");
    expect(outline).toContain("- The twelfth relic is the Verona clavicle in every account.");
    expect(p.steps(next.id).find((s) => s.stage === "repair-outline")!.model).toBe("copied");
  });
});

describe("a repaired context vignette", () => {
  test("stays a context vignette: the next repair carries both with their jobs, and the brief lists both in job order", async () => {
    const span = "context for Test the first thing: scene one.";
    const inContext = () => finding(span, "context-1 contradicts the ledger", "none", "The first context holds.", "the fire was on the 3rd");
    const script = draftScript({
      "check-ledger": [
        ...[1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${inContext()}<examined>x</examined>`),
        ...[1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${A()}<examined>x</examined>`),
        ...cleanSamples(),
      ],
      "check-derivation": [...cleanSamples(), ...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw, model, dir } = await drawn(script);
    await d.check(draw.id);
    const second = await d.accept(draw.id, [d.findings(draw.id).findings.find((f) => f.reported)!.id]);
    expect(p.steps(second.id).filter((s) => s.stage === "repair-context")).toHaveLength(1);
    const a = d.findings(second.id).findings.find((f) => f.reported && f.span === SPAN_A)!;
    const third = await d.accept(second.id, [a.id]);

    const stages = p.steps(third.id).map((s) => [s.stage, s.model]);
    expect(stages.filter(([s]) => s === "jobs")).toEqual([["jobs", "copied"]]);
    expect(stages.filter(([s]) => s === "context" || s === "repair-context").map(([, m]) => m)).toEqual(["copied", "copied"]);
    expect(model.calls.filter((c) => c.stage === "context" || c.stage === "jobs")).toHaveLength(3);   // the draw's own jobs and two contexts, nothing since

    const parts = briefParts(p, third.id);
    expect(parts.contexts[0]).toContain("rewritten context");
    expect(parts.contexts[1]).toBe("context for Test a second thing: scene two.");
    expect(readFileSync(join(dir, "briefs", third.id, "context-1.md"), "utf8")).toContain("*Job: Test the first thing: scene one.*");
    expect(readFileSync(join(dir, "briefs", third.id, "context-1.md"), "utf8")).toContain("rewritten context");
    expect(readFileSync(join(dir, "briefs", third.id, "context-2.md"), "utf8")).toContain("context for Test a second thing: scene two.");
  });
});

describe("a fix with no patch", () => {
  test("goes to the passage holding its span and to the one holding its second quote, and to no other", async () => {
    // the span is in context-1, the second quote in the ending; "none" invalidates nothing, so only the quote can pull the ending in
    const span = "context for Test the first thing: scene one.";
    const cross = () => finding(span, "context-1 and the ending disagree", "none", "The first context and the ending agree.", "the fire was on the 3rd", "contradicts:and the count closes. The last beat.");
    const script = draftScript({
      "check-ledger": [...[1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${cross()}<examined>x</examined>`), ...cleanSamples()],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const f = d.findings(draw.id).findings.find((x) => x.reported)!;
    const next = await d.accept(draw.id, [f.id]);
    const step = (stage: string) => p.steps(next.id).find((s) => s.stage === stage)!;
    const constraints = (stage: string) => /<constraints>([\s\S]*?)<\/constraints>/.exec(step(stage).prompt)?.[1] ?? "";
    expect(step("repair-ending").model).not.toBe("copied");
    expect(constraints("repair-ending")).toContain("The first context and the ending agree.");
    expect(constraints("repair-context")).toContain("The first context and the ending agree.");
    expect(step("repair-vignette").model).toBe("copied");                      // the chosen vignette holds neither half
  });
});

describe("a patch that renames one mention", () => {
  const scene = "The Clearwater cart came at nine. Clearwater held the contract.";
  const rename = (patch: string) => finding("Clearwater held the contract.", "the contractor is named twice", "none", "Brightwell held the contract, and its cart came at nine.", "the fire was on the 3rd", undefined, patch);
  const run = async (text: string) => {
    const script = draftScript({
      execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)).replace("</vignette>", ` ${text}</vignette>`),
      "check-ledger": [...[1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${rename("Brightwell held the contract.")}<examined>x</examined>`), ...cleanSamples()],
      "check-derivation": [...cleanSamples(), ...cleanSamples()],
    });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const next = await d.accept(draw.id, [d.findings(draw.id).findings.find((f) => f.reported)!.id]);
    return p.steps(next.id).find((s) => s.stage === "repair-vignette")!;
  };

  test("is not applied when the old name stays in its passage; the passage is rewritten under the constraint", async () => {
    const step = await run(scene);
    expect(step.model).not.toBe("patched");
    expect(step.prompt).toContain("Brightwell held the contract, and its cart came at nine.");
  });

  test("is not applied when the old name stays in its passage in another case", async () => {
    const step = await run("THE CLEARWATER CART came at nine. Clearwater held the contract.");
    expect(step.model).not.toBe("patched");
  });

  test("is applied when the old name is used nowhere else in its passage", async () => {
    const step = await run("Clearwater held the contract.");
    expect(step.model).toBe("patched");
  });
});

describe("the outline a check reads", () => {
  test("is the chain root's with the accepted fixes appended, and the repaired draw carries that same text", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings.filter((f) => f.reported);
    const next = await d.accept(draw.id, [a.id]);
    // one outline: the repaired draw's part is the root's with the amendment, and the check reads that part
    const carried = p.artifacts(next.id).find((x) => x.kind === "outline")!.content;
    expect(carried).toContain("Section departure body.");
    expect(carried).not.toContain("Repaired departure body.");
    expect(carried).toBe(chainOf(p, next.id).outline());
    const prompt = p.steps(next.id).find((s) => s.stage === "check-derivation")!.prompt;
    expect(prompt).toContain(carried);
    expect(prompt).toContain("where an amendment and a line above disagree, the amendment holds and the line above is void:\n- Only the assembler can fire the reliquary.");
  });
});
