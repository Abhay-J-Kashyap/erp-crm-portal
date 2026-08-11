import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { api, unwrap, getErrorMessage } from "@/lib/api";
import type { Customer, Challan } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";

type FollowUp = {
  id: string;
  note: string;
  createdAt: string;
  createdBy: { id: string; name: string };
};

type CustomerDetail = Customer & {
  followUps: FollowUp[];
  challans: Array<Pick<Challan, "id" | "challanNumber" | "status" | "totalQuantity" | "totalAmount" | "createdAt">>;
  createdBy: { id: string; name: string; email: string };
};

export function CustomerDetailPage() {
  // useParams reads the :id segment from the route path.
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canWrite = hasRole("ADMIN", "SALES");

  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: () => unwrap<CustomerDetail>(api.get(`/customers/${id}`)),
    // Don't fire the request until the param exists.
    enabled: Boolean(id),
  });

  const addFollowUp = useMutation({
    mutationFn: () =>
      api.post(`/customers/${id}/follow-ups`, {
        note,
        nextFollowUpDate: nextDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsNoteOpen(false);
      setNote("");
      setNextDate("");
      setError(null);
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  if (query.isLoading) {
    return (
      <div className="p-6">
        <div className="card h-64 animate-pulse bg-ink-100/50" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const customer = query.data;

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={customer.businessName ?? customer.mobile}
        actions={
          canWrite && (
            <button onClick={() => setIsNoteOpen(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              Log follow-up
            </button>
          )
        }
      />

      <div className="p-6">
        <Link
          to="/customers"
          className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All customers
        </Link>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card p-5 lg:col-span-1">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="space-y-2.5 text-sm">
              <Row label="Status"><StatusBadge status={customer.status} /></Row>
              <Row label="Type">{customer.customerType}</Row>
              <Row label="Mobile"><span className="tnum">{customer.mobile}</span></Row>
              <Row label="Email">{customer.email ?? "—"}</Row>
              <Row label="GST"><span className="tnum">{customer.gstNumber ?? "—"}</span></Row>
              <Row label="City">{[customer.city, customer.state].filter(Boolean).join(", ") || "—"}</Row>
              <Row label="Follow-up">
                <span className="tnum">
                  {customer.followUpDate
                    ? new Date(customer.followUpDate).toLocaleDateString("en-IN")
                    : "—"}
                </span>
              </Row>
              <Row label="Added by">{customer.createdBy.name}</Row>
            </dl>
          </section>

          <section className="card lg:col-span-2">
            <h2 className="border-b border-ink-200 px-5 py-3 text-sm font-semibold">
              Follow-ups
            </h2>

            {customer.followUps.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">
                No follow-ups logged yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {customer.followUps.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <p className="text-sm text-ink-800">{f.note}</p>
                    <p className="mt-1 text-xs text-ink-500 tnum">
                      {f.createdBy.name} · {new Date(f.createdAt).toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card lg:col-span-3">
            <h2 className="border-b border-ink-200 px-5 py-3 text-sm font-semibold">
              Recent challans
            </h2>

            {customer.challans.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">
                No challans for this customer yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-2 font-medium">Number</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Units</th>
                    <th className="px-5 py-2 font-medium">Value</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {customer.challans.map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-2.5">
                        <Link to={`/challans/${c.id}`} className="font-medium hover:text-petrol-700">
                          {c.challanNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5"><StatusBadge status={c.status} /></td>
                      <td className="px-5 py-2.5 tnum">{c.totalQuantity}</td>
                      <td className="px-5 py-2.5 tnum">
                        {/* Decimal arrives as a STRING — convert explicitly */}
                        ₹{Number(c.totalAmount).toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-2.5 tnum text-ink-600">
                        {new Date(c.createdAt).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

      <Modal open={isNoteOpen} onClose={() => setIsNoteOpen(false)} title="Log a follow-up">
        <div className="space-y-3">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div>
            <label className="label">What happened</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="input"
              placeholder="Called about the pipe order. Wants a quote for 200 units."
            />
          </div>

          <div>
            <label className="label">Next follow-up</label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setIsNoteOpen(false)} className="btn-ghost">Cancel</button>
            <button
              onClick={() => addFollowUp.mutate()}
              disabled={note.trim().length === 0 || addFollowUp.isPending}
              className="btn-primary"
            >
              {addFollowUp.isPending ? "Saving…" : "Log follow-up"}
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
