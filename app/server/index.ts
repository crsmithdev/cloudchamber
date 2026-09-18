/** cloudchamber serve: the API plus the built UI (app/ui/dist) from one bun process. */
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../pipeline/store/db.ts";
import { recoverInterrupted } from "../pipeline/lifecycle.ts";
import { Pipeline } from "../pipeline/draw.ts";
import { ClaudeCli } from "../pipeline/model.ts";
import { ROOT } from "../pipeline/paths.ts";
import { buildApi, Jobs } from "./api.ts";

/**
 * SIGHUP asks for a restart on new code: the process waits until no request's
 * background work is left, then exits, and systemd starts it again. A draw or
 * a repair in flight finishes on the old code rather than dying mid-call.
 */
export async function serve(port: number, opts: { db?: string; uiDir?: string; host?: string } = {}) {
  const db = openDb(opts.db);
  // a step still running from before this process began has no call behind it
  const r = recoverInterrupted(db, "interrupted: the server was not running to finish the call");
  if (r.draws.length) console.log(`recovered ${r.steps} interrupted step(s) on ${r.draws.join(", ")}`);
  const pipeline = new Pipeline(db, new ClaudeCli());
  const jobs = new Jobs();
  const app = buildApi(db, pipeline, { logger: false, jobs });
  let reloading = false;
  process.on("SIGHUP", async () => {
    if (reloading) return;
    reloading = true;
    console.log(`reload requested; waiting for ${jobs.count} background job(s)`);
    await jobs.idle();
    await app.close();
    console.log("reload: exiting for a restart on the new code");
    process.exit(0);
  });
  const ui = opts.uiDir ?? join(ROOT, "app", "ui", "dist");
  if (!existsSync(ui) && !opts.uiDir) {
    const b = Bun.spawnSync(["bun", "run", "ui:build"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    if (!b.success) console.error(`ui build failed:\n${b.stderr.toString().slice(-800)}`);
  }
  if (existsSync(ui)) {
    await app.register(fastifyStatic, { root: ui, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({ cloudchamber: "api only; build the ui with `bun run ui:build`" }));
  }
  await app.listen({ port, host: opts.host ?? "127.0.0.1" });
  return app;
}
