/**
 * Where a draw stands among the draws made from one another. A repair makes a
 * new round that points back with `repaired_from`, a fork points back with
 * `forked_from`, a branch points back with `branched_from`, and a draw another
 * replaced names it in `superseded_by`. Every question those links answer is
 * answered here, from the draw rows: the chain back to its root, the rounds,
 * which draws are tips, what repairs, forks or branches a draw, what points at
 * it, and how it was superseded.
 *
 * Built from rows already loaded, a list of every draw asks no query per row.
 */
import type { Db } from "./store/db.ts";
import type { DrawRow } from "./draw.ts";

export type Superseded = { by: string; how: "repaired" | "redrawn" };

export class Lineage {
  private rows: Map<string, DrawRow>;
  private repairedBy = new Map<string, string[]>();
  private forkedBy = new Map<string, string[]>();
  private branchedBy = new Map<string, string[]>();

  constructor(rows: Iterable<DrawRow>, private load?: (id: string) => DrawRow) {
    this.rows = new Map([...rows].map((r) => [r.id, r]));
    for (const r of this.rows.values()) {
      if (r.repaired_from) this.repairedBy.set(r.repaired_from, [...(this.repairedBy.get(r.repaired_from) ?? []), r.id]);
      if (r.forked_from) this.forkedBy.set(r.forked_from, [...(this.forkedBy.get(r.forked_from) ?? []), r.id]);
      if (r.branched_from) this.branchedBy.set(r.branched_from, [...(this.branchedBy.get(r.branched_from) ?? []), r.id]);
    }
  }

  /** Every draw in the store. */
  static all(db: Db): Lineage {
    return new Lineage(db.query("SELECT * FROM draws").all() as DrawRow[]);
  }

  row(id: string): DrawRow {
    let r = this.rows.get(id);
    if (!r && this.load) { r = this.load(id); this.rows.set(id, r); }
    if (!r) throw new Error(`no draw ${id}`);
    return r;
  }

  /** The draw and every round it repairs, back to the root: newest first. A link that loops ends the walk. */
  chain(id: string): string[] {
    const ids: string[] = [];
    for (let cur: string | null = id; cur && !ids.includes(cur); cur = this.row(cur).repaired_from) ids.push(cur);
    return ids;
  }
  /** The first draw of the chain. */
  root(id: string): string { return this.chain(id).at(-1)!; }
  /** The chain as the list shows it: every round oldest first, this draw last. */
  rounds(id: string): string[] { return this.chain(id).reverse(); }

  /** The rounds made by repairing this draw. A draw repaired more than once heads more than one chain. */
  repairs(id: string): string[] { return this.repairedBy.get(id) ?? []; }
  /** The draws forked off this one. */
  forks(id: string): string[] { return this.forkedBy.get(id) ?? []; }
  /** The draws branched off this one's draft. */
  branches(id: string): string[] { return this.branchedBy.get(id) ?? []; }
  /** Nothing repairs this draw: it is the newest round of its chain. */
  isTip(id: string): boolean { return !this.repairs(id).length; }
  /** The newest round of every chain that runs through this draw. */
  tips(id: string): string[] { return this.isTip(id) ? [id] : this.repairs(id).flatMap((r) => this.tips(r)); }

  /** Every draw pointing at this one: what repaired it, forked it, branched it, or superseded it. */
  referencedBy(id: string): string[] {
    const out = new Set([...this.repairs(id), ...this.forks(id), ...this.branches(id)]);
    for (const r of this.rows.values()) if (r.superseded_by === id) out.add(r.id);
    return [...out];
  }

  /** How this draw was replaced: by its own repair, or by a draw made afresh that superseded it. */
  superseded(id: string): Superseded | null {
    const by = this.row(id).superseded_by;
    if (!by) return null;
    return { by, how: this.rows.get(by)?.repaired_from === id || this.repairs(id).includes(by) ? "repaired" : "redrawn" };
  }

  /** This draw and every draw it came from, through repairs, forks and branches, back to the one that ran the premises. A link that loops ends the walk. */
  path(id: string): string[] {
    const ids: string[] = [];
    for (let cur: string | null = id; cur && !ids.includes(cur); ) {
      ids.push(cur);
      const r = this.row(cur);
      cur = r.repaired_from ?? r.forked_from ?? r.branched_from;
    }
    return ids;
  }
  /** The draw that ran the premises. */
  origin(id: string): string { return this.path(id).at(-1)!; }
}
