import { useQuery } from "@tanstack/react-query";
import { Users, Package, FileText, AlertTriangle } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";

type CustomerStats = {
  total: number;
  dueFollowUps: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
};
type ProductStats = { totalProducts: number; lowStockCount: number; totalUnitsInStock: number };
type ChallanStats = {
  byStatus: Record<string, number>;
  confirmedValue: string;
  confirmedUnits: number;
};

function StatCard({
  label, value, icon: Icon, tone = "default",
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone?: "default" | "warn";
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <Icon className={`h-4 w-4 ${tone === "warn" ? "text-amber-600" : "text-ink-400"}`} />
      </div>
      <p className={`mt-2 text-2xl font-semibold tnum ${tone === "warn" ? "text-amber-700" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();

  /*
    Three independent queries. TanStack Query runs them in parallel and
    caches each under its own key, so navigating away and back is
    instant rather than refetching everything.
  */
  const customers = useQuery({
    queryKey: ["customer-stats"],
    queryFn: () => unwrap<CustomerStats>(api.get("/customers/stats")),
  });

  const products = useQuery({
    queryKey: ["product-stats"],
    queryFn: () => unwrap<ProductStats>(api.get("/products/stats")),
  });

  const challans = useQuery({
    queryKey: ["challan-stats"],
    queryFn: () => unwrap<ChallanStats>(api.get("/challans/stats")),
  });

  const isLoading = customers.isLoading || products.isLoading || challans.isLoading;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user?.name?.split(" ")[0] ?? "there"}`}
        subtitle="Today across customers, stock, and dispatch"
      />

      <div className="p-6">
        {isLoading ? (
          /*
            Skeletons rather than a spinner: the layout doesn't shift when
            data arrives, so the page doesn't jump under the reader.
          */
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card h-24 animate-pulse bg-ink-100/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Customers" value={customers.data?.total ?? 0} icon={Users} />
            <StatCard
              label="Follow-ups due"
              value={customers.data?.dueFollowUps ?? 0}
              icon={FileText}
              tone={(customers.data?.dueFollowUps ?? 0) > 0 ? "warn" : "default"}
            />
            <StatCard label="Products" value={products.data?.totalProducts ?? 0} icon={Package} />
            <StatCard
              label="Low stock"
              value={products.data?.lowStockCount ?? 0}
              icon={AlertTriangle}
              tone={(products.data?.lowStockCount ?? 0) > 0 ? "warn" : "default"}
            />
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Challans</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(challans.data?.byStatus ?? {}).map(([status, count]) => (
                <div key={status} className="flex justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600">{status}</dt>
                  <dd className="font-medium tnum">{count}</dd>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <dt className="text-ink-600">Confirmed value</dt>
                <dd className="font-semibold tnum">
                  ₹{Number(challans.data?.confirmedValue ?? 0).toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold">Customers by status</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(customers.data?.byStatus ?? {}).map(([status, count]) => (
                <div key={status} className="flex justify-between border-b border-ink-100 pb-2">
                  <dt className="text-ink-600">{status}</dt>
                  <dd className="font-medium tnum">{count}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
