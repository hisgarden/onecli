/**
 * Production entrypoint for the OneCLI API.
 *
 * Imports the configured Elysia `app` from `./app`, registers the static SPA
 * fallback when the dashboard build is present, and starts the HTTP listener.
 *
 * Tests should import from `./app` directly — that module has no side effects
 * beyond constructing the Elysia instance, so it can be exercised via
 * `app.handle(new Request(...))` without binding a port.
 */
import { existsSync } from "fs";
import { resolve, extname } from "path";
import { app } from "./app";

const PORT = Number(process.env.PORT ?? 10254);

// ── Static SPA serving (production) ──────────────────────────────────
// In production, serve the pre-built Vite SPA from ../dashboard/dist.
// In development, the Vite dev server handles this via proxy.
const SPA_DIR = resolve(import.meta.dir, "../../dashboard/dist");

if (existsSync(SPA_DIR)) {
  const spaIndex = resolve(SPA_DIR, "index.html");
  app
    .get("/", async ({ set }) => {
      set.headers["content-type"] = "text/html";
      return Bun.file(spaIndex);
    })
    // Serve static assets and SPA fallback for non-API routes
    .get("*", async ({ request, set }) => {
      const pathname = new URL(request.url).pathname;
      // Try serving as a static file from the SPA build directory
      const filePath = resolve(SPA_DIR, pathname.slice(1));
      if (filePath.startsWith(SPA_DIR) && existsSync(filePath)) {
        return Bun.file(filePath);
      }
      // SPA fallback — return index.html for client-side routing
      set.headers["content-type"] = "text/html";
      return Bun.file(spaIndex);
    });
  console.log(`serving SPA from ${SPA_DIR}`);
}

app.listen({ port: PORT, hostname: "0.0.0.0" });

console.log(`onecli-api running on http://0.0.0.0:${PORT}`);

// Re-export the Eden treaty type so dashboard's existing import path
// (`import type { App } from "../../api/src/index"`) keeps working.
export type { App } from "./app";
