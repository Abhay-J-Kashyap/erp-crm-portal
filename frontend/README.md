# Frontend — ERP + CRM Operations Portal

React single-page application for the operations portal. Talks to the Express
API in [`../backend`](../backend).

For project-wide setup, architecture, and design decisions, see the
[root README](../README.md).

## Tech stack

| Concern      | Choice | Why |
| ------------ | ------ | --- |
| Build tool   | Vite | Fast dev server, native ESM, no config ceremony |
| Framework    | React 18 | — |
| Language     | TypeScript (strict) | — |
| Routing      | React Router v6 | Nested routes, so the layout and auth guard are declared once |
| Server state | TanStack Query | Caching, deduplication, and race-condition handling that `useEffect` fetching doesn't give you |
| Forms        | React Hook Form + Zod | Uncontrolled inputs avoid a re-render per keystroke; Zod schemas mirror the backend's |
| HTTP         | Axios | Interceptors for token attachment and 401 handling |
| Styling      | Tailwind CSS | — |
| Icons        | lucide-react | — |

## Running locally

Requires the backend to be running. Node.js 18+.

```bash
npm install
```

Create `.env`:

```
VITE_API_URL=http://localhost:4000/api
```

```bash
npm run dev
```

Opens on `http://localhost:5173`. Sign in with `admin@erp.com` / `Password@123`;
the login screen lists the other demo accounts.

## Scripts

| Command             | What it does |
| ------------------- | ------------ |
| `npm run dev`       | Dev server with hot module replacement |
| `npm run build`     | Type-check, then build to `dist/` |
| `npm run preview`   | Serve the production build locally |
| `npm run typecheck` | Type-check without emitting |

## Structure

```
src/
├── components/
│   ├── Layout.tsx           # sidebar shell; renders child routes via <Outlet />
│   ├── PageHeader.tsx
│   ├── ProtectedRoute.tsx   # auth + role guard
│   └── StatusBadge.tsx
├── context/
│   └── AuthContext.tsx      # user state, login/logout, session restore
├── lib/
│   ├── api.ts               # axios instance, interceptors, error helpers
│   └── types.ts             # types mirroring the API contract
├── pages/                   # route-level screens
├── App.tsx                  # route definitions
├── main.tsx                 # provider composition
└── index.css                # Tailwind layers + component classes
```

## How things fit together

**Provider order** (`main.tsx`) matters, because inner providers can use outer
ones:

```
QueryClientProvider → BrowserRouter → AuthProvider → App
```

`AuthProvider` sits inside `QueryClientProvider` because logging in calls the
API, and inside `BrowserRouter` because components below it navigate.

**Authentication** is a JWT in `localStorage`. An axios request interceptor
attaches it to every outgoing request; a response interceptor catches `401`,
clears the token, and redirects to `/login`. No component handles either
concern.

On page load, `AuthContext` calls `GET /auth/me` to verify the stored token
rather than trusting it — the token may have expired or the account may have
been deactivated since login.

**Auth has three states, not two:** loading, logged out, and logged in.
`ProtectedRoute` checks `isLoading` before `user`. Skipping that check logs the
user out on every page refresh, because during verification `user` is still
`null` and looks identical to "not signed in".

**Route protection** is declared once. Every authenticated page nests inside a
single `<ProtectedRoute><Layout /></ProtectedRoute>`, so a new route added there
is protected by default. Per-route guards fail open — forget one and the page is
silently public.

**Role checks in the UI hide actions; they don't secure them.** Anyone can edit
the JavaScript in their browser. The real enforcement is the `authorize`
middleware on the server. Hiding buttons is a usability measure so people aren't
shown actions that will return `403`.

## Notes and gotchas

**Money arrives as strings.** `unitPrice` and `totalAmount` are Postgres
`NUMERIC` values, serialised as strings so exact decimal digits survive the
trip. `product.unitPrice * qty` gives `NaN` — convert with `Number(...)`
explicitly, and prefer doing money arithmetic on the server.

**StrictMode double-invokes effects in development.** Seeing two requests
locally and one in production is expected behaviour, not a bug — it surfaces
missing effect cleanup.

**Only `VITE_`-prefixed environment variables reach browser code.** This is a
safety feature: everything in this `.env` ends up in the bundle users download,
so no secrets belong here.

## Known limitations

- Types in `lib/types.ts` are hand-written duplicates of the backend's Prisma
  types. They can drift silently. A shared package, a generated OpenAPI client,
  or tRPC would eliminate this.
- Logout is client-side only. The JWT remains valid on the server until it
  expires.
- No automated frontend tests.
