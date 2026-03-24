import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Generate or propagate x-request-id for distributed tracing.
 * Adds the ID to both the request headers (for downstream use in API routes)
 * and response headers (for client-side correlation).
 */
export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? generateRequestId();

  // Clone request headers with x-request-id added
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Include in response for client-side correlation
  response.headers.set("x-request-id", requestId);

  return response;
}

/** Generate a random 16-char hex request ID. */
function generateRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const config = {
  matcher: ["/api/:path*"],
};
