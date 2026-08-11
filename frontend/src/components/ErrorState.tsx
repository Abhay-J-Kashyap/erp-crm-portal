import { AlertCircle } from "lucide-react";
import { getErrorMessage } from "@/lib/api";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <AlertCircle className="h-5 w-5 text-red-600" />
      <p className="text-sm font-medium text-ink-700">Couldn't load this</p>
      {/* Say what went wrong. "Something went wrong" tells nobody anything. */}
      <p className="max-w-sm text-sm text-ink-500">{getErrorMessage(error)}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost mt-2">Try again</button>
      )}
    </div>
  );
}
