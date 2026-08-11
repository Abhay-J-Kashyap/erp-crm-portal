import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  open, onClose, title, children, wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  /**
   * Escape to close. The cleanup removes the listener when the modal
   * unmounts — without it, every open/close cycle leaks another
   * listener and eventually Escape fires the handler many times.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 pt-12">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} shadow-lg`}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
