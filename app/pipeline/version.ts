import { ROOT } from "./paths.ts";

let cached: string | undefined;
let tree: string | undefined;

/** Short git sha of the checkout, or "dev". Recorded on every verdict and step. */
export function pipelineVersion(): string {
  if (cached) return cached;
  try {
    const out = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
    cached = out.success ? out.stdout.toString().trim() : "dev";
  } catch {
    cached = "dev";
  }
  return cached;
}

/**
 * The tree a step ran from: the sha, and `+dirty` when the code differs from
 * it. On 23 September a word count measured inside a worktree that carried a
 * rejected change was published as a fact about `main`, and nothing in the
 * store said which tree the numbers came from.
 *
 * Dirty is asked of `app/` and `extract/` only. `bank/` is what the pipeline
 * itself exports, so it is nearly always modified, and a flag that is always
 * on says nothing.
 */
export function treeVersion(): string {
  if (tree) return tree;
  let dirty = false;
  try {
    const out = Bun.spawnSync(["git", "status", "--porcelain", "--", "app", "extract"], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
    dirty = out.success && out.stdout.toString().trim().length > 0;
  } catch {
    dirty = false;
  }
  tree = dirty ? `${pipelineVersion()}+dirty` : pipelineVersion();
  return tree;
}
