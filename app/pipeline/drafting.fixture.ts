/**
 * Canned model responses for the checking and drafting stages, shaped as the
 * prompts ask. Three samples of the ledger checker carry two findings that
 * recur in all three, one in two, one in one; the derivation samples repeat
 * the top finding so the cross-checker merge has something to merge.
 */
import { tag } from "./model.ts";

export const SPAN_A = "The director fires the reliquary";
export const SPAN_B = "the twelfth relic, the Verona clavicle";
export const SPAN_C = "tears on the silk";

export const finding = (span: string, statement: string, invalidates: string, replacement: string, evidence = "a second quote from the outline", result = `contradicts:${evidence}`, patch = "") =>
  `<finding><span>${span}</span><statement>${statement}</statement><result>${result}</result><evidence>${evidence}</evidence><invalidates>${invalidates}</invalidates><replacement>${replacement}</replacement>${patch ? `<patch>${patch}</patch>` : ""}</finding>`;

export const A = (s = SPAN_A) => finding(s, "the director fires the reliquary herself", "debt audit", "Only the assembler can fire the reliquary.");
export const B = (s = SPAN_B) => finding(s, "the twelfth relic is named differently in the two vignettes", "arithmetic", "The twelfth relic is the Verona clavicle in every account.");
export const C = () => finding(SPAN_C, "the tears the outline cut are back", "custody", "The silk is dry.");

export const LEDGER = "time: the fire was on the 3rd\ndetail: 1,106 dead\ncustody: the director holds the order";

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
  return `<scene>Scene ${n} opens.${rewrite} ${Array.from({ length: words - 3 }, (_, i) => `s${n}w${i}`).join(" ")}</scene>`;
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
  const fifth = /resolves-everything:/.test(prompt) ? "resolves-everything" : "resolved";
  const names = ["theme-stated", "bodily-emotion", "withheld-revealed", "protagonist-never-wrong", fifth];
  const present = new Set([n === 5 ? "theme-stated" : "", "bodily-emotion"]);
  return names.map((q) => `<question name="${q}"><answer>${present.has(q) ? "present" : "absent"}</answer><quote>quote ${q} ${n}</quote></question>`).join("");
};

export const ending = (span = SPAN_A) => `<ending>${span}, and the count closes. The last beat.</ending>`;
export const vignette = (n: number, extra = "") => `<vignette>${extra ? extra + " " : ""}${Array.from({ length: 400 }, (_, i) => `w${n}_${i}`).join(" ")}</vignette>`;

/** The script for a full draw plus check and draft. Queues are consumed in call order. */
export function draftScript(over: Record<string, any> = {}) {
  return {
    premises: () => [0.05, 0.03, 0.08, 0.03, 0.06].map((p, i) => `<premise><text>Premise ${i + 1} text.</text><probability>${p}</probability></premise>`).join("\n"),
    execute: (p: string) => vignette(Number(/Premise (\d)/.exec(p)?.[1] ?? 0)),
    outline: () => ["debt audit", "arithmetic", "custody"].map((n) => `<section name="${n}">Section ${n} body.</section>`).join("\n"),
    jobs: () => "<job>Test the first thing: scene one.</job><job>Test a second thing: scene two.</job>",
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
    "repair-vignette": (p: string) => `<vignette>rewritten vignette ${tag(p, "constraints")?.split("\n")[0] ?? ""} ${"w ".repeat(390)}</vignette>`,
    "repair-outline": () => ["debt audit", "arithmetic", "custody"].map((n) => `<section name="${n}">Repaired ${n} body.</section>`).join("\n"),
    "repair-ending": () => "<ending>Only the assembler fires the reliquary, and the count closes.</ending>",
    schedule: () => schedule(),
    scene: (p: string) => sceneFor(p),
    "screen-ledger": screenLedger,
    "screen-structure": screenStructure,
    ...over,
  };
}
