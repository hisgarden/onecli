import {
  createContext,
  useContext,
  useEffect,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthContextValue, "signOut">>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });

  // Initial session check — calls our /api/session which bootstraps account + defaults
  useEffect(() => {
    fetch("/api/session", { credentials: "include" })
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

  // Session refresh is handled automatically by Better Auth's updateAge config.
  // No manual refresh interval needed.

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort signout
    }
    setState({ isAuthenticated: false, isLoading: false, user: null });
    window.location.href = "/";
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
