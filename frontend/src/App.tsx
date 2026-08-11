import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ChallansPage } from "@/pages/ChallansPage";
import { ChallanDetailPage } from "@/pages/ChallanDetailPage";
import { ForbiddenPage } from "@/pages/ForbiddenPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

/**
 * ROUTING STRUCTURE
 * -----------------
 * /login sits OUTSIDE the protected tree — it must render for people
 * who aren't authenticated.
 *
 * Everything else nests inside one <ProtectedRoute><Layout/></ProtectedRoute>,
 * so the guard and the sidebar are declared ONCE. A route added below is
 * protected by default — the same fail-closed principle as
 * router.use(authenticate) on the backend.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/challans" element={<ChallansPage />} />
        <Route path="/challans/:id" element={<ChallanDetailPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
