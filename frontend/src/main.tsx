import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import App from "@/App";
import "./index.css";

/**
 * PROVIDER NESTING ORDER MATTERS.
 * Inner providers can use outer ones, not the reverse.
 *   QueryClientProvider -> AuthProvider (auth's login calls the API)
 *   BrowserRouter       -> everything (components need navigation)
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s — avoids refetching on every mount
      // while tabbing around. Tune per-query where it matters.
      staleTime: 30_000,
      retry: 1,
      // Default is true, which refetches every time the user alt-tabs.
      // Noisy for an internal tool.
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * StrictMode intentionally double-invokes effects in DEVELOPMENT to
 * surface bugs from missing cleanup. If you see two network requests
 * locally and one in production, this is why — it is not a bug.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
