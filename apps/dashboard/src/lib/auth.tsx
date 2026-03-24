import {
  createContext,
  useContext,
  useEffect,
  useState,
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
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthContextValue>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  });

  useEffect(() => {
    fetch("/api/user", { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const user = await res.json();
          setState({ isAuthenticated: true, isLoading: false, user });
        } else {
          setState({ isAuthenticated: false, isLoading: false, user: null });
        }
      })
      .catch(() => {
        setState({ isAuthenticated: false, isLoading: false, user: null });
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
