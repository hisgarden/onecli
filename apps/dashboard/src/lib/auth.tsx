import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  signOut: async () => {},
});

/** Interval for silent session refresh (every 15 minutes). */
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|; )(?:__Host-csrf|csrf)=([^;]*)/);
  return match?.[1];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthContextValue, "signOut">>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial session check
  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const user = await res.json();
          if (user && user.id) {
            setState({ isAuthenticated: true, isLoading: false, user });
          } else {
            setState({ isAuthenticated: false, isLoading: false, user: null });
          }
        } else {
          setState({ isAuthenticated: false, isLoading: false, user: null });
        }
      })
      .catch(() => {
        setState({ isAuthenticated: false, isLoading: false, user: null });
      });
  }, []);

  // Silent session refresh — keeps JWT alive while user is active
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const refresh = async () => {
      try {
        const csrf = getCsrfToken();
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: csrf ? { "x-csrf-token": csrf } : {},
        });
        if (res.status === 401) {
          // Session expired — sign out
          setState({ isAuthenticated: false, isLoading: false, user: null });
        }
      } catch {
        // Network error — don't sign out, will retry next interval
      }
    };

    refreshTimer.current = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [state.isAuthenticated]);

  const signOut = useCallback(async () => {
    window.location.href = "/auth/signout";
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
