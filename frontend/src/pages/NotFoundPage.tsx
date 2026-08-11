import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-ink-400">404</p>
      <h1 className="text-lg font-semibold">This page doesn't exist</h1>
      <Link to="/" className="btn-ghost mt-2">Back to dashboard</Link>
    </div>
  );
}
