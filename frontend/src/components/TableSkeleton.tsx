export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-ink-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 flex-1 animate-pulse rounded bg-ink-100" />
          ))}
        </div>
      ))}
    </div>
  );
}
