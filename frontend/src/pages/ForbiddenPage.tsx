import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <ShieldOff className="h-8 w-8 text-ink-400" />
      <h1 className="text-lg font-semibold">You don't have access to this page</h1>
      <p className="max-w-sm text-sm text-ink-500">
        Your role doesn't include this area. Ask an administrator if you need it.
      </p>
      <Link to="/" className="btn-ghost mt-2">Back to dashboard</Link>
    </div>
  );
}
