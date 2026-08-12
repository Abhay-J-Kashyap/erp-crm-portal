# Frontend — ERP + CRM Operations Portal

React single-page application for the operations portal. Talks to the Express
API in [`../backend`](../backend).

**Live:** https://erp-crm-portal-two.vercel.app

For roles and permissions, architecture, and design decisions, see the
[root README](../README.md).

## Tech stack

| Concern | Choice | Why |
| ------- | ------ | --- |
| Build tool | Vite | Fast dev server, native ESM, minimal config |
| Framework | React 18 | — |
| Language | TypeScript (strict) | — |
| Routing | React Router v6 | Nested routes, so the layout and auth guard are declared once |
| Server state | TanStack Query | Caching, deduplication, and race handling that `useEffect` fetching doesn't provide |
| Forms | React Hook Form + Zod | Uncontrolled inputs avoid a re-render per keystroke; Zod schemas mirror the backend's |
| HTTP | Axios | Interceptors for token attachment and 401 handling |
| Styling | Tailwind CSS | — |
| Icons | lucide-react | — |

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

Opens on `http://localhost:5173`. Sign in with `admin@erp.com` /
`Password@123`; the login screen lists the other demo accounts.

## Scripts

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Dev server with hot module replacement |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without emitting |

Build tools are invoked as `node ./node_modules/<pkg>/...` rather than through
`node_modules/.bin`, because binaries installed on Windows lose their executable
bit and cannot be exec'd on Vercel's Linux builder.

## Structure

```
src/
├── components/
│   ├── EmptyState.tsx
│   ├── ErrorState.tsx
│   ├── Layout.tsx           # sidebar shell; renders child routes via <Outlet />
│   ├── Modal.tsx
│   ├── PageHeader.tsx
│   ├── Pagination.tsx
│   ├── ProtectedRoute.tsx   # auth + role guard
│   ├── StatusBadge.tsx
│   └── TableSkeleton.tsx
├── context/
│   └── AuthContext.tsx      # user state, login/logout, session restore
├── hooks/
│   └── useDebounce.ts
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
rather than trusting it — the token may have expired, or the account may have
been deactivated since login.

**Auth has three states, not two:** loading, logged out, and logged in.
`ProtectedRoute` checks `isLoading` before `user`. Skipping that check logs the
user out on every page refresh, because during verification `user` is still
`null` and looks identical to "not signed in".

**Route protection is declared once.** Every authenticated page nests inside a
single `<ProtectedRoute><Layout /></ProtectedRoute>`, so a route added there is
protected by default. Per-route guards fail open.

**Role checks hide actions; they do not secure them.** `hasRole()` controls
which buttons render — sales does not see "Adjust" on products, warehouse does
not see "Add customer". Anyone can unhide a button in devtools. The real
enforcement is the `authorize` middleware on the server, which returns `403`
regardless of what the UI shows.

## State, and where it lives

Three distinct categories, each with a different owner:

- **Server state** — customers, products, challans. Owned by TanStack Query,
  which caches by query key and refetches when a mutation invalidates it.
- **Client state** — modal open, current input value. Owned by `useState`.
- **URL state** — page number, filters, search term. Owned by `useSearchParams`.

Putting filters in the URL means a filtered view is bookmarkable, the browser
Back button undoes a filter change, and refreshing keeps your place. It also
lets the query key derive from the URL, so navigating back is an instant cache
hit.

Search inputs are debounced by 350ms. Without it, typing "steel" fires five
requests whose responses can arrive out of order.

Mutations call `invalidateQueries` on success. Query keys are hierarchical, so
invalidating `["customers"]` also invalidates `["customers", 2, "steel"]` — one
call refreshes every page and filter combination. Skipping this produces the
"I have to refresh to see my changes" bug.

## Notes and gotchas

**Money arrives as strings.** `unitPrice` and `totalAmount` are Postgres
`NUMERIC` values, serialised as strings so exact decimal digits survive the
trip. `product.unitPrice * qty` yields `NaN` — convert with `Number(...)`
explicitly, and prefer doing money arithmetic on the server.

**Dynamic form arrays key on `field.id`, not the array index.** In the challan
builder, an index key breaks on removal: delete row 1 of 3 and React reuses the
DOM node, so focus and values land on the wrong inputs.

**Derived values are computed, not stored.** Challan totals are calculated from
the watched item list on each render. Storing them in state would mean keeping
two things in sync, and they will drift.

**StrictMode double-invokes effects in development.** Two requests locally and
one in production is expected — it surfaces missing effect cleanup.

**`VITE_` variables are substituted at build time.** Changing one in the Vercel
dashboard has no effect until you redeploy. Everything in this `.env` ships
inside the JavaScript bundle users download, so no secrets belong here.

## Known limitations

- Types in `lib/types.ts` are hand-written duplicates of the backend's Prisma
  types and can drift silently. A shared package, a generated OpenAPI client, or
  tRPC would eliminate this.
- Logout is client-side only. The JWT remains valid on the server until it
  expires.
- No automated frontend tests.