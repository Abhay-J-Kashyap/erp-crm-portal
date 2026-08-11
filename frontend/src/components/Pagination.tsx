import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationMeta } from "@/lib/types";

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  if (meta.totalPages <= 1) return null;

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3">
      <p className="text-xs text-ink-500 tnum">
        {from}–{to} of {meta.total}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(meta.page - 1)}
          disabled={!meta.hasPrevPage}
          className="btn-ghost px-2 py-1"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="px-2 text-xs text-ink-600 tnum">
          {meta.page} / {meta.totalPages}
        </span>

        <button
          onClick={() => onPageChange(meta.page + 1)}
          disabled={!meta.hasNextPage}
          className="btn-ghost px-2 py-1"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
