import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SCHEMA_VERSION, openDb, type Db } from "./store/db.ts";
import { FakeModel } from "./model.ts";
import { parseConflicts } from "./drafting.ts";
import { checkersNext, NOT_IN_PROSE } from "./check.ts";
import { settingsFixture } from "./settings.fixture.ts";
import { LISTS, loadSetting } from "./settings.ts";
import { latest, readLog, record } from "./verdicts.ts";
import { status } from "./status.ts";
import { TEMPLATES } from "./prompts.ts";
import { loadStages } from "./config.ts";
import { loadDraftConfig } from "./draftconfig.ts";
import { VERDICT_LOG } from "./paths.ts";
import { A, B, LEDGER, SCENE_3_PATCH, SPAN_A, SPAN_B, SPAN_C, cleanSamples, derivationSamples, draftScript, drawn, finding, fixture, ledgerSamples, schedule, vignette } from "./drafting.fixture.ts";
import { briefParts, partsIn, partsOf } from "./briefparts.ts";
import { chainOf } from "./chain.ts";

/** The default floor is 7; B, an arithmetic finding at two of three samples, sits at 6, so a test that needs two fixes at once lowers it. */
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
    expect(f.findings.map((x) => [x.checkers, x.n, x.invalidates, x.decision])).toEqual([[["derivation", "ledger"], 3, "debt audit", "open"], [["ledger"], 2, "arithmetic", "open"]]);
    expect(f.findings[0].replacement).toBe("Only the assembler can fire the reliquary.");
    expect(f.findings[1].samples).toEqual([1, 3]);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding")).toHaveLength(2);
    expect(p.artifacts(draw.id).some((a) => a.kind === "finding" && a.content.includes("tears"))).toBe(false);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "ledger")).toHaveLength(1);
    expect(p.artifacts(draw.id).filter((a) => a.kind === "profile").map((a) => JSON.parse(a.meta).checker).sort()).toEqual(["resemblance", "structure"]);
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

  test("accept repairs into a linked draw: the ending holding the span is rewritten, the vignette copied, the outline re-derived under constraints, then re-checked", async () => {
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
    expect(by("repair-outline")[0].prompt).toContain("<constraints>\n- Only the assembler can fire the reliquary.\n</constraints>");
    expect(by("repair-outline")[0].prompt).not.toContain("Reason");
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
    expect(readFileSync(join(bdir, "outline.md"), "utf8")).toContain("Repaired debt audit body.");
    const trail = readFileSync(join(bdir, "trail.md"), "utf8");
    expect(trail).toContain("# Trail (repaired)");
    expect(trail).toContain(`## repaired_from\n\n${draw.id}\n\n- Only the assembler can fire the reliquary.`);
    // the re-check ran on the new draw and found nothing
    expect(p.steps(next.id).filter((s) => s.stage === "check-ledger")).toHaveLength(3);
    expect(d.findings(next.id).findings).toEqual([]);
    expect(d.findings(next.id).judge).toBe("checked on opus; judge and generator share a family");
    await expect(d.accept(draw.id, [a.id])).rejects.toThrow(/is repaired, not awaiting_check_gate/);
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
    expect(f[0].invalidates).toBe("arithmetic");
    const next = await d.accept(draw.id, [f[0].id]);
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("repair-vignette")[0].model).not.toBe("copied");
    expect(by("repair-vignette")[0].prompt).toContain(span);
    // arithmetic invalidated: the ending is rewritten even though the span is not in it
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
    expect(sub.map((x) => [x.span, x.n, x.samples_run, x.invalidates])).toEqual([[SPAN_C, 1, 3, "custody"]]);
    expect(all.map((x) => x.score)).toEqual([10, 6, 5]);                        // sorted; B is arithmetic at 2 of 3, so it is under the floor
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
    expect(p.steps(next.id).find((s) => s.stage === "repair-outline")!.prompt).toContain("The silk is dry.");
    expect(JSON.parse(p.artifacts(draw.id).find((a) => a.kind === "finding" && a.content.includes("tears"))!.meta).sub_threshold).toBe(true);
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

    // the vignette holding the span is patched, not rewritten; only the outline is re-derived
    const by = (stage: string) => p.steps(next.id).filter((s) => s.stage === stage);
    expect(by("repair-vignette").map((s) => s.model)).toEqual(["patched"]);
    expect(by("repair-ending").map((s) => s.model)).toEqual(["copied"]);
    expect(by("context").map((s) => s.model)).toEqual(["copied", "copied"]);
    expect(model.calls.slice(before).map((c) => c.stage).filter((x) => /^repair|^context$|^jobs$/.test(x))).toEqual(["repair-outline"]);

    const out = readFileSync(join(dir, "briefs", next.id, "vignette.md"), "utf8");
    expect(out).toContain(patched);
    expect(out).not.toContain(span);
    expect(JSON.parse(p.artifacts(next.id).find((a) => a.kind === "vignette" && a.step_id === next.chosen_step)!.meta).patched).toEqual([f.id]);
  });

  test("a finding inside one context vignette rewrites that one and carries the other over with its job", async () => {
    const span = "context for Test the first thing: scene one.";
    const inContext = () => finding(span, "context-1 contradicts the ledger", "custody", "The first context holds.", "a second quote from the outline");
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
    const jobs = p.artifacts(next.id).filter((a) => a.kind === "job").sort((a, b) => JSON.parse(a.meta).index - JSON.parse(b.meta).index);
    expect(jobs.map((a) => [a.content, JSON.parse(a.meta).copied])).toEqual([["Test the first thing: scene one.", true], ["Test a second thing: scene two.", true]]);
    const ctx = p.artifacts(next.id).filter((a) => a.kind === "vignette" && [...by("context"), ...by("repair-context")].some((s) => s.id === a.step_id))
      .sort((a, b) => JSON.parse(a.meta).index - JSON.parse(b.meta).index);
    expect(ctx[0].content).toContain("rewritten context");
    // the part names the step it was rewritten from, which is the context of the draw being repaired
    const srcContext1 = partsIn(partsOf(p, draw.id), "context")[0];
    expect(JSON.parse(ctx[0].meta)).toMatchObject({ index: 1, job: "Test the first thing: scene one.", rewritten_from: srcContext1.stepId });
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

    // a third repair, driven by hand, carries the round-1 fix as settled rather than as a constraint
    const third = await d.accept(next.id, [again.find((f) => f.span === SPAN_B)!.id]);
    const prompt = p.steps(third.id).find((s) => s.stage === "repair-outline")!.prompt;
    expect(prompt).toContain("<settled>\n- Only the assembler can fire the reliquary.\n</settled>");
    expect(prompt).toContain("The twelfth relic is the Verona clavicle in every account.");   // this round's constraint
    expect(readFileSync(join(dir, "briefs", third.id, "trail.md"), "utf8")).toContain("## settled in earlier rounds\n\n- round 1: Only the assembler can fire the reliquary.");

    // auto will not act on A, and says why; the floor is held at 7 so nothing else is accepted
    const aId = d.findings(third.id, { all: true }).findings.find((f) => f.span === SPAN_A)!.id;
    const r = await d.autoRounds(third.id, { cfg: { ...loadDraftConfig().config, repair: { ...loadDraftConfig().config.repair, stop_score: 7 } } });
    expect(r.rounds[0].accepted).toBe(0);
    expect(r.stopped).toBe("floor");
    expect(latest(p.db, "finding", aId)?.note).toBe("auto: re-opens the fix accepted in round 1");
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
    // and the repair itself writes against the same contract
    expect(p.steps(next.id).find((s) => s.stage === "repair-outline")!.prompt).toContain(LEDGER);
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
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir, claims: "world" });
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
    const { p, d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir, claims: "setting" });
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
    const { d, draw, model } = await drawn(draftScript({ outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n") }), { id: "basin", dir: sdir });
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
      outline: () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n"),
      "repair-outline": () => ["debt audit", "arithmetic", "custody", "matrix"].map((n) => `<section name="${n}">Repaired ${n} body.</section>`).join("\n"),
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
    expect(claims.map((x) => JSON.parse(x.meta).cached_from)).toEqual([draw.id, draw.id]);
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
    expect(JSON.parse(sa.meta).beats).toHaveLength(8);
    expect(JSON.parse(sa.meta).form).toEqual({ tense: "past", person: "third", chronology: "linear", container: "prose" });
    expect(JSON.parse(sa.meta).beats[0].withheld).toEqual([{ item: "the instrument's wording", until: 7 }, { item: "why she answers only Lauro", until: 6 }]);
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
    const sceneArts = p.artifacts(draw.id).filter((a) => a.kind === "scene").map((a) => JSON.parse(a.meta));
    expect(sceneArts.find((m) => m.beat === 2).warnings).toEqual(["over_cap"]);
    expect(sceneArts.find((m) => m.beat === 1).warnings).toEqual([]);
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
    expect(existsSync(join(dir, "drafts", draw.id))).toBe(false);          // nothing exported before keep
  });

  test("parallel order carries no text so far; a bad schedule fails shape and retries; fixed form is checked; template mode refused", async () => {
    const { p, d, draw, model } = await drawn(draftScript({ schedule: [schedule({ absorbsTwice: true }), schedule()] }));
    await d.check(draw.id);
    await expect(d.draft(draw.id, { overrides: { "structure.template": "frame" } })).rejects.toThrow(/structure mode not built: frame/);
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
    expect(p.artifacts(draw.id).filter((a) => a.kind === "finding" && JSON.parse(a.meta).source === "check")).toHaveLength(0);
  });

  test("rewrite k regenerates one scene under the flag's replacement, re-screens k and k+1 only", async () => {
    const { p, d, draw, model } = await drawn();
    await d.check(draw.id);
    await d.draft(draw.id);
    const before = model.calls.length;
    const flag = d.view(draw.id).screenFindings[0];
    expect(flag.beat).toBe(3);
    const out = await d.rewrite(draw.id, 3, flag.id);
    expect(out.status).toBe("awaiting_draft_gate");
    const after = model.calls.slice(before);
    expect(after.map((c) => c.stage).sort()).toEqual(["scene", ...Array(6).fill("screen-ledger"), "screen-structure", "screen-structure"]);
    const sc = after.find((c) => c.stage === "scene")!;
    expect(sc.prompt).toContain("<constraints>\n- The fire was on the 3rd.\n</constraints>");
    expect(sc.prompt).toContain("Every line of the constraints holds.");
    expect(sc.prompt).toContain("Write beat 3 of the story");
    expect(sc.prompt).toContain("<story-so-far>\nScene 1 opens.");
    expect(sc.prompt).not.toContain("Scene 4 opens");
    expect(new Set(after.filter((c) => /^screen/.test(c.stage)).map((c) => /<scene n="(\d+)">/.exec(c.prompt)![1]))).toEqual(new Set(["3", "4"]));
    const v = d.view(draw.id);
    expect(v.scenes[2].text).toContain("Scene 3 opens. REWRITTEN");
    expect(v.scenes).toHaveLength(8);
    expect(after.find((c) => c.stage === "screen-ledger" && /<scene n="4">/.test(c.prompt))!.prompt).toContain("REWRITTEN");   // scene 4 is screened against the new scene 3
    const rewrites = p.artifacts(draw.id).filter((a) => a.kind === "scene" && JSON.parse(a.meta).rewrite).map((a) => JSON.parse(a.meta));
    expect(rewrites.map((m) => [m.beat, m.rewrite_finding])).toEqual([[3, flag.id]]);   // the gate-2 record is on the scene
    expect(p.draw(draw.id).flag_note).toBe("");
    await expect(d.rewrite(draw.id, 9)).rejects.toThrow(/beat 9 is not in 1\.\.8/);
    await expect(d.rewrite(draw.id, 2, "f-nope")).rejects.toThrow(/no screen finding f-nope/);
    // rewriting the last beat re-screens it alone
    const b2 = model.calls.length;
    await d.rewrite(draw.id, 8);
    expect(model.calls.slice(b2).map((c) => c.stage).sort()).toEqual(["scene", "screen-ledger", "screen-ledger", "screen-ledger", "screen-structure"]);
  });

  test("patch applies a flag's own rewrite in place, costs no model call, and skips what it cannot reach", async () => {
    const { p, d, draw, model } = await drawn();
    await d.draft(draw.id);
    const before = model.calls.length;
    const flags = d.view(draw.id).screenFindings;
    expect(flags.map((f) => f.beat)).toEqual([3, 4]);
    expect(d.story(draw.id)).toContain("Scene 3 opens.");

    const r = d.patch(draw.id);
    expect(model.calls).toHaveLength(before);                                  // no model call at all
    expect(r.applied.map((f) => f.beat)).toEqual([3]);
    expect(r.skipped.map((x) => [x.finding.beat, x.why])).toEqual([[4, "no patch: the fix needs more than the span"]]);

    // the scene carries the patch, the beat is untouched otherwise, and nothing was regenerated
    const scene3 = d.view(draw.id).scenes.find((s) => s.beat === 3)!;
    expect(scene3.text).toContain(SCENE_3_PATCH);
    expect(scene3.text).not.toContain("Scene 3 opens.");
    expect(d.story(draw.id)).toContain(SCENE_3_PATCH);
    expect(p.steps(draw.id).filter((s) => s.stage === "scene" && s.model === "patched")).toHaveLength(1);
    expect(p.draw(draw.id).status).toBe("awaiting_draft_gate");

    // the flag is settled, so a second patch is a no-op and the gate shows it applied
    const after = d.view(draw.id).screenFindings.find((f) => f.beat === 3)!;
    expect([after.decision, after.note]).toEqual(["accepted", "patched in place"]);
    expect(d.patch(draw.id).applied).toEqual([]);
    expect(() => d.patch(draw.id, [after.id])).toThrow(/no open screen finding/);
  });

  test("patch refuses a draw that is not at gate 2", async () => {
    const { d, draw } = await drawn();
    await d.check(draw.id);
    expect(() => d.patch(draw.id)).toThrow();
  });

  test("keep exports drafts/<draw>/ with story, schedule, findings, config and trail; pass records a draft verdict", async () => {
    const { p, d, draw, dir } = await drawn();
    await d.check(draw.id);
    const [a, b] = d.findings(draw.id).findings;
    d.dismiss(draw.id, a.id, "she can fire it");
    d.dismiss(draw.id, b.id, "deliberate seam");
    await d.draft(draw.id);
    await d.rewrite(draw.id, 3);
    const { draw: kept, dir: out } = d.keep(draw.id, "good enough");
    expect(kept.status).toBe("drafted");
    expect(out).toBe(join(dir, "drafts", draw.id));
    for (const f of ["story.md", "schedule.md", "findings.md", "config.toml", "trail.md"]) expect(existsSync(join(out, f))).toBe(true);
    const story = readFileSync(join(out, "story.md"), "utf8");
    expect(story).toContain("Scene 3 opens. REWRITTEN");
    expect(story).not.toContain("[screen-");
    expect(readFileSync(join(out, "schedule.md"), "utf8")).toContain("## Beat 3 · 625 words · absorbs chosen");
    const findings = readFileSync(join(out, "findings.md"), "utf8");
    expect(findings).toContain(`**${a.id}** derivation+ledger ×3 [debt audit] dismissed: she can fire it`);
    expect(findings).toContain("### Beat 5\n\n- structure theme-stated: quote theme-stated 5");
    expect(findings).toContain("## Slop");
    expect(readFileSync(join(out, "config.toml"), "utf8")).toContain("[length]\nwords = 5000");
    const trail = readFileSync(join(out, "trail.md"), "utf8");
    expect(trail).toContain("a typed seed");
    expect(trail).toContain("## draft");
    expect(trail).toContain("- rewrite 3");
    expect(trail).toContain("- scene: claude-opus-5");
    expect(latest(p.db, "draft", draw.id)).toMatchObject({ verdict: "keep", note: "good enough" });
    expect(() => d.keep(draw.id)).toThrow(/is drafted, not awaiting_draft_gate/);
  });

  test("--auto: accepts findings at or above the score floor, dismisses the rest, repairs, re-checks, drafts, stops at gate 2", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples(), ...cleanSamples()] });
    const { p, d, draw, model } = await drawn(script);
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).not.toBe(draw.id);
    expect(out.repaired_from).toBe(draw.id);
    expect(out.status).toBe("awaiting_draft_gate");
    expect(p.draw(draw.id).status).toBe("repaired");
    // A and B reach the floor; C recurred once of three, under keep_if, so auto leaves it open for a person
    const first = d.findings(draw.id, { all: true }).findings;
    expect(first.map((f) => [f.score, f.decision])).toEqual([[10, "accepted"], [6, "dismissed"], [5, "open"]]);
    expect(first[1].note).toBe("auto: scored 6, under 7");
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
    expect(r.rounds.map((x) => [x.round, x.open, x.total, x.accepted])).toEqual([[1, 2, 16, 1], [2, 0, 0, 0], [3, 0, 0, 0]]);   // C is under keep_if: not open to auto; two clean passes end it
    expect(r.rounds[2].id).toBe(r.rounds[1].id);                               // the second clean pass is a re-check of the same brief
    expect(r.left_open).toBe(0);                                               // a floor stop leaves nothing to rule on
    expect(r.best.round).toBe(2);
    expect(r.id).toBe(r.rounds[1].id);
    expect(r.id).not.toBe(draw.id);
    // the round table is stored on the brief auto stopped on, so the gate can render it
    const art = p.artifacts(r.id).find((a) => a.kind === "auto")!;
    expect(JSON.parse(art.content)).toMatchObject({ stopped: "floor", floor: 7 });
    expect(JSON.parse(art.meta)).toMatchObject({ rounds: 3, best: r.best.id });
  });

  test("auto stops on patience when the total score stops falling, and names the best round", async () => {
    // each pass reports a different defect of the same weight, so no round improves and none is a re-litigation
    // deliberately unrelated wording each round: a shared phrasing would cluster as one defect
    const WORDS = ["reliquary silk director", "clavicle Verona relic", "assembler forge tally", "director ledger hour", "silk tears cut",
      "relic bones sold", "forge iron count", "hour glass turned", "tally marks burned", "bones washed clean", "iron gate sealed", "glass eye watched"];
    let k = 0;
    const fresh = () => { const w = WORDS[k++ % WORDS.length]; return finding(w, `the ${w} does not hold`, "debt audit", `The ${w} holds.`); };
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
    const fresh = () => { const w = WORDS[k++ % WORDS.length]; return finding(w, `the ${w} does not hold`, "debt audit", `The ${w} holds.`); };
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
    const fresh = () => { const w = WORDS[k++ % WORDS.length]; return finding(w, `the ${w} does not hold`, "debt audit", `The ${w} holds.`); };
    const passes = Array.from({ length: 8 }, () => { const a = fresh(); return [1, 2, 3].map(() => `<ledger>${LEDGER}</ledger>${a}<examined>x</examined>`); }).flat();
    const derivations = Array.from({ length: 8 }, () => [1, 2, 3].map(() => `<impossibility>One.</impossibility><examined>x</examined>`)).flat();
    const { d, draw } = await drawn(draftScript({ "check-ledger": passes, "check-derivation": derivations, execute: withWords(WORDS) }));
    await d.check(draw.id);
    const r = await d.autoRounds(draw.id, { cfg: { ...loadDraftConfig().config, repair: { rounds: 2, stop_score: 7, patience: 9, max_calls: 9999 } } });
    expect(r.stopped).toBe("cap");
    expect(r.rounds).toHaveLength(3);                                          // rounds 1 and 2 repair, the third is where it stops
  });

  test("--auto never accepts structure or resemblance, and evidence-less findings are dismissed however they score", async () => {
    const strip = (f: string) => f.replace(/<evidence>[^<]*<\/evidence>/, "<evidence>none</evidence>");
    const noEv = strip(A());
    const script = draftScript({ "check-ledger": [...ledgerSamples(noEv, strip(B())), ...cleanSamples()], "check-derivation": [...derivationSamples(noEv), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const fs = d.findings(draw.id).findings;
    expect(fs.map((f) => f.score)).toEqual([7, 3]);                            // C recurred once: under the bar, and no longer auto's to decide
    const out = await d.draft(draw.id, { auto: true });
    expect(out.id).toBe(draw.id);                                             // nothing accepted, no repair
    // the first pass's findings keep their verdicts; the second clean pass is what the gate now shows
    expect(fs.map((f) => latest(p.db, "finding", f.id)?.verdict)).toEqual(["pass", "pass"]);
    expect(latest(p.db, "finding", fs[0].id)?.note).toBe("auto: no evidence to read it against");   // 8 is over the floor; a person still has to read it
    expect(d.findings(draw.id).findings).toHaveLength(0);
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

  test("a version-3 store migrates to 11: the new columns arrive, the domains column goes, a failure note becomes the error, and the rows survive", () => {
    const dir = mkdtempSync(join(tmpdir(), "cloudchamber-mig4-"));
    const path = join(dir, "v3.db"), log = join(dir, "verdicts.jsonl");
    writeFileSync(log, "");
    const old = new Database(path);
    old.exec(`CREATE TABLE verdicts (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('example','theme','brief','story')), target_id TEXT NOT NULL, verdict TEXT NOT NULL, artifact INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', method TEXT NOT NULL, at TEXT NOT NULL, by TEXT NOT NULL, pipeline_version TEXT NOT NULL, inherited_from TEXT);
      CREATE TABLE draws (id TEXT PRIMARY KEY, setting TEXT, genre TEXT NOT NULL, mode TEXT NOT NULL, segment TEXT, seed_mode TEXT NOT NULL, seed_text TEXT NOT NULL, seed_theme_id TEXT, example_ids TEXT NOT NULL, domains TEXT, status TEXT NOT NULL, gate_method TEXT, chosen_step TEXT, flagged INTEGER NOT NULL DEFAULT 0, flag_note TEXT NOT NULL DEFAULT '', superseded_by TEXT REFERENCES draws(id), created_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE steps (id TEXT PRIMARY KEY, draw_id TEXT REFERENCES draws(id), story_id TEXT, parent_id TEXT REFERENCES steps(id), stage TEXT NOT NULL, model TEXT NOT NULL, system_prompt TEXT NOT NULL, prompt TEXT NOT NULL, raw_response TEXT, parsed TEXT, status TEXT NOT NULL, fail_reason TEXT, attempt INTEGER NOT NULL DEFAULT 1, started_at TEXT NOT NULL, ended_at TEXT, error TEXT);
      CREATE TABLE artifacts (id TEXT PRIMARY KEY, step_id TEXT NOT NULL REFERENCES steps(id), kind TEXT NOT NULL, content TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}');
      INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, created_at) VALUES ('r1', 'horror', 'manual', 'drawn', 'A seed.', '[]', 'done', 'now');
      INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, flag_note, created_at) VALUES ('r2', 'horror', 'manual', 'drawn', 'A seed.', '[]', 'failed', 'premises failed: error', 'now');
      INSERT INTO draws (id, genre, mode, seed_mode, seed_text, example_ids, status, flagged, flag_note, created_at) VALUES ('r3', 'horror', 'manual', 'drawn', 'A seed.', '[]', 'failed', 1, 'looks wrong', 'now');
      INSERT INTO steps (id, draw_id, stage, model, system_prompt, prompt, status, started_at) VALUES ('s1', 'r1', 'outline', 'm', '', '', 'done', 'now');
      PRAGMA user_version = 3;`);
    old.close();
    const db: Db = openDb(path, log);
    expect((db.query("PRAGMA user_version").get() as any).user_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(11);
    expect(db.query("SELECT id, flag_note, error FROM draws WHERE id IN ('r2', 'r3') ORDER BY id").all())
      .toEqual([{ id: "r2", flag_note: "", error: "premises failed: error" }, { id: "r3", flag_note: "looks wrong", error: null }]);
    expect(db.query("SELECT repaired_from, draft_config, forked_from, sampling, archived_at, name, darkness FROM draws WHERE id = 'r1'").get())
      .toEqual({ repaired_from: null, draft_config: null, forked_from: null, sampling: "tail", archived_at: null, name: "seed", darkness: null });
    expect(db.query("SELECT tools FROM steps WHERE id = 's1'").get()).toEqual({ tools: "" });
    expect((db.query("PRAGMA table_info(draws)").all() as { name: string }[]).map((c) => c.name)).not.toContain("domains");
    expect(() => record(db, { kind: "finding", target_id: "f-abc", verdict: "pass", method: "gate", note: "x" }, log)).not.toThrow();
    expect(() => record(db, { kind: "draft", target_id: "r1", verdict: "keep", method: "gate" }, log)).not.toThrow();
    const again = openDb(path, log);
    expect(again.query("SELECT count(*) AS n FROM verdicts").get()).toEqual({ n: 2 });
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
    expect(r.rounds.map((x) => [x.round, x.open, x.total, x.accepted])).toEqual([[1, 0, 0, 0], [2, 0, 0, 0]]);
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
    const prompt = p.steps(r.id).find((s) => s.stage === "repair-outline")!.prompt;
    expect(prompt).toContain("Only the assembler can fire the reliquary.");
    expect(prompt).not.toContain("The twelfth relic is the Verona clavicle in every account.");
  });
});

describe("the verify pass", () => {
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
      "check-ledger": [...ledgerSamples(A(), finding(SPAN_B, "the twelfth relic is named differently in the two vignettes", "arithmetic", "The twelfth relic is the Verona clavicle in every account.", undefined, undefined, "the twelfth relic, the Bruges clavicle")), ...cleanSamples(), ...cleanSamples()],
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
    const outlineOnly = finding("Section arithmetic body", "the outline's sum is off", "arithmetic", "The sum holds.", "the fire was on the 3rd");
    const script = draftScript({
      "check-ledger": [...ledgerSamples(A(), outlineOnly)],
      "check-derivation": [...derivationSamples()],
    });
    const { d, draw, model } = await drawn(script);
    const r = await d.check(draw.id);
    expect(r.findings.map((f) => f.span)).toEqual([SPAN_A]);
    const all = d.findings(draw.id, { all: true }).findings;
    expect(all.find((f) => f.span === "Section arithmetic body")).toMatchObject({ reported: false, dropped: NOT_IN_PROSE });
    const prompt = model.calls.find((c) => c.stage === "check-verify")!.prompt;
    expect(prompt).not.toContain("Section arithmetic body\"");
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
    // B is arithmetic with no patch, so it moves the mechanism and the ending takes it too
    expect(constraints("repair-ending")).toContain("The twelfth relic is the Verona clavicle in every account.");
    expect(constraints("repair-outline")).toContain("Only the assembler can fire the reliquary.");
    expect(constraints("repair-outline")).toContain("The twelfth relic is the Verona clavicle in every account.");
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
  test("is the chain root's with the accepted fixes appended, never what a repair wrote into the outline", async () => {
    const script = draftScript({ "check-ledger": [...ledgerSamples(), ...cleanSamples()], "check-derivation": [...derivationSamples(), ...cleanSamples()] });
    const { p, d, draw } = await drawn(script);
    await d.check(draw.id);
    const [a] = d.findings(draw.id).findings.filter((f) => f.reported);
    const next = await d.accept(draw.id, [a.id]);
    // the repair's outline is "Repaired ... body."; the recheck must read the author's "Section ... body." instead
    expect(p.artifacts(next.id).find((x) => x.kind === "outline")!.content).toContain("Repaired debt audit body.");
    const prompt = p.steps(next.id).find((s) => s.stage === "check-derivation")!.prompt;
    expect(prompt).toContain("Section debt audit body.");
    expect(prompt).not.toContain("Repaired debt audit body.");
    expect(prompt).toContain("where an amendment and a line above disagree, the amendment holds and the line above is void:\n- Only the assembler can fire the reliquary.");
  });
});
