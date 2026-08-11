import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, tokenStorage, unwrap } from "@/lib/api";
import type { LoginResponse, Role, User } from "@/lib/types";

type AuthState = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  /**
   * isLoading starts TRUE, and that matters.
   *
   * On a page refresh we have a token in localStorage but no user object
   * yet — we must ask the server who it belongs to. During that moment
   * `user` is null, which looks identical to "logged out".
   *
   * If ProtectedRoute checked `user` without also checking isLoading, it
   * would bounce an authenticated user to /login on every refresh. This
   * flag is what distinguishes "not logged in" from "don't know yet".
   */
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = tokenStorage.get();

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        // Verify with the server rather than trusting localStorage. The
        // token may be expired, or the account deactivated since login.
        const me = await unwrap<User>(api.get("/auth/me"));
        setUser(me);
      } catch {
        tokenStorage.clear();
        setUser(null);
      } finally {
        // `finally` guarantees this runs on both paths. Miss it in the
        // catch branch and a bad token leaves the app spinning forever.
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []); // [] = run once on mount

  const login = async (email: string, password: string) => {
    const result = await unwrap<LoginResponse>(
      api.post("/auth/login", { email, password })
    );

    tokenStorage.set(result.token);
    setUser(result.user);
  };

  const logout = () => {
    tokenStorage.clear();
    setUser(null);
    /**
     * KNOWN LIMITATION, worth stating in your README: this is a CLIENT-side
     * logout only. The JWT stays valid on the server until it expires,
     * because JWTs cannot be revoked (see Part 4). Anyone who copied the
     * token before logout could keep using it. Fixing this properly needs
     * a server-side revocation list or short-lived refresh tokens.
     */
  };

  /**
   * Role check used for conditional UI.
   *
   * IMPORTANT: this hides buttons, it does not secure anything. Anyone
   * can edit the JavaScript in their browser. The REAL check is the
   * `authorize` middleware from Part 4. Frontend role checks are a
   * usability feature — don't show people actions that will 403.
   */
  const hasRole = (...roles: Role[]) => (user ? roles.includes(user.role) : false);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * CUSTOM HOOK.
 * A function starting with `use` that calls other hooks. This one wraps
 * useContext and throws a clear error if used outside the provider —
 * far better than the `null` reference error you'd otherwise get three
 * files away from the actual mistake.
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }

  return context;
}
