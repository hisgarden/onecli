import { treaty } from "@elysiajs/eden";
import type { App } from "../../api/src/index";

/**
 * Eden treaty client — end-to-end type-safe API calls.
 *
 * In development, Vite proxies /api to the Elysia server (port 10254).
 * In production, the SPA is served by Elysia, so same-origin works.
 *
 * CSRF is handled by Better Auth (Origin + Fetch Metadata) — no manual
 * header injection needed.
 */
export const api = treaty<App>(window.location.origin);
