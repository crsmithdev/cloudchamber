/**
 * What the page reads about draws: the list and one draw in full. The routes
 * hand these on unchanged, and the page imports their types from here, so a
 * field the page reads and the server stops sending is a compile error on both
 * sides of the HTTP seam rather than an undefined at run time.
 */
import type { Db } from "./store/db.ts";
import type { Pipeline, DrawRow, StepRow } from "./draw.ts";
import type { Drafting, FindingsSummary } from "./drafting.ts";
import { latest } from "./verdicts.ts";
import { originOf, type Origin } from "./stage.ts";
import { chainOf } from "./chain.ts";
import { checkersNext } from "./check.ts";
import { partsView } from "./briefparts.ts";
import { lifecycleView, stageTab, type LifecycleView, type Tab } from "./lifecycle.ts";
import { Lineage, type Superseded } from "./lineage.ts";
import { loadDraftConfig, type DraftConfig } from "./draftconfig.ts";

/** A draw as the list shows it: the row, what the lifecycle allows, where it stands in its chain, and its latest check. */
export type DrawListRow = DrawRow & LifecycleView & {
  /** The repair chain behind this draw, oldest first, this draw last. */
  rounds: string[];
  /** Nothing repairs this draw: it heads its chain. */
  head: boolean;
  superseded: Superseded | null;
  origin: Origin | null;
  check: FindingsSummary | null;
};

/** A step without its text; the step route carries the text when one is opened. */
export type StepSummary = Omit<StepRow, "prompt" | "raw_response" | "parsed"> & { tab: Tab | null; prompt_chars: number; raw_chars: number; parsed_chars: number };

/** One of the six passages a draw drew, with its latest verdict; a passage gone from the pool keeps its id only. */
export type DrawExample = { id: string; text: string | null; words?: number; cell?: string; title?: string; author?: string; genre?: string; source?: string; story_id?: string; latest: ReturnType<typeof latest> };

export function drawExamples(db: Db, exampleIds: string): DrawExample[] {
  return (JSON.parse(exampleIds) as string[]).map((id) => {
    const p = db.query(`SELECT p.id, p.text, p.words, p.voice || '/' || p.mode AS cell, s.title, s.author, s.genre, s.source_id AS source, s.id AS story_id
                        FROM passages p JOIN stories s ON s.id = p.story_id WHERE p.id = ?`).get(id) as Omit<DrawExample, "latest"> | null;
    return { ...(p ?? { id, text: null }), latest: latest(db, "example", id) };
  });
}

export class Views {
  /**
   * The check summary a list row shows for each round of a chain, memoised on
   * what can change it: the draw's status and the number of finding verdicts.
   * A read of one chain is about 4 ms on the Linux filesystem and 45 ms on the
   * Windows mount, and a list holds every round of every chain.
   */
  private summaries = new Map<string, FindingsSummary | null>();

  constructor(private p: Pipeline, private drafting: Drafting, private reportExists: (drawId: string) => boolean) {}

  private checkSummary(r: DrawRow, stage: Tab, verdicts: number): FindingsSummary | null {
    if (stage === "ideate" || r.status === "done") return null;
    const key = `${r.id}|${r.status}|${verdicts}`;
    if (this.summaries.has(key)) return this.summaries.get(key)!;
    const out = this.drafting.findings(r.id).summary;
    // one entry per draw: the key carries what invalidates it, so the old ones are dead
    for (const k of this.summaries.keys()) if (k.startsWith(`${r.id}|`)) this.summaries.delete(k);
    this.summaries.set(key, out);
    return out;
  }

  /** Every draw, newest first; archived ones only when asked. */
  list(archived = false): DrawListRow[] {
    const verdicts = (this.p.db.query("SELECT count(*) AS n FROM verdicts WHERE kind = 'finding'").get() as { n: number }).n;
    const all = this.p.draws(true);
    // every link question is answered from the rows already here: a draw nothing repairs heads its chain
    const lineage = new Lineage(all);
    return all.filter((r) => archived || !r.archived_at).map((r) => {
      const view = lifecycleView({ ...r, referenced_by: lineage.referencedBy(r.id) });
      // the candidate is what tells two briefs of one batch apart, so the list needs it too
      return { ...r, ...view, origin: view.stage === "ideate" ? null : originOf(this.p, r.id, lineage), check: this.checkSummary(r, view.stage, verdicts),
        rounds: lineage.rounds(r.id), head: lineage.isTip(r.id), superseded: lineage.superseded(r.id) };
    });
  }

  /** One draw in full. The pane polls it every few seconds, so steps come without their text. */
  draw(id: string) {
    const row = this.p.draw(id);
    const lineage = Lineage.all(this.p.db);
    const draw = { ...row, ...lifecycleView({ ...row, referenced_by: lineage.referencedBy(row.id) }), superseded: lineage.superseded(row.id) };
    const steps: StepSummary[] = this.p.steps(id).map(({ prompt, raw_response, parsed, ...s }) =>
      ({ ...s, tab: stageTab(s.stage), prompt_chars: prompt.length, raw_chars: raw_response?.length ?? 0, parsed_chars: parsed?.length ?? 0 }));
    // what a check would run on this draw now, and the repair settings it would run under: the page states neither itself
    const cfg = row.draft_config ? (JSON.parse(row.draft_config).config as DraftConfig) : loadDraftConfig().config;
    const chain = chainOf(this.p, id, lineage);
    return {
      draw, origin: originOf(this.p, id, lineage), steps, parts: partsView(this.p, id),
      checks_next: row.chosen_step ? checkersNext(this.p, id, cfg.checks.enabled) : [], repair: cfg.repair,
      // what the pane used to read off the artifact list itself: whether a check pass exists, and the auto run that ended here
      checked: !!chain.pass(), auto: chain.auto(),
      artifacts: this.p.artifacts(id), candidates: this.p.candidates(id), examples: drawExamples(this.p.db, row.example_ids), forks: this.p.forks(id),
      report: this.reportExists(id),
    };
  }
}
export type DrawDetail = ReturnType<Views["draw"]>;
