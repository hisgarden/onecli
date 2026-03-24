import { treaty } from "@elysiajs/eden";
import type { App } from "../../api/src/index";

/** Read a cookie value by name. */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(
    new RegExp(
      "(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)",
    ),
  );
  return match?.[1];
}

/** Get the CSRF token from the double-submit cookie. */
function getCsrfToken(): string | undefined {
  return getCookie("__Host-csrf") ?? getCookie("csrf");
}

/**
 * Eden treaty client — end-to-end type-safe API calls.
 *
 * In development, Vite proxies /api to the Elysia server (port 10254).
 * In production, the SPA is served by Elysia, so same-origin works.
 *
 * The `headers` callback injects the X-CSRF-Token header on every
 * request so state-changing calls (POST/PUT/PATCH/DELETE) pass the
 * double-submit CSRF check.
 */
export const api = treaty<App>(window.location.origin, {
  headers() {
    const csrf = getCsrfToken();
    return csrf ? { "x-csrf-token": csrf } : {};
  },
});
