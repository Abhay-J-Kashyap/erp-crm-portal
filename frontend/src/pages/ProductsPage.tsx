import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, AlertTriangle, ArrowUpDown } from "lucide-react";
import { api, unwrapWithMeta, getErrorMessage } from "@/lib/api";
import type { Product } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/context/AuthContext";

const productFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z.string().min(2, "SKU is required").regex(/^[A-Za-z0-9\-_]+$/, "Letters, numbers, - and _ only"),
  category: z.string().or(z.literal("")),
  unitPrice: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Up to 2 decimal places"),
  openingStock: z.coerce.number().int().min(0),
  minStockAlert: z.coerce.number().int().min(0),
  location: z.string().or(z.literal("")),
});

type ProductForm = z.infer<typeof productFormSchema>;

const stockFormSchema = z.object({
  quantity: z.coerce.number().int().positive("Enter a quantity above zero"),
  movementType: z.enum(["IN", "OUT"]),
  reason: z.string().min(3, "Say why stock is moving"),
});

type StockForm = z.infer<typeof stockFormSchema>;

export function ProductsPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const page = Number(params.get("page") ?? 1);
  const lowStock = params.get("lowStock") === "true";

  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const debouncedSearch = useDebounce(searchInput);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = hasRole("ADMIN", "WAREHOUSE");

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const listQuery = useQuery({
    queryKey: ["products", page, debouncedSearch, lowStock],
    queryFn: () =>
      unwrapWithMeta<Product[]>(
        api.get("/products", {
          params: {
            page,
            limit: 10,
            search: debouncedSearch || undefined,
            lowStock: lowStock ? "true" : undefined,
          },
        })
      ),
    placeholderData: (previous) => previous,
  });

  const productForm = useForm<ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "", sku: "", category: "", unitPrice: "",
      openingStock: 0, minStockAlert: 0, location: "",
    },
  });

  const stockForm = useForm<StockForm>({
    resolver: zodResolver(stockFormSchema),
    defaultValues: { quantity: 1, movementType: "IN", reason: "" },
  });

  const createProduct = useMutation({
    mutationFn: (values: ProductForm) =>
      api.post("/products", {
        ...values,
        category: values.category || undefined,
        location: values.location || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
      setIsFormOpen(false);
      productForm.reset();
      setFormError(null);
    },
    onError: (e) => setFormError(getErrorMessage(e)),
  });

  const adjustStock = useMutation({
    mutationFn: (values: StockForm) =>
      api.post(`/products/${stockTarget?.id}/stock`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
      setStockTarget(null);
      stockForm.reset({ quantity: 1, movementType: "IN", reason: "" });
      setFormError(null);
    },
    /**
     * The 409 from an oversell attempt lands here, and getErrorMessage
     * surfaces the backend's exact wording — "Insufficient stock for
     * Cement Bag 50kg. Available: 25, requested: 9999". Far more useful
     * than a generic failure toast, and it costs nothing because the
     * API was designed to return it.
     */
    onError: (e) => setFormError(getErrorMessage(e)),
  });

  const products = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Catalogue and stock on hand"
        actions={
          canManage && (
            <button onClick={() => { setFormError(null); setIsFormOpen(true); }} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add product
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
                placeholder="Search name, SKU, category…"
                className="input pl-8"
                aria-label="Search products"
              />
            </div>

            <button
              onClick={() => updateParam("lowStock", lowStock ? "" : "true")}
              className={lowStock ? "btn-primary" : "btn-ghost"}
            >
              <AlertTriangle className="h-4 w-4" />
              Low stock only
            </button>
          </div>

          {listQuery.isLoading ? (
            <TableSkeleton cols={6} />
          ) : listQuery.isError ? (
            <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
          ) : products.length === 0 ? (
            <EmptyState
              title="No products match this view"
              description={
                lowStock
                  ? "Nothing is below its alert threshold right now."
                  : "Add a product to start tracking stock."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">SKU</th>
                    <th className="px-4 py-2.5 font-medium">Price</th>
                    <th className="px-4 py-2.5 font-medium">In stock</th>
                    <th className="px-4 py-2.5 font-medium">Alert at</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {products.map((product) => {
                    const isLow = product.currentStock <= product.minStockAlert;
                    return (
                      <tr key={product.id} className="hover:bg-ink-50/60">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{product.name}</p>
                          {product.category && (
                            <p className="text-xs text-ink-500">{product.category}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 tnum text-ink-600">{product.sku}</td>
                        <td className="px-4 py-2.5 tnum">
                          ₹{Number(product.unitPrice).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`tnum font-medium ${isLow ? "text-amber-700" : ""}`}>
                            {product.currentStock}
                          </span>
                          {isLow && (
                            <span className="badge ml-2 bg-amber-50 text-amber-800">Low</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 tnum text-ink-500">{product.minStockAlert}</td>
                        <td className="px-4 py-2.5 text-right">
                          {canManage && (
                            <button
                              onClick={() => { setFormError(null); setStockTarget(product); }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-petrol-700 hover:underline"
                            >
                              <ArrowUpDown className="h-3 w-3" />
                              Adjust
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {meta && <Pagination meta={meta} onPageChange={(p) => updateParam("page", String(p))} />}
        </div>
      </div>

      {/* --- Add product --- */}
      <Modal open={isFormOpen} onClose={() => setIsFormOpen(false)} title="Add product">
        <form
          onSubmit={productForm.handleSubmit((v) => createProduct.mutate(v))}
          className="space-y-3"
        >
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input className="input" {...productForm.register("name")} />
              {productForm.formState.errors.name && (
                <p className="mt-1 text-xs text-red-700">
                  {productForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">SKU</label>
              <input className="input uppercase tnum" {...productForm.register("sku")} />
              {productForm.formState.errors.sku && (
                <p className="mt-1 text-xs text-red-700">
                  {productForm.formState.errors.sku.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">Category</label>
              <input className="input" {...productForm.register("category")} />
            </div>

            <div>
              <label className="label">Unit price</label>
              <input className="input tnum" placeholder="450.00" {...productForm.register("unitPrice")} />
              {productForm.formState.errors.unitPrice && (
                <p className="mt-1 text-xs text-red-700">
                  {productForm.formState.errors.unitPrice.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">Opening stock</label>
              <input type="number" className="input tnum" {...productForm.register("openingStock")} />
            </div>

            <div>
              <label className="label">Alert below</label>
              <input type="number" className="input tnum" {...productForm.register("minStockAlert")} />
            </div>

            <div className="sm:col-span-2">
              <label className="label">Location</label>
              <input className="input" placeholder="Warehouse A" {...productForm.register("location")} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={createProduct.isPending} className="btn-primary">
              {createProduct.isPending ? "Saving…" : "Add product"}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- Adjust stock --- */}
      <Modal
        open={Boolean(stockTarget)}
        onClose={() => setStockTarget(null)}
        title={stockTarget ? `Adjust stock — ${stockTarget.name}` : ""}
      >
        <form
          onSubmit={stockForm.handleSubmit((v) => adjustStock.mutate(v))}
          className="space-y-3"
        >
          {formError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          )}

          <p className="text-sm text-ink-600">
            Currently <span className="font-medium tnum">{stockTarget?.currentStock}</span> in stock.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Direction</label>
              <select className="input" {...stockForm.register("movementType")}>
                <option value="IN">Stock in</option>
                <option value="OUT">Stock out</option>
              </select>
            </div>

            <div>
              <label className="label">Quantity</label>
              <input type="number" min={1} className="input tnum" {...stockForm.register("quantity")} />
              {stockForm.formState.errors.quantity && (
                <p className="mt-1 text-xs text-red-700">
                  {stockForm.formState.errors.quantity.message}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="label">Reason</label>
              <input
                className="input"
                placeholder="Purchase order PO-1042 received"
                {...stockForm.register("reason")}
              />
              {stockForm.formState.errors.reason && (
                <p className="mt-1 text-xs text-red-700">
                  {stockForm.formState.errors.reason.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setStockTarget(null)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={adjustStock.isPending} className="btn-primary">
              {adjustStock.isPending ? "Applying…" : "Apply adjustment"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
