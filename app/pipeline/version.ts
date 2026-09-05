import { ROOT } from "./paths.ts";

let cached: string | undefined;

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
