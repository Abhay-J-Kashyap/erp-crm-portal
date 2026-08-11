import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Boxes, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getErrorMessage } from "@/lib/api";

/**
 * THE SAME ZOD SCHEMA PATTERN AS THE BACKEND.
 * Client-side validation is a UX improvement — instant feedback, no
 * round trip. It is NOT security: anyone can bypass it with devtools.
 * The backend validates independently, and that is the real check.
 */
const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * react-hook-form keeps input values in refs rather than state, so
   * typing doesn't re-render the whole form on every keystroke. With a
   * plain useState per field, a 15-field form re-renders 15 components
   * per character typed.
   */
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in? Don't show the form again.
  if (!authLoading && user) return <Navigate to="/" replace />;

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);

    try {
      await login(values.email, values.password);

      // Send them where they were originally headed (set by ProtectedRoute).
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Boxes className="h-6 w-6 text-petrol-700" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">Operations Portal</h1>
            <p className="text-xs text-ink-500">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-5">
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              placeholder="admin@erp.com"
              /**
               * {...register("email")} spreads onChange, onBlur, name and
               * ref onto the input — that's how react-hook-form tracks it
               * without controlled state.
               */
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-700">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              placeholder="••••••••"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-700">{errors.password.message}</p>
            )}
          </div>

          {/*
            Disabling while submitting prevents double-submits from an
            impatient second click — which on a slower endpoint would
            fire two requests.
          */}
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 rounded-md border border-ink-200 bg-white px-4 py-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
            Demo accounts
          </p>
          <ul className="space-y-0.5 text-xs text-ink-600 tnum">
            <li>admin@erp.com · sales@erp.com</li>
            <li>warehouse@erp.com · accounts@erp.com</li>
            <li className="pt-1 text-ink-500">Password: Password@123</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
