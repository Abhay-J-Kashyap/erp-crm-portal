import type { ChallanStatus, CustomerStatus } from "@/lib/types";

/**
 * A LOOKUP OBJECT instead of a chain of if/else.
 * Adding a status means adding one line here, and TypeScript's Record
 * type will ERROR if you add a status to the union and forget to give
 * it a colour. Exhaustiveness checked by the compiler.
 */
const STYLES: Record<CustomerStatus | ChallanStatus, string> = {
  LEAD: "bg-amber-50 text-amber-800",
  ACTIVE: "bg-emerald-50 text-emerald-800",
  INACTIVE: "bg-ink-100 text-ink-600",
  DRAFT: "bg-ink-100 text-ink-700",
  CONFIRMED: "bg-emerald-50 text-emerald-800",
  CANCELLED: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: CustomerStatus | ChallanStatus }) {
  return <span className={`badge ${STYLES[status]}`}>{status}</span>;
}
