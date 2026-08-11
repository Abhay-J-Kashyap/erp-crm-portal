import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ForbiddenPage } from "@/pages/ForbiddenPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

/**
 * ROUTING STRUCTURE
 * -----------------
 * /login sits OUTSIDE the protected tree — it must render for people
 * who aren't authenticated yet.
 *
 * Everything else nests inside one <ProtectedRoute><Layout/></ProtectedRoute>.
 * Nesting means the guard and the sidebar are declared ONCE rather than
 * repeated per page, so a new page added below is protected by default —
 * the same fail-closed principle as router.use(authenticate) in Part 5.
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
        {/* Customers, Products and Challans pages land here in Part 9 */}
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
