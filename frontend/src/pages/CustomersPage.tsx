import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search } from "lucide-react";
import { api, unwrapWithMeta, getErrorMessage } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/context/AuthContext";

/** Mirrors the backend's createCustomerSchema. */
const customerFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile starting with 6-9"),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  businessName: z.string().max(160).or(z.literal("")),
  gstNumber: z
    .string()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/, "Format: 29ABCDE1234F1Z5")
    .or(z.literal("")),
  customerType: z.enum(["RETAIL", "WHOLESALE", "DISTRIBUTOR"]),
  city: z.string().max(80).or(z.literal("")),
  state: z.string().max(80).or(z.literal("")),
  status: z.enum(["LEAD", "ACTIVE", "INACTIVE"]),
  followUpDate: z.string().or(z.literal("")),
});

type CustomerForm = z.infer<typeof customerFormSchema>;

const EMPTY_FORM: CustomerForm = {
  name: "", mobile: "", email: "", businessName: "", gstNumber: "",
  customerType: "RETAIL", city: "", state: "", status: "LEAD", followUpDate: "",
};

export function CustomersPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();

  /**
   * FILTERS LIVE IN THE URL, not useState.
   *
   * Three things this buys you for free:
   *   - the filtered view is bookmarkable and shareable
   *   - the browser Back button undoes a filter change
   *   - refreshing keeps your place
   *
   * It also makes the query key derive straight from the URL, so
   * navigating back to a previous page is an instant cache hit.
   */
  const [params, setParams] = useSearchParams();

  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "";
  const customerType = params.get("type") ?? "";

  // The input is client state (updates per keystroke); the debounced
  // value is what actually drives the request.
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const debouncedSearch = useDebounce(searchInput);

  const [editing, setEditing] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canWrite = hasRole("ADMIN", "SALES");

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change resets to page 1 — otherwise you can land on
    // page 5 of a result set that now has 2 pages, and see nothing.
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const listQuery = useQuery({
    /**
     * THE QUERY KEY IS A CACHE KEY.
     * Every value the request depends on must be in it. Change the page
     * and it fetches; go back and it's served from cache. Omit a value
     * here and you get stale data when only that value changes.
     */
    queryKey: ["customers", page, debouncedSearch, status, customerType],
    queryFn: () =>
      unwrapWithMeta<Customer[]>(
        api.get("/customers", {
          params: {
            page,
            limit: 10,
            search: debouncedSearch || undefined,
            status: status || undefined,
            customerType: customerType || undefined,
          },
        })
      ),
    // Keeps the previous page visible while the next one loads, instead
    // of flashing a skeleton on every pagination click.
    placeholderData: (previous) => previous,
  });

  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: EMPTY_FORM,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerForm) => {
      // Strip empty strings so the backend stores NULL, not "".
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== "")
      );

      if (editing) {
        return api.patch(`/customers/${editing.id}`, payload);
      }
      return api.post("/customers", payload);
    },
    onSuccess: () => {
      /**
       * INVALIDATE THE CACHE, or the list keeps showing stale data and
       * the user thinks the save failed.
       *
       * The key is hierarchical: invalidating ["customers"] also
       * invalidates ["customers", 2, "steel", ...]. One call refreshes
       * every page and filter combination.
       */
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      closeForm();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    form.reset(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setFormError(null);
    form.reset({
      name: customer.name,
      mobile: customer.mobile,
      email: customer.email ?? "",
      businessName: customer.businessName ?? "",
      gstNumber: customer.gstNumber ?? "",
      customerType: customer.customerType,
      city: customer.city ?? "",
      state: customer.state ?? "",
      status: customer.status,
      // The API returns a full ISO timestamp; <input type="date"> wants
      // just YYYY-MM-DD.
      followUpDate: customer.followUpDate?.slice(0, 10) ?? "",
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const customers = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Leads, active accounts, and follow-ups"
        actions={
          canWrite && (
            <button onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add customer
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
                placeholder="Search name, mobile, business, GST…"
                className="input pl-8"
                aria-label="Search customers"
              />
            </div>

            <select
              value={status}
              onChange={(e) => updateParam("status", e.target.value)}
              className="input w-auto"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="LEAD">Lead</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <select
              value={customerType}
              onChange={(e) => updateParam("type", e.target.value)}
              className="input w-auto"
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              <option value="RETAIL">Retail</option>
              <option value="WHOLESALE">Wholesale</option>
              <option value="DISTRIBUTOR">Distributor</option>
            </select>
          </div>

          {listQuery.isLoading ? (
            <TableSkeleton cols={5} />
          ) : listQuery.isError ? (
            <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
          ) : customers.length === 0 ? (
            <EmptyState
              title="No customers match this view"
              description={
                searchInput || status || customerType
                  ? "Try clearing the search or filters."
                  : "Add your first customer to get started."
              }
              action={
                canWrite && !searchInput ? (
                  <button onClick={openCreate} className="btn-primary">Add customer</button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Mobile</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Follow-up</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {customers.map((customer) => (
                    // key = the stable database id, never the array index
                    <tr key={customer.id} className="hover:bg-ink-50/60">
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/customers/${customer.id}`}
                          className="font-medium text-ink-900 hover:text-petrol-700"
                        >
                          {customer.name}
                        </Link>
                        {customer.businessName && (
                          <p className="text-xs text-ink-500">{customer.businessName}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tnum text-ink-600">{customer.mobile}</td>
                      <td className="px-4 py-2.5 text-ink-600">{customer.customerType}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={customer.status} />
                      </td>
                      <td className="px-4 py-2.5 tnum text-ink-600">
                        {customer.followUpDate
                          ? new Date(customer.followUpDate).toLocaleDateString("en-IN")
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canWrite && (
                          <button
                            onClick={() => openEdit(customer)}
                            className="text-xs font-medium text-petrol-700 hover:underline"
                          >
                            Edit
                          </button>
                        )}
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

      <Modal
        open={isFormOpen}
        onClose={closeForm}
        title={editing ? `Edit ${editing.name}` : "Add customer"}
      >
        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="space-y-3"
        >
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={form.formState.errors.name?.message}>
              <input className="input" {...form.register("name")} />
            </Field>

            <Field label="Mobile" error={form.formState.errors.mobile?.message}>
              <input className="input tnum" {...form.register("mobile")} />
            </Field>

            <Field label="Email" error={form.formState.errors.email?.message}>
              <input type="email" className="input" {...form.register("email")} />
            </Field>

            <Field label="Business name" error={form.formState.errors.businessName?.message}>
              <input className="input" {...form.register("businessName")} />
            </Field>

            <Field label="GST number" error={form.formState.errors.gstNumber?.message}>
              <input className="input uppercase" {...form.register("gstNumber")} />
            </Field>

            <Field label="Type">
              <select className="input" {...form.register("customerType")}>
                <option value="RETAIL">Retail</option>
                <option value="WHOLESALE">Wholesale</option>
                <option value="DISTRIBUTOR">Distributor</option>
              </select>
            </Field>

            <Field label="City"><input className="input" {...form.register("city")} /></Field>
            <Field label="State"><input className="input" {...form.register("state")} /></Field>

            <Field label="Status">
              <select className="input" {...form.register("status")}>
                <option value="LEAD">Lead</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>

            <Field label="Follow-up date">
              <input type="date" className="input" {...form.register("followUpDate")} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeForm} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
              {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add customer"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Small local component — label, input slot, and error in one place. */
function Field({
  label, error, children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
