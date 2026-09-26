// Plant plot holes in copies of stored briefs and run today's check on each, with a ledger extracted from the planted text.
// usage: bun evals/plotholes/run.ts <code dir, the repository or a worktree> <plants.json> <runs> <out.json> [effort for check-derivation and check-ledger]
const [code, plantsPath, runsArg, out, effort] = process.argv.slice(2);
const runs = Number(runsArg);
const { openDb } = await import(`${code}/app/pipeline/store/db.ts`);
const { Pipeline, newDrawId } = await import(`${code}/app/pipeline/draw.ts`);
const { ClaudeCli } = await import(`${code}/app/pipeline/model.ts`);
const { Drafting } = await import(`${code}/app/pipeline/drafting.ts`);
const { copyBrief } = await import(`${code}/app/pipeline/branch.ts`);
const { commit } = await import(`${code}/app/pipeline/lifecycle.ts`);
const { chainOf } = await import(`${code}/app/pipeline/chain.ts`);
const { briefParts } = await import(`${code}/app/pipeline/briefparts.ts`);

type Plant = { id: string; draw: string; kind: string; part: string; original: string; planted: string; hole: string };
const plants: Plant[] = JSON.parse(await Bun.file(plantsPath).text());
const db = openDb();
const p = new Pipeline(db, new ClaudeCli());
const d = new Drafting(p);
if (effort) for (const s of ["check-derivation", "check-ledger"]) (p as any).stages[s] = { ...(p as any).stages[s], effort };

// the artifact holding a part of a copied brief: the chosen vignette, a context in job order, or the ending
function partArtifact(id: string, part: string): { id: string; content: string } {
  const arts = p.artifacts(id);
  if (part === "ending") return arts.find((a: any) => a.kind === "ending")!;
  const vignettes = arts.filter((a: any) => a.kind === "vignette");
  const chosen = p.draw(id).chosen_step;
  if (part === "vignette") return vignettes.find((a: any) => a.step_id === chosen)!;
  const contexts = vignettes.filter((a: any) => a.step_id !== chosen);
  return contexts[Number(part.split("-")[1]) - 1]!;
}

const byDraw = Map.groupBy(plants, (x) => x.draw);
const results: any[] = [];
await Promise.all([...byDraw].flatMap(([src, ps]) => Array.from({ length: runs }, async (_, run) => {
  const id = newDrawId();
  copyBrief(p, p.draw(src), id);
  for (const pl of ps) {
    const art = partArtifact(id, pl.part);
    if (art.content.split(pl.original).length !== 2) throw new Error(`${pl.id}: original not found once in ${pl.part}`);
    db.query("UPDATE artifacts SET content = ? WHERE id = ?").run(art.content.replace(pl.original, pl.planted), art.id);
  }
  // no ledger carried: the check extracts one from the planted brief, as a real round 1 would
  db.query("DELETE FROM artifacts WHERE kind = 'ledger' AND step_id IN (SELECT id FROM steps WHERE draw_id = ?)").run(id);
  db.query("DELETE FROM steps WHERE draw_id = ? AND stage = 'ledger-extract'").run(id);
  commit(db, { id, status: "done", ended: true });
  const planted = briefParts(p, id);
  for (const pl of ps) if (!JSON.stringify(planted).includes(pl.planted.slice(0, 60).replace(/"/g, '\\"').slice(0, 40))) console.error(`warn ${pl.id}: planted text not visible in briefParts`);
  const t0 = Date.now();
  await d.check(id);
  const kept = chainOf(p, id).findings(true).filter((f: any) => f.reported && f.source === "check")
    .map((f: any) => ({ checkers: f.checkers, score: f.score, span: f.span, statement: f.statement, result: f.result, evidence: f.evidence }));
  const steps = db.query("SELECT round(sum(json_extract(usage, '$.cost_usd')), 2) usd FROM steps WHERE draw_id = ?").get(id) as any;
  results.push({ src, copy: id, run: run + 1, ms: Date.now() - t0, usd: steps.usd, kept });
  console.error(`${src} run ${run + 1}: ${kept.length} kept, $${steps.usd}`);
})));
await Bun.write(out, JSON.stringify({ plants, results }, null, 1));
