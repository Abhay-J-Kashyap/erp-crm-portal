import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Package, FileText, LogOut, Boxes } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Products", icon: Package },
  { to: "/challans", label: "Challans", icon: FileText },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-ink-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-4">
          <Boxes className="h-5 w-5 text-petrol-700" />
          <span className="text-sm font-semibold tracking-tight">Operations</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {/*
            Rendering a list requires a `key` — a stable identity so React
            can match elements between renders. Using the array index
            breaks when the list reorders; prefer a real id.
          */}
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-petrol-50 font-medium text-petrol-800"
                    : "text-ink-600 hover:bg-ink-50"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-200 p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-ink-500">{user?.role}</p>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full text-xs">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        {/*
          <Outlet /> is where React Router renders the matched child
          route. The sidebar stays mounted across navigations, so it
          never flickers and keeps its state.
        */}
        <Outlet />
      </main>
    </div>
  );
}
