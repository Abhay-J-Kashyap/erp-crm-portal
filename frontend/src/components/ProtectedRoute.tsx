import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/types";

type Props = {
  children: ReactNode;
  /** When set, the user must hold one of these roles. */
  roles?: Role[];
};

export function ProtectedRoute({ children, roles }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  /**
   * THE THREE-STATE CHECK.
   * Auth is not a boolean — it has three states, and conflating the
   * first two is the most common bug in React auth:
   *   1. loading  — we hold a token but haven't verified it yet
   *   2. logged out
   *   3. logged in
   * Redirect during state 1 and you log the user out on every refresh.
   */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-petrol-600" />
      </div>
    );
  }

  if (!user) {
    /**
     * `state={{ from: location }}` remembers where they were heading so
     * login can send them back there rather than dumping everyone on
     * the dashboard.
     *
     * `replace` swaps the history entry instead of pushing one, so the
     * Back button doesn't bounce them straight into the redirect again.
     */
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
