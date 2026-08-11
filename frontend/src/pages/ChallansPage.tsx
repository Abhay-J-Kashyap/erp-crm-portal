import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Search, Trash2 } from "lucide-react";
import { api, unwrap, unwrapWithMeta, getErrorMessage } from "@/lib/api";
import type { Challan, Customer, Product } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/context/AuthContext";

type ChallanForm = {
  customerId: string;
  status: "DRAFT" | "CONFIRMED";
  remarks: string;
  items: Array<{ productId: string; quantity: number }>;
};

export function ChallansPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "";

  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const debouncedSearch = useDebounce(searchInput);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canCreate = hasRole("ADMIN", "SALES");

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const listQuery = useQuery({
    queryKey: ["challans", page, debouncedSearch, status],
    queryFn: () =>
      unwrapWithMeta<Challan[]>(
        api.get("/challans", {
          params: {
            page,
            limit: 10,
            search: debouncedSearch || undefined,
            status: status || undefined,
          },
        })
      ),
    placeholderData: (previous) => previous,
  });

  /**
   * Dropdown data. `enabled: isFormOpen` means these only fetch when the
   * modal opens — no point loading every customer and product on a page
   * where the user may never click "New challan".
   */
  const customersQuery = useQuery({
    queryKey: ["customers", "all"],
    queryFn: () => unwrap<Customer[]>(api.get("/customers", { params: { limit: 100 } })),
    enabled: isFormOpen,
  });

  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => unwrap<Product[]>(api.get("/products", { params: { limit: 100 } })),
    enabled: isFormOpen,
  });

  const form = useForm<ChallanForm>({
    defaultValues: {
      customerId: "",
      status: "DRAFT",
      remarks: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });

  /**
   * useFieldArray manages a DYNAMIC LIST of form fields.
   *
   * Doing this with plain useState means writing add/remove/update
   * handlers by hand and threading indices through every input. This
   * gives you `fields` (with stable keys), `append`, and `remove`.
   *
   * IMPORTANT: use `field.id` as the React key, NOT the array index.
   * Index keys break on removal — delete row 1 of 3 and React reuses the
   * DOM node, so the wrong input keeps focus and the wrong values render.
   */
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  /**
   * useWatch subscribes to specific fields for LIVE totals. Using
   * form.watch() would re-render the whole form on every keystroke;
   * this re-renders only what depends on `items`.
   */
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const products = productsQuery.data ?? [];

  // Derived, not stored in state. Any value you can compute from
  // existing state should be computed — storing it means keeping two
  // things in sync, which is a bug waiting to happen.
  const totals = (watchedItems ?? []).reduce(
    (acc, item) => {
      const product = products.find((p) => p.id === item?.productId);
      const qty = Number(item?.quantity) || 0;
      if (!product) return acc;
      return {
        quantity: acc.quantity + qty,
        amount: acc.amount + Number(product.unitPrice) * qty,
      };
    },
    { quantity: 0, amount: 0 }
  );

  const createChallan = useMutation({
    mutationFn: (values: ChallanForm) =>
      api.post("/challans", {
        customerId: values.customerId,
        status: values.status,
        remarks: values.remarks || undefined,
        items: values.items
          .filter((i) => i.productId)
          .map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challans"] });
      queryClient.invalidateQueries({ queryKey: ["challan-stats"] });
      // Stock changed if it was confirmed, so refresh products too.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
      setIsFormOpen(false);
      form.reset();
      setFormError(null);
    },
    onError: (e) => setFormError(getErrorMessage(e)),
  });

  const challans = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <PageHeader
        title="Challans"
        subtitle="Delivery notes and dispatch"
        actions={
          canCreate && (
            <button
              onClick={() => { setFormError(null); setIsFormOpen(true); }}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" />
              New challan
            </button>
          )
        }
      />

      <div className="p-6">
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
              <input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  updateParam("search", e.target.value);
                }}
                placeholder="Search challan number or customer…"
                className="input pl-8"
                aria-label="Search challans"
              />
            </div>

            <select
              value={status}
              onChange={(e) => updateParam("status", e.target.value)}
              className="input w-auto"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {listQuery.isLoading ? (
            <TableSkeleton cols={6} />
          ) : listQuery.isError ? (
            <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
          ) : challans.length === 0 ? (
            <EmptyState
              title="No challans yet"
              description="Create one to record a dispatch and deduct stock."
              action={
                canCreate ? (
                  <button onClick={() => setIsFormOpen(true)} className="btn-primary">
                    New challan
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2.5 font-medium">Number</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Items</th>
                    <th className="px-4 py-2.5 font-medium">Value</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {challans.map((challan) => (
                    <tr key={challan.id} className="hover:bg-ink-50/60">
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/challans/${challan.id}`}
                          className="font-medium tnum hover:text-petrol-700"
                        >
                          {challan.challanNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <p>{challan.customer.name}</p>
                        {challan.customer.businessName && (
                          <p className="text-xs text-ink-500">{challan.customer.businessName}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={challan.status} /></td>
                      <td className="px-4 py-2.5 tnum text-ink-600">
                        {challan._count?.items ?? 0}
                      </td>
                      <td className="px-4 py-2.5 tnum">
                        ₹{Number(challan.totalAmount).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-2.5 tnum text-ink-600">
                        {new Date(challan.createdAt).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && <Pagination meta={meta} onPageChange={(p) => updateParam("page", String(p))} />}
        </div>
      </div>

      <Modal open={isFormOpen} onClose={() => setIsFormOpen(false)} title="New challan" wide>
        <form
          onSubmit={form.handleSubmit((v) => createChallan.mutate(v))}
          className="space-y-4"
        >
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Customer</label>
              <select className="input" {...form.register("customerId", { required: true })}>
                <option value="">Select a customer</option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.businessName ? ` — ${c.businessName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Save as</label>
              <select className="input" {...form.register("status")}>
                <option value="DRAFT">Draft — no stock movement</option>
                <option value="CONFIRMED">Confirmed — deduct stock now</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Items</label>
              <button
                type="button"
                onClick={() => append({ productId: "", quantity: 1 })}
                className="text-xs font-medium text-petrol-700 hover:underline"
              >
                Add line
              </button>
            </div>

            <div className="space-y-2">
              {fields.map((field, index) => {
                const selectedId = watchedItems?.[index]?.productId;
                const product = products.find((p) => p.id === selectedId);
                const qty = Number(watchedItems?.[index]?.quantity) || 0;
                const exceedsStock = product ? qty > product.currentStock : false;

                return (
                  // key = field.id, NEVER index — see the note above
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="flex-1">
                      <select
                        className="input"
                        {...form.register(`items.${index}.productId` as const)}
                      >
                        <option value="">Select a product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) — {p.currentStock} in stock
                          </option>
                        ))}
                      </select>
                      {exceedsStock && (
                        <p className="mt-1 text-xs text-amber-700">
                          Only {product?.currentStock} in stock. Confirming will fail.
                        </p>
                      )}
                    </div>

                    <input
                      type="number"
                      min={1}
                      className="input tnum w-24"
                      {...form.register(`items.${index}.quantity` as const)}
                    />

                    <div className="w-28 pt-2 text-right text-sm tnum text-ink-600">
                      {product ? `₹${(Number(product.unitPrice) * qty).toLocaleString("en-IN")}` : "—"}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      className="mt-1.5 text-ink-400 hover:text-red-600 disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-ink-50 px-4 py-3">
            <span className="text-sm text-ink-600">
              {totals.quantity} unit{totals.quantity === 1 ? "" : "s"}
            </span>
            <span className="text-base font-semibold tnum">
              ₹{totals.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div>
            <label className="label">Remarks</label>
            <input className="input" placeholder="Optional" {...form.register("remarks")} />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={createChallan.isPending} className="btn-primary">
              {createChallan.isPending ? "Creating…" : "Create challan"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
