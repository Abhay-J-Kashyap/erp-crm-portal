import type { ReactNode } from "react";

/**
 * An empty screen is an invitation to act, not a dead end. Say what
 * would be here and how to put something here.
 */
export function EmptyState({
  title, description, action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink-700">{title}</p>
      <p className="max-w-xs text-sm text-ink-500">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
