/**
 * Canned model responses for the checking and drafting stages, shaped as the
 * prompts ask. Three samples of the ledger checker carry two findings that
 * recur in all three, one in two, one in one; the derivation samples repeat
 * the top finding so the cross-checker merge has something to merge.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FakeModel, tag } from "./model.ts";
import { openDb } from "./store/db.ts";
import { Pipeline } from "./draw.ts";
import { Drafting } from "./drafting.ts";
import { loadDraftConfig } from "./draftconfig.ts";

export const SPAN_A = "The director fires the reliquary";
export const SPAN_B = "the twelfth relic, the Verona clavicle";
export const SPAN_C = "tears on the silk";

/** The default evidence quotes the fixture ending, so a finding is grounded; A's span sits in the ending too, so A is what a reader sees. */
export const finding = (span: string, statement: string, invalidates: string, replacement: string, evidence = "and the count closes. The last beat.", result = `contradicts:${evidence}`, patch = "") =>
  `<finding><span>${span}</span><statement>${statement}</statement><result>${result}</result><evidence>${evidence}</evidence><invalidates>${invalidates}</invalidates><replacement>${replacement}</replacement>${patch ? `<patch>${patch}</patch>` : ""}</finding>`;

export const A = (s = SPAN_A) => finding(s, "the director fires the reliquary herself", "departure", "Only the assembler can fire the reliquary.");
// B and C quote the ledger, not the prose: a rule a reader does not see scores one where a line they do see scores two
export const B = (s = SPAN_B) => finding(s, "the twelfth relic is named differently in the two vignettes", "particulars", "The twelfth relic is the Verona clavicle in every account.", "the fire was on the 3rd");
export const C = () => finding(SPAN_C, "the tears the outline cut are back", "knowledge", "The silk is dry.", "the director holds the order");

export const LEDGER = "time: the fire was on the 3rd\ndetail: 1,106 dead\npossession: the director holds the order";

/** Three ledger samples: A in all three, B in 1 and 3, C in 2 only. */
export const ledgerSamples = (a = A(), b = B()) => [
  `<ledger>${LEDGER}</ledger>${a}${b}<examined>ledger×chosen\nledger×context-1\nchosen×ending</examined>`,
  `<ledger>${LEDGER}</ledger>${a}${C()}<examined>ledger×chosen\nchosen×ending</examined>`,
  `<ledger>${LEDGER}</ledger>${a}${b}<examined>ledger×chosen\nledger×ending</examined>`,
];
export const derivationSamples = (a = A()) => Array.from({ length: 3 }, () => `<impossibility>One reliquary that fires.</impossibility>${a}<examined>the director fires it\n1,106 = 12 × 92 + 2</examined>`);
export const cleanSamples = () => Array.from({ length: 3 }, () => `<ledger>${LEDGER}</ledger><impossibility>One reliquary.</impossibility><examined>everything checked, nothing found</examined>`);

export const STRUCTURE_Q = ["threat", "category-violation", "agency", "obscurity", "thickening", "spectacle", "consequence"];
export const structure = (present = ["threat", "agency", "consequence"]) => STRUCTURE_Q.map((q) => `<question name="${q}"><answer>${present.includes(q) ? "present" : "absent"}</answer><quote>a quote for ${q}</quote></question>`).join("");
export const resemblance = () => `<match><entry>3. The madman, the crank or the conspiracy theorist turns out to have been right.</entry><span>the director was right all along</span></match><nearest><title>The Monkey's Paw</title><author>W. W. Jacobs</author><shared>a wish that is paid for in the currency it names</shared></nearest>`;

export const claimsExtract = () => `<claim><span>four hundred kilometres from Naples</span><statement>Naples to Van is about 400 km.</statement></claim><claim><span>€40 a kilo</span><statement>Bronte pistachios cost about €40 per kilo.</statement></claim>`;
export const claimVerify = (prompt: string) => {
  const stmt = /As a checkable sentence: (.*)/.exec(prompt)?.[1] ?? "";
  return stmt.includes("400 km")
    ? finding("four hundred kilometres from Naples", stmt, "none", "Naples to Van is about 2,000 km.", "https://example.org/distance · \"2,032 km by road\"", "contradicted")
    : finding("€40 a kilo", stmt, "none", "none", "https://example.org/pistachio · \"€45–60 per kilo\"", "supported");
};

/** A schedule of M beats whose caps sum to the target; withholding items dated to later beats. */
export function schedule(opts: { beats?: number; cap?: number; form?: string; absorbsTwice?: boolean } = {}) {
  const M = opts.beats ?? 8, cap = opts.cap ?? 625;
  const form = opts.form ?? "tense: past\nperson: third\nchronology: linear\ncontainer: prose";
  const beats = Array.from({ length: M }, (_, i) => {
    const n = i + 1;
    // beat 6 lists its own reveal as withheld "until beat 6": the screen filter must drop it there and keep it on beat 5
    const withheld = n < M ? [`the instrument's wording — beat ${M - 1}`, ...(n <= 6 ? ["why she answers only Lauro — beat 6"] : [])].join("\n") : "none";
    const absorbs = n === 3 || (opts.absorbsTwice && n === 4) ? "chosen" : n === M ? "ending" : "none";
    return `<beat n="${n}" words="${cap}"><job>Beat ${n} does its thing in the archive.</job><known>By its end the reader knows thing ${n}.</known><withheld>${withheld}</withheld><stakes>The count.</stakes><absorbs>${absorbs}</absorbs></beat>`;
  });
  return `<form>${form}</form>${beats.join("\n")}`;
}

export const sceneFor = (prompt: string, over: Record<number, number> = { 2: 700 }) => {
  const n = Number(/Write beat (\d+) of the story/.exec(prompt)?.[1] ?? 0);
  const words = over[n] ?? 300;
  const rewrite = /<constraints>/.test(prompt) ? " REWRITTEN" : "";
  // the filler is written in sentences: one 300-word sentence would trip the listen screen's long-sentence ceiling
  return `<scene>Scene ${n} opens.${rewrite} ${Array.from({ length: words - 3 }, (_, i) => `s${n}w${i}${i % 10 === 9 ? "." : ""}`).join(" ")}</scene>`;
};

export const SCENE_3_PATCH = "Scene 3 opens on the 3rd";

/** Beat 3 carries a patchable flag; beat 4 one the fix is too big for, so `patch` must skip it. */
export const screenLedger = (prompt: string) => {
  const n = Number(/<scene n="(\d+)">/.exec(prompt)?.[1] ?? 0);
  const f = n === 3 ? finding("Scene 3 opens", "the date is off by two months", "3", "The fire was on the 3rd.", "time: the fire was on the 3rd", undefined, SCENE_3_PATCH)
    : n === 4 ? finding("Scene 4 opens", "the count is wrong throughout", "4", "1,106 died.", "detail: 1,106 dead")
    : "";
  return `${f}<examined>ledger × scene ${n}${n > 1 ? `, scene ${n - 1} × scene ${n}` : ""}</examined>`;
};

export const screenStructure = (prompt: string) => {
  const n = Number(/<scene n="(\d+)">/.exec(prompt)?.[1] ?? 0);
  const last = /resolves-everything:/.test(prompt), paid = /presence-arrives:/.test(prompt);
  const names = ["theme-stated", "bodily-emotion", "withheld-revealed", "protagonist-never-wrong", "one-voice", "nothing-happens", last ? "resolves-everything" : "resolved", ...(/hook-late:/.test(prompt) ? ["hook-late"] : []), ...(paid ? ["presence-arrives", "cost-paid", "presence-in-room", "cost-in-scene"] : [])];
  // beat 5 states the theme; beat 2 names no body; the paying beat pays what a listener needs paid, on the page
  const present = new Set([n === 5 ? "theme-stated" : "", n === 2 ? "" : "bodily-emotion", "presence-arrives", "cost-paid", "presence-in-room", "cost-in-scene"]);
  return names.map((q) => `<question name="${q}"><answer>${present.has(q) ? "present" : "absent"}</answer><quote>quote ${q} ${n}</quote></question>`).join("");
};

export const ending = (span = SPAN_A) => `<ending>${span}, and the count closes. The last beat.</ending>`;
export const vignette = (n: number, extra = "") => `<vignette>${extra ? extra + " " : ""}${Array.from({ length: 400 }, (_, i) => `w${n}_${i}`).join(" ")}</vignette>`;

/** The script for a full draw plus check and draft. Queues are consumed in call order. */
export function draftScript(over: Record<string, any> = {}) {
  return {
    premises: () => [0.05, 0.03, 0.08, 0.03, 0.06].map((p, i) => `<premise><text>Premise ${i + 1} text.</text><probability>${p}</probability></premise>`).join("\n"),
    // the chosen vignette carries B and C, so every fixture span is in the prose a reader sees
    execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)).replace("</vignette>", ` ${SPAN_B}, ${SPAN_C}.</vignette>`),
    outline: () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n")
      + "\n<job>Test the first thing: scene one.</job>\n<job>Test a second thing: scene two.</job>",
    context: (p: string) => `<vignette>context for ${/Its job: (.*)/.exec(p)?.[1]}</vignette>`,
    ending: () => ending(),
    "ledger-extract": () => `<ledger>${LEDGER}</ledger>`,
    "check-ledger": ledgerSamples(),
    "check-derivation": derivationSamples(),
    "check-verify": (p: string) => Array.from({ length: (p.match(/^\d+\. span:/gm) ?? []).length }, (_, i) => `<verdict n="${i + 1}"><answer>keep</answer><why>holds</why></verdict>`).join(""),
    "check-structure": () => structure(),
    "check-resemblance": () => resemblance(),
    "check-claims-extract": () => claimsExtract(),
    "check-claims-verify": claimVerify,
    reconcile: () => "<conflicts></conflicts>",
    // repairs edit in place: the rewrite keeps the passage it was given
    "repair-context": (p: string) => `<vignette>rewritten context ${tag(p, "constraints")?.split("\n")[0] ?? ""} ${tag(p, "vignette") ?? ""}</vignette>`,
    "repair-vignette": (p: string) => `<vignette>rewritten vignette ${tag(p, "constraints")?.split("\n")[0] ?? ""} ${tag(p, "vignette") ?? ""}</vignette>`,
    "repair-outline": () => ["departure", "particulars", "knowledge", "arrival"].map((n) => `<section name="${n}">Repaired ${n} body.</section>`).join("\n"),
    "repair-ending": (p: string) => `<ending>${tag(p, "ending") ?? ""} Only the assembler fires the reliquary.</ending>`,
    schedule: () => schedule(),
    scene: (p: string) => sceneFor(p),
    "screen-ledger": screenLedger,
    "screen-structure": screenStructure,
    ...over,
  };
}

// --- a store and a finished draw -------------------------------------------------

const CELLS = ["informational", "mixed", "involved"].flatMap((v) => ["non-narrative", "mixed", "narrative"].map((m) => [v, m]));

export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cloudchamber-drafting-"));
  const db = openDb(join(dir, "t.db"));
  db.exec(`INSERT INTO sources (id, path, reader, genre) VALUES ('scp', 'x', 'scp', 'horror')`);
  db.exec(`INSERT INTO stories (id, source_id, ord, title, author, genre, words, text) VALUES ('scp/a', 'scp', 0, 'A', 'Ann', 'horror', 9000, 'x')`);
  const ins = db.query("INSERT INTO passages (id, story_id, text, words, stratum, position, seed, first_seen, voice, mode) VALUES (?, ?, ?, 200, 0, 0, 0, 'now', ?, ?)");
  CELLS.forEach(([v, m], i) => ins.run(`h${i}`, "scp/a", `horror passage ${i} ${v} ${m}. Nothing here is strange, and the ledger holds.`, v, m));
  db.exec(`INSERT INTO themes (id, text, attestation, stories, drafted_at) VALUES ('t1', 'A theme with a turn.', 1, '["scp/a"]', 'now')`);
  return { db, dir };
}

export async function drawn(script = draftScript(), setting?: { id: string; dir: string; claims?: string }) {
  const { db, dir } = fixture();
  const model = new FakeModel(script);
  const p = new Pipeline(db, model, { rng: () => 0.001, briefsDir: join(dir, "briefs"), settingsDir: setting?.dir, backoffMs: [0, 0, 0], cacheLeadMs: 0 });
  if (setting) {
    const path = join(setting.dir, `${setting.id}.md`);
    const text = readFileSync(path, "utf8");
    writeFileSync(path, setting.claims ? text.replace("claims: setting", `claims: ${setting.claims}`) : text.replace("claims: setting\n", ""));
  }
  const draw = await p.start({ mode: "auto", genre: "horror", setting: setting?.id, seed: { mode: "typed", text: "a typed seed" } });
  const d = new Drafting(p, { draftsDir: join(dir, "drafts") });
  // the fixtures script three samples per checker and three per screen; pin that here so a
  // change to the defaults in draft.toml does not rewrite every assertion in this file
  const cfg = loadDraftConfig(undefined, { "checks.samples": 3, "screens.samples": 3, "screens.keep_if": 2 });
  db.query("UPDATE draws SET draft_config = ? WHERE id = ?").run(JSON.stringify(cfg), draw.id);
  return { db, dir, model, p, d, draw };
}
