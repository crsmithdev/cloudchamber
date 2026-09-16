import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react(), tailwindcss()],
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
  server: { port: 3003, proxy: { "/api": "http://127.0.0.1:80" } },
});
