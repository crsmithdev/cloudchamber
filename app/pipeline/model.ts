/**
 * The model adapter: the one seam the tests substitute.
 *
 * Every call is a headless `claude -p` subprocess with CLAUDECODE unset and
 * `--output-format json --no-session-persistence --tools "" --setting-sources ""
 * --system-prompt <stage line> --model <explicit>`. Never `--bare`: it skips the
 * stored subscription login.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export type ModelResult = {
  text: string;
  stop: "end_turn" | "refusal" | "error" | string;
  raw: string;
  model: string;
  durationMs: number;
  usage?: Record<string, unknown>;
  error?: string;
};

export interface ModelAdapter {
  call(stage: string, system: string, prompt: string, model: string): Promise<ModelResult>;
}

export class ClaudeCli implements ModelAdapter {
  constructor(private timeoutMs = 15 * 60 * 1000) {}

  async call(stage: string, system: string, prompt: string, model: string): Promise<ModelResult> {
    const dir = mkdtempSync(join(tmpdir(), "fogbelt-call-"));
    const promptPath = join(dir, `${stage}.prompt`);
    writeFileSync(promptPath, prompt);
    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.CLAUDECODE;
    const args = ["claude", "-p", "--output-format", "json", "--no-session-persistence", "--tools", "",
      "--setting-sources", "", "--system-prompt", system, "--model", model];
    const t0 = Date.now();
    const proc = Bun.spawn(args, { env: env as any, stdin: Bun.file(promptPath), stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), this.timeoutMs);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    await proc.exited;
    clearTimeout(timer);
    const durationMs = Date.now() - t0;
    try {
      const j = JSON.parse(out);
      const used = Object.keys(j.modelUsage ?? {}).find((m) => !/haiku/.test(m)) ?? model;
      return { text: String(j.result ?? ""), stop: j.stop_reason ?? (j.is_error ? "error" : "end_turn"), raw: out, model: used, durationMs, usage: j.usage, error: j.is_error ? String(j.result) : undefined };
    } catch {
      return { text: "", stop: "error", raw: out, model, durationMs, error: (err || out || `exit ${proc.exitCode}`).trim().slice(0, 2000) };
    }
  }
}

/** Canned responses for tests: a queue per stage, or a function. */
export class FakeModel implements ModelAdapter {
  calls: { stage: string; system: string; prompt: string; model: string }[] = [];
  constructor(private script: Record<string, (string | Partial<ModelResult>)[] | ((prompt: string, model: string) => string | Partial<ModelResult>)>) {}

  async call(stage: string, system: string, prompt: string, model: string): Promise<ModelResult> {
    this.calls.push({ stage, system, prompt, model });
    const s = this.script[stage];
    if (!s) throw new Error(`FakeModel: no script for stage ${stage}`);
    const next = typeof s === "function" ? s(prompt, model) : s.shift();
    if (next === undefined) throw new Error(`FakeModel: script for ${stage} exhausted`);
    const r: Partial<ModelResult> = typeof next === "string" ? { text: next } : next;
    return { text: r.text ?? "", stop: r.stop ?? "end_turn", raw: r.raw ?? JSON.stringify({ result: r.text ?? "", stop_reason: r.stop ?? "end_turn" }), model: r.model ?? model, durationMs: 1, error: r.error };
  }
}

// --- parsing helpers ------------------------------------------------------

export function tag(text: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(text);
  return m ? m[1].trim() : null;
}

export function tags(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return out;
}

export function sections(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<section\s+name="([^"]+)"\s*>([\s\S]*?)<\/section>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out[m[1].trim().toLowerCase()] = m[2].trim();
  return out;
}

export const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
