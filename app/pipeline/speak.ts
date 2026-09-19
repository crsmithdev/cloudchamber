/**
 * Render a draft to speech with the kokoro voice the voice bridge installed,
 * so a beat can be heard before anything else is judged. The venv and the
 * models are the bridge's; CLOUDCHAMBER_KOKORO_VENV and VOICE_BRIDGE_MODELS
 * relocate them. Nothing here is part of a draw.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const VENV = process.env.CLOUDCHAMBER_KOKORO_VENV ?? join(homedir(), ".voice-bridge", "kokoro-venv");
const MODELS = process.env.VOICE_BRIDGE_MODELS ?? join(homedir(), ".voice-bridge", "models");
const SAY = resolve(import.meta.dir, "speech", "say.py");

export async function speak(text: string, out: string, voice = "am_michael"): Promise<{ seconds: number; words: number; wpm: number }> {
  const seconds = await new Promise<number>((res, rej) => {
    const child = spawn(join(VENV, "bin", "python"), [SAY, join(MODELS, "kokoro", "kokoro-v1.0.onnx"), join(MODELS, "kokoro", "voices-v1.0.bin"), voice, out], { stdio: ["pipe", "pipe", "inherit"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.on("error", rej);
    // onnxruntime writes its provider notices to stdout before the script prints the seconds: the last line is the number
    child.on("close", (code) => (code === 0 ? res(Number(stdout.trim().split("\n").pop())) : rej(new Error(`kokoro exited ${code}`))));
    child.stdin.end(text);
  });
  const words = (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length;
  return { seconds, words, wpm: seconds > 0 ? Math.round(words / (seconds / 60)) : 0 };
}
