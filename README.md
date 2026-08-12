# ERP + CRM Operations Portal

A small ERP/CRM system for a wholesale/distribution business, covering customer
relationship management, product inventory with a full stock ledger, and sales
challans with atomic stock deduction.

Built as a full-stack case study: Node.js + TypeScript + Express + PostgreSQL on
the backend, React + TypeScript + Vite on the frontend.

---

## Live URLs

| Surface  | URL |
| -------- | --- |
| Frontend | https://erp-crm-portal-two.vercel.app |
| Backend  | https://erp-crm-portal-gmwj.onrender.com |
| Health   | https://erp-crm-portal-gmwj.onrender.com/health |

> **Cold starts:** the backend runs on Render's free tier, which sleeps after
> ~15 minutes of inactivity. The first request after a period of idleness can
> take up to a minute while the container wakes. Subsequent requests are fast.
> Opening the health URL above first will warm it up.

## Test credentials

All four accounts share the password `Password@123`.

| Email                | Role      |
| -------------------- | --------- |
| `admin@erp.com`      | ADMIN     |
| `sales@erp.com`      | SALES     |
| `warehouse@erp.com`  | WAREHOUSE |
| `accounts@erp.com`   | ACCOUNTS  |

---

## Contents

- [Roles and permissions](#roles-and-permissions)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Key design decisions](#key-design-decisions)
- [API reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## Roles and permissions

Permissions are modelled on how the business actually works rather than on a
simple read/write split. A warehouse user can move physical stock but cannot
edit CRM records; a sales user can raise a challan but cannot change a product's
price mid-negotiation.

### Summary

| Role | In one line |
| ---- | ----------- |
| **ADMIN** | Everything, plus user management and cancellations |
| **SALES** | Owns the customer relationship and raises challans |
| **WAREHOUSE** | Owns the product catalogue and physical stock |
| **ACCOUNTS** | Read-only across every module |

### Full matrix

| Action | ADMIN | SALES | WAREHOUSE | ACCOUNTS |
| ------ | :---: | :---: | :-------: | :------: |
| **Customers** |
| View customers and detail pages | ✅ | ✅ | ✅ | ✅ |
| Create / edit customers | ✅ | ✅ | ❌ | ❌ |
| Add follow-up notes | ✅ | ✅ | ❌ | ❌ |
| Deactivate a customer | ✅ | ❌ | ❌ | ❌ |
| **Products** |
| View products, stock, and movements | ✅ | ✅ | ✅ | ✅ |
| Create / edit products | ✅ | ❌ | ✅ | ❌ |
| Adjust stock (IN / OUT) | ✅ | ❌ | ✅ | ❌ |
| Deactivate a product | ✅ | ❌ | ❌ | ❌ |
| **Challans** |
| View challans | ✅ | ✅ | ✅ | ✅ |
| Create a challan | ✅ | ✅ | ❌ | ❌ |
| Edit a draft challan | ✅ | ✅ | ❌ | ❌ |
| Confirm a challan (deducts stock) | ✅ | ✅ | ✅ | ❌ |
| Cancel a challan (restores stock) | ✅ | ❌ | ❌ | ❌ |
| **Users** |
| Create users, change roles, deactivate | ✅ | ❌ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ | ✅ |

### Why these boundaries

- **Everyone can read everything.** Warehouse needs the delivery address,
  accounts needs the GST number, sales needs current stock before promising a
  delivery date. Restricting reads would create more friction than security.
- **Sales cannot adjust stock directly.** They move stock *indirectly*, by
  confirming a challan, which always writes a ledger entry. Direct adjustment is
  a warehouse function tied to physical counting.
- **Warehouse can confirm challans** because confirmation happens at dispatch,
  when goods physically leave the building.
- **Only admins can cancel.** Cancellation reverses stock and rewrites the
  effective inventory position, so it needs a higher bar than creation.

### Where this is enforced

Authorization lives in the `authorize` middleware on the server. Every route
declares which roles may call it, and requests from other roles receive `403`.

The frontend hides actions a user cannot perform — the "Adjust" link is absent
for sales, "Add customer" is absent for warehouse. **This is a usability
measure, not a security control.** Anyone can unhide a button in devtools; the
server still refuses the request. The Postman collection includes tests
asserting `403` for exactly these cases.

---

## Tech stack

**Backend**

| Concern    | Choice |
| ---------- | ------ |
| Runtime    | Node.js 18+ |
| Language   | TypeScript (strict) |
| Framework  | Express.js |
| Database   | PostgreSQL (Neon) |
| ORM        | Prisma |
| Validation | Zod |
| Auth       | JWT (`jsonwebtoken`) + bcrypt |

**Frontend**

| Concern      | Choice |
| ------------ | ------ |
| Build tool   | Vite |
| Framework    | React 18 |
| Language     | TypeScript (strict) |
| Routing      | React Router v6 |
| Server state | TanStack Query |
| Forms        | React Hook Form + Zod |
| Styling      | Tailwind CSS |

## Repository layout

```
erp-crm-portal/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # single source of truth for DB + types
│   │   ├── migrations/        # version-controlled schema history
│   │   └── seed.ts            # idempotent test data
│   ├── postman/               # exported collection + environment
│   └── src/
│       ├── config/            # env validation, CORS, Prisma singleton
│       ├── middleware/        # auth, validation, error handling
│       ├── modules/           # auth, customer, product, challan
│       ├── utils/             # AppError, asyncHandler, JWT, responses
│       ├── app.ts             # Express assembly (no port binding)
│       └── server.ts          # port binding + graceful shutdown
└── frontend/
    └── src/
        ├── components/        # shared UI
        ├── context/           # AuthContext
        ├── hooks/             # useDebounce
        ├── lib/               # axios client, shared types
        └── pages/             # route-level screens
```

## Running locally

Requires Node.js 18+ and a PostgreSQL database. The free tier at
[neon.tech](https://neon.tech) works without a card.

**1. Clone and install**

```bash
git clone https://github.com/Abhay-J-Kashyap/erp-crm-portal.git
cd erp-crm-portal

cd backend && npm install
cd ../frontend && npm install
```

**2. Configure the backend**

```bash
cd backend
cp .env.example .env
```

Fill in `DATABASE_URL` with your Postgres connection string and generate a JWT
secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**3. Create the schema and seed data**

```bash
npx prisma migrate dev
npm run prisma:seed
```

**4. Configure the frontend**

Create `frontend/.env`:

```
VITE_API_URL=http://localhost:4000/api
```

**5. Run both, in separate terminals**

```bash
cd backend  && npm run dev    # http://localhost:4000
cd frontend && npm run dev    # http://localhost:5173
```

Verify the backend with `curl http://localhost:4000/health`, then sign in at
`http://localhost:5173`.

## Environment variables

**Backend** — validated at startup in `src/config/env.ts`. The process refuses to
boot with a clear message if any required variable is missing or malformed,
rather than starting and failing on the first request.

| Variable         | Required | Description |
| ---------------- | -------- | ----------- |
| `NODE_ENV`       | No       | `development` \| `production` \| `test` |
| `PORT`           | No       | Defaults to `4000` |
| `DATABASE_URL`   | Yes      | PostgreSQL connection string |
| `JWT_SECRET`     | Yes      | Minimum 32 characters |
| `JWT_EXPIRES_IN` | No       | Defaults to `7d` |
| `CORS_ORIGIN`    | No       | Comma-separated allowed origins |

**Frontend**

| Variable       | Required | Description |
| -------------- | -------- | ----------- |
| `VITE_API_URL` | Yes      | Base URL of the backend API, including `/api` |

Only variables prefixed `VITE_` are exposed to browser code, and they are
substituted at **build** time — changing one requires a rebuild, not just a
restart. Everything in the frontend `.env` ships inside the JavaScript bundle,
so no secrets belong there.

`.env` files are gitignored. `.env.example` is committed and documents which
variables exist without leaking values.

## Architecture

**Backend layering.** Each feature module contains four files with a strict
dependency direction:

```
routes  →  controller  →  service  →  Prisma
  ↓            ↓
middleware   schema (Zod)
```

- **Routes** map URLs to handlers and attach middleware.
- **Controllers** read the request, call a service, send a response. Typically
  three lines; anything longer means logic has leaked into the wrong layer.
- **Services** hold business logic and database access. They never touch `req`
  or `res`, so they can be called from a route, a script, a job, or a test.
- **Schemas** define Zod validation, and the TypeScript input types are inferred
  from those same schemas — one declaration, two guarantees.

**Request pipeline.**

```
CORS → JSON body parser → logger → authenticate → authorize
     → validate → controller → service
     → 404 handler → central error handler
```

Middleware order is load-bearing. `authorize` must follow `authenticate`
because it reads `req.user`. The error handler must be registered last, and
Express identifies it by its four-argument signature.

Authentication is applied at the router level (`router.use(authenticate)`)
rather than per route, so a newly added endpoint is protected by default.
Per-route guards fail open — forget one and the endpoint is silently public.

**Error handling.** Services throw typed errors (`NotFoundError`,
`ConflictError`, `ForbiddenError`, …). One central handler translates those,
plus Zod and Prisma errors, into a consistent response shape. Stack traces are
returned in development only.

Every response uses the same envelope:

```jsonc
// success
{ "success": true, "message": "...", "data": {}, "meta": {} }

// failure
{ "success": false, "message": "...", "errors": [{ "field": "...", "message": "..." }] }
```

## Key design decisions

**Product snapshots on challan items.** Challan lines store a copy of the
product's name, SKU, and unit price at the moment the challan is created — not
just a foreign key. Editing a product's price later must not silently rewrite
the value of a document that was already issued. Snapshots are taken at creation
rather than confirmation, so a draft honours the price that was quoted.

**Stock ledger as the source of truth.** `products.current_stock` is a cached
running total; the authoritative record is the append-only `stock_movements`
table. Every movement stores `stock_after`, so a discrepancy can be traced to
the exact entry where the ledger and the cache diverged. Stock is deliberately
not editable through the product update endpoint — all changes flow through the
adjustment endpoint, which always writes a movement.

**Race-safe stock deduction.** A read-then-write check
(`if (stock < qty) throw`) is unsafe under concurrent requests: several can read
the same value, all pass the check, and all commit — overselling inventory with
no error raised. Wrapping it in a transaction does not help, because both
transactions legitimately read the same committed snapshot. Instead the guard
lives inside the write:

```sql
UPDATE products SET current_stock = current_stock - $1
WHERE id = $2 AND current_stock >= $1
```

The loser of the race matches zero rows and receives a `409` naming the product,
the quantity available, and the quantity requested.

**Deadlock avoidance.** Challan line items are sorted by product ID before any
stock is touched, so every transaction acquires row locks in the same order.
Without this, two challans containing the same products in different orders can
deadlock, and Postgres kills one of them with an error the user cannot
reproduce.

**Atomic challan numbering.** Numbers come from a dedicated counter table
incremented inside the database (`last_number = last_number + 1`), not from
counting existing rows. Counting hands the same number to simultaneous requests.

**Duplicate line items are merged** before stock is touched, so adding the same
product twice validates 10 units against available stock rather than 5 and 5
independently.

**Soft deletes.** Customers and products are deactivated via `isActive` rather
than deleted. Hard deletion would either fail on foreign keys or orphan
financial history.

**Cancellation writes contra entries.** Cancelling a confirmed challan restores
stock by appending compensating `IN` movements. The original `OUT` movements are
never removed, so the ledger still records that the goods left and came back.

**User enumeration resistance.** Login returns an identical error for "no such
account" and "wrong password", and hashes against a dummy value on the
not-found path so both branches take comparable time. Different messages — or
a measurably faster failure — would let an attacker confirm which email
addresses have accounts.

## API reference

All routes are prefixed `/api`. Every route except `POST /auth/login` requires
`Authorization: Bearer <token>`.

**Auth**

| Method | Path | Roles |
| ------ | ---- | ----- |
| POST | `/auth/login` | public |
| GET | `/auth/me` | any |
| POST | `/auth/change-password` | any |
| POST | `/auth/register` | ADMIN |
| GET | `/auth/users` | ADMIN |
| PATCH | `/auth/users/:id/status` | ADMIN |

**Customers**

| Method | Path | Roles |
| ------ | ---- | ----- |
| GET | `/customers` | any |
| GET | `/customers/stats` | any |
| GET | `/customers/:id` | any |
| POST | `/customers` | ADMIN, SALES |
| PATCH | `/customers/:id` | ADMIN, SALES |
| DELETE | `/customers/:id` | ADMIN |
| GET | `/customers/:id/follow-ups` | any |
| POST | `/customers/:id/follow-ups` | ADMIN, SALES |

Query parameters: `page`, `limit`, `search`, `status`, `customerType`, `city`,
`followUpBefore`, `includeInactive`, `sortBy`, `sortOrder`. Sortable columns are
whitelisted — an arbitrary `sortBy` returns `400` rather than reaching the
database.

**Products**

| Method | Path | Roles |
| ------ | ---- | ----- |
| GET | `/products` | any |
| GET | `/products/low-stock` | any |
| GET | `/products/categories` | any |
| GET | `/products/stats` | any |
| GET | `/products/:id` | any |
| POST | `/products` | ADMIN, WAREHOUSE |
| PATCH | `/products/:id` | ADMIN, WAREHOUSE |
| DELETE | `/products/:id` | ADMIN |
| POST | `/products/:id/stock` | ADMIN, WAREHOUSE |
| GET | `/products/:id/movements` | any |

**Challans**

| Method | Path | Roles |
| ------ | ---- | ----- |
| GET | `/challans` | any |
| GET | `/challans/stats` | any |
| GET | `/challans/:id` | any |
| POST | `/challans` | ADMIN, SALES |
| PATCH | `/challans/:id` | ADMIN, SALES (drafts only) |
| POST | `/challans/:id/confirm` | ADMIN, SALES, WAREHOUSE |
| POST | `/challans/:id/cancel` | ADMIN |

**Challan state machine**

```
DRAFT ──confirm──▶ CONFIRMED ──cancel──▶ CANCELLED
  │                                          ▲
  └──────────────────cancel──────────────────┘
```

Confirmed challans are immutable — their stock movements are already written, so
editing quantities would leave the ledger describing a document that no longer
exists. Attempting to edit or re-confirm one returns `409`.

**Status codes**

| Code | Meaning |
| ---- | ------- |
| 200 | Success |
| 201 | Created |
| 400 | Validation failed |
| 401 | Missing, invalid, or expired token |
| 403 | Authenticated but role not permitted |
| 404 | Resource not found |
| 409 | Conflict — duplicate SKU, insufficient stock, invalid state transition |
| 500 | Unhandled server error |

## Testing

A Postman collection covering every endpoint lives in `backend/postman/`.

1. Import `ERP-CRM-API.postman_collection.json` and the environment file
2. Select the environment and set `baseUrl` (either `http://localhost:4000` or
   the live backend URL)
3. Run the collection

Every request asserts its expected status code. The login request captures its
token into an environment variable that the rest of the collection inherits, and
role-restricted requests fetch their own token in a pre-request script so they
pass regardless of execution order.

Coverage includes the failure paths, not just the happy ones:

- Identical responses for unknown email and wrong password
- `401` for missing tokens, `403` for insufficient roles
- `409` for duplicate SKUs and insufficient stock
- `400` for invalid UUIDs and non-whitelisted sort columns
- The full challan lifecycle, including cancellation restoring stock

## Deployment

| Component | Platform | Configuration |
| --------- | -------- | ------------- |
| Database  | Neon     | Serverless Postgres, Singapore region |
| Backend   | Render   | Root directory `backend`, free instance |
| Frontend  | Vercel   | Root directory `frontend`, Vite preset |

**Backend build.** `npm install && npm run build`, where `build` runs
`prisma generate && tsc`. Prisma's client must be generated on the server
because `node_modules` is rebuilt there.

**Backend start.** `npm start` runs `prisma migrate deploy && node dist/server.js`.
`migrate deploy` replays committed migration files without prompting.
`migrate dev` is never used against production — it is interactive and can reset
data.

**Dependency placement.** TypeScript, the `@types/*` packages, the Prisma CLI,
and `tsx` are listed under `dependencies` rather than `devDependencies`, because
the host installs, builds, and runs in one environment and prunes dev
dependencies before the build step.

**Frontend build.** Build tools are invoked as `node ./node_modules/<pkg>/...`
rather than through `node_modules/.bin`, because binaries installed on Windows
lose their executable bit and cannot be exec'd on a Linux builder.

**SPA routing.** `frontend/vercel.json` rewrites all paths to `index.html`.
Without it, refreshing on a client-side route such as `/customers/:id` returns
404, because no such file exists on disk.

**CORS.** The backend accepts the origins listed in `CORS_ORIGIN` plus
`*.vercel.app` preview URLs, since Vercel assigns a new hostname per deployment.
A wildcard origin is deliberately not used: combined with `credentials: true`
it would let any website make authenticated requests using a logged-in user's
browser session. Rejected origins are logged server-side, because a browser CORS
error does not say which origin was refused.

**Seeding production.** Run `npm run seed:prod` once against the production
database. The seed is idempotent, so re-running it is safe.

## Known limitations

**Not implemented** — listed in the brief as optional bonuses, deprioritised in
favour of completing the core modules:

- PDF invoice export
- Docker setup
- GitHub Actions CI/CD
- Product image upload to S3

**Accepted trade-offs**

- **JWTs cannot be revoked.** Logging out clears the token client-side, but it
  remains valid on the server until it expires. Production would use short-lived
  access tokens with refresh tokens, or a server-side revocation list.
- **Password changes do not invalidate existing tokens**, for the same reason.
  Storing a `passwordChangedAt` timestamp and rejecting older tokens would fix
  it.
- **Search uses `ILIKE '%term%'`**, which cannot use a B-tree index and so scans
  the table. Fine at this scale; a larger dataset would want Postgres full-text
  search or a trigram index.
- **Offset pagination** was chosen over cursor pagination because the admin UI
  needs page numbers. Deep pages get slower, and rows inserted mid-pagination
  can shift between pages.
- **Frontend types are hand-written duplicates** of the backend's Prisma types
  and can drift silently. A shared package, a generated OpenAPI client, or tRPC
  would remove the risk.
- **No automated test suite.** Verification is via the Postman collection rather
  than unit or integration tests.
- **Decimal values cross the API as strings** to preserve exact precision.
  Correct, but callers must convert explicitly rather than doing arithmetic on
  the raw value.
- **Cold starts on the free tier** make the first request after idleness slow.