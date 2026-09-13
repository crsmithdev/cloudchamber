/** cloudchamber serve: the API plus the built UI (app/ui/dist) from one bun process. */
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../pipeline/store/db.ts";
import { Pipeline } from "../pipeline/draw.ts";
import { ClaudeCli } from "../pipeline/model.ts";
import { ROOT } from "../pipeline/paths.ts";
import { buildApi } from "./api.ts";

export async function serve(port: number, opts: { db?: string; uiDir?: string; host?: string } = {}) {
  const db = openDb(opts.db);
  const pipeline = new Pipeline(db, new ClaudeCli());
  const app = buildApi(db, pipeline, { logger: false });
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
