import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../lib/auth";

function AuthStatus() {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <div data-testid="loading">Loading</div>;
  if (!isAuthenticated)
    return <div data-testid="unauth">Not authenticated</div>;
  return <div data-testid="auth">{user?.name ?? user?.email}</div>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state initially, then resolves to authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "u1", email: "a@b.c", name: "Alice" }),
    } as Response);

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    // Initially loading
    expect(screen.getByTestId("loading")).toBeTruthy();

    // After fetch resolves
    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("Alice");
    });
  });

  it("resolves to unauthenticated when session fetch returns non-ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unauth")).toBeTruthy();
    });
  });

  it("resolves to unauthenticated when fetch throws (network error)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("network error"),
    );

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unauth")).toBeTruthy();
    });
  });

  it("resolves to unauthenticated when response body has no user id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unauth")).toBeTruthy();
    });
  });

  it("calls /api/session with credentials: include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "u1", email: "a@b.c" }),
    } as Response);

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/session", {
        credentials: "include",
      });
    });
  });
});
