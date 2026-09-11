/** Run the Python extraction seam. */
import { ROOT } from "./paths.ts";

export function runExtract(args: string[], db?: string): { ok: boolean; out: string } {
  const env = { ...process.env, ...(db ? { CLOUDCHAMBER_DB: db } : {}) };
  const p = Bun.spawnSync(["python3", "-m", "extract", ...args], { cwd: ROOT, env, stdout: "pipe", stderr: "pipe" });
  const out = p.stdout.toString() + p.stderr.toString();
  return { ok: p.success, out };
}

/** read -> segment -> facets, then inherit verdicts onto the new pool. */
export function extractAll(only: string[] = [], db?: string): string[] {
  const log: string[] = [];
  for (const step of [["read", ...(only.length ? ["--only", ...only] : [])], ["segment", ...(only.length ? ["--only", ...only] : [])], ["facets"]]) {
    const r = runExtract(step, db);
    log.push(`$ extract ${step.join(" ")}\n${r.out.trim()}`);
    if (!r.ok) throw new Error(log.join("\n"));
  }
  return log;
}
