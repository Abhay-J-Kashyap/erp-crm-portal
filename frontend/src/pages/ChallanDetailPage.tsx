import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Ban } from "lucide-react";
import { api, unwrap, getErrorMessage } from "@/lib/api";
import type { Challan, ChallanItem, StockMovement } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";

type ChallanDetail = Challan & {
  items: ChallanItem[];
  stockMovements: Array<StockMovement & { product: { id: string; name: string; sku: string } }>;
  createdBy: { id: string; name: string; email: string };
};

export function ChallanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canConfirm = hasRole("ADMIN", "SALES", "WAREHOUSE");
  const canCancel = hasRole("ADMIN");

  const query = useQuery({
    queryKey: ["challan", id],
    queryFn: () => unwrap<ChallanDetail>(api.get(`/challans/${id}`)),
    enabled: Boolean(id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["challan", id] });
    queryClient.invalidateQueries({ queryKey: ["challans"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["product-stats"] });
    queryClient.invalidateQueries({ queryKey: ["challan-stats"] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => api.post(`/challans/${id}/confirm`),
    onSuccess: () => { invalidateAll(); setError(null); },
    // A 409 for insufficient stock surfaces here with the backend's
    // exact message naming the product and the shortfall.
    onError: (e) => setError(getErrorMessage(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/challans/${id}/cancel`, { reason: cancelReason }),
    onSuccess: () => {
      invalidateAll();
      setIsCancelOpen(false);
      setCancelReason("");
      setError(null);
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  if (query.isLoading) {
    return <div className="p-6"><div className="card h-64 animate-pulse bg-ink-100/50" /></div>;
  }

  if (query.isError || !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const challan = query.data;
  const isDraft = challan.status === "DRAFT";
  const isConfirmed = challan.status === "CONFIRMED";

  return (
    <>
      <PageHeader
        title={challan.challanNumber}
        subtitle={challan.customer.name}
        actions={
          <div className="flex gap-2">
            {/* Actions reflect the state machine: only drafts confirm,
                only non-cancelled cancel. */}
            {isDraft && canConfirm && (
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
                className="btn-primary"
              >
                <Check className="h-4 w-4" />
                {confirmMutation.isPending ? "Confirming…" : "Confirm & deduct stock"}
              </button>
            )}
            {(isDraft || isConfirmed) && canCancel && (
              <button onClick={() => setIsCancelOpen(true)} className="btn-ghost">
                <Ban className="h-4 w-4" />
                Cancel
              </button>
            )}
          </div>
        }
      />

      <div className="p-6">
        <Link
          to="/challans"
          className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All challans
        </Link>

        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Summary</h2>
            <dl className="space-y-2.5 text-sm">
              <Row label="Status"><StatusBadge status={challan.status} /></Row>
              <Row label="Customer">{challan.customer.name}</Row>
              <Row label="Mobile"><span className="tnum">{challan.customer.mobile}</span></Row>
              <Row label="Units"><span className="tnum">{challan.totalQuantity}</span></Row>
              <Row label="Value">
                <span className="tnum font-semibold">
                  ₹{Number(challan.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </Row>
              <Row label="Created by">{challan.createdBy.name}</Row>
              <Row label="Created">
                <span className="tnum">
                  {new Date(challan.createdAt).toLocaleString("en-IN")}
                </span>
              </Row>
              {challan.confirmedAt && (
                <Row label="Confirmed">
                  <span className="tnum">
                    {new Date(challan.confirmedAt).toLocaleString("en-IN")}
                  </span>
                </Row>
              )}
            </dl>
            {challan.remarks && (
              <p className="mt-3 whitespace-pre-line border-t border-ink-100 pt-3 text-sm text-ink-600">
                {challan.remarks}
              </p>
            )}
          </section>

          <section className="card lg:col-span-2">
            <div className="border-b border-ink-200 px-5 py-3">
              <h2 className="text-sm font-semibold">Items</h2>
              {/*
                These values are SNAPSHOTS taken when the challan was
                created. Editing the product later does not change them —
                that's the whole point of the design (Part 2).
              */}
              <p className="mt-0.5 text-xs text-ink-500">
                Names and prices as recorded when this challan was created
              </p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-2 font-medium">Product</th>
                  <th className="px-5 py-2 font-medium">SKU</th>
                  <th className="px-5 py-2 font-medium">Rate</th>
                  <th className="px-5 py-2 font-medium">Qty</th>
                  <th className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {challan.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-2.5 font-medium">{item.productName}</td>
                    <td className="px-5 py-2.5 tnum text-ink-600">{item.productSku}</td>
                    <td className="px-5 py-2.5 tnum">
                      ₹{Number(item.unitPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-2.5 tnum">{item.quantity}</td>
                    <td className="px-5 py-2.5 text-right tnum">
                      ₹{Number(item.lineTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-200 font-semibold">
                  <td className="px-5 py-2.5" colSpan={3}>Total</td>
                  <td className="px-5 py-2.5 tnum">{challan.totalQuantity}</td>
                  <td className="px-5 py-2.5 text-right tnum">
                    ₹{Number(challan.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {challan.stockMovements.length > 0 && (
            <section className="card lg:col-span-3">
              <h2 className="border-b border-ink-200 px-5 py-3 text-sm font-semibold">
                Stock movements
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-2 font-medium">Product</th>
                    <th className="px-5 py-2 font-medium">Direction</th>
                    <th className="px-5 py-2 font-medium">Qty</th>
                    <th className="px-5 py-2 font-medium">Stock after</th>
                    <th className="px-5 py-2 font-medium">Reason</th>
                    <th className="px-5 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {challan.stockMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5">{m.product.name}</td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`badge ${
                            m.movementType === "IN"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-ink-100 text-ink-700"
                          }`}
                        >
                          {m.movementType}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 tnum">{m.quantity}</td>
                      <td className="px-5 py-2.5 tnum">{m.stockAfter}</td>
                      <td className="px-5 py-2.5 text-ink-600">{m.reason}</td>
                      <td className="px-5 py-2.5 tnum text-ink-600">
                        {new Date(m.createdAt).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>

      <Modal open={isCancelOpen} onClose={() => setIsCancelOpen(false)} title="Cancel challan">
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {isConfirmed
              ? "Stock will be returned and the reversal recorded in the ledger."
              : "This draft will be marked cancelled. No stock is affected."}
          </p>

          <div>
            <label className="label">Reason</label>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="input"
              placeholder="Customer cancelled the order"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setIsCancelOpen(false)} className="btn-ghost">
              Keep challan
            </button>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelReason.trim().length < 3 || cancelMutation.isPending}
              className="btn-danger"
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel challan"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="text-right text-ink-800">{children}</dd>
    </div>
  );
}
