# Mini ERP + CRM Operations Portal

A small ERP/CRM system for a wholesale/distribution business, covering customer
relationship management, product inventory with a full stock ledger, and sales
challans with atomic stock deduction.

Built as a full-stack case study: Node.js + TypeScript + Express + PostgreSQL on
the backend, React + TypeScript + Vite on the frontend.

---

## Contents

- [Live URLs](#live-urls)
- [Test credentials](#test-credentials)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Key design decisions](#key-design-decisions)
- [API overview](#api-overview)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

---

## Live URLs

| Surface  | URL |
| -------- | --- |
| Frontend | _to be added after deployment_ |
| Backend  | _to be added after deployment_ |
| Health   | _backend URL_ + `/health` |

## Test credentials

All four accounts share the password `Password@123`.

| Email                | Role      | Can do |
| -------------------- | --------- | ------ |
| `admin@erp.com`      | ADMIN     | Everything, including user management and cancellations |
| `sales@erp.com`      | SALES     | Manage customers, create and confirm challans |
| `warehouse@erp.com`  | WAREHOUSE | Manage products, adjust stock, confirm challans |
| `accounts@erp.com`   | ACCOUNTS  | Read-only across all modules |

Role restrictions are enforced server-side. The frontend hides actions a user
can't perform, but that is a usability measure — the authorization middleware is
the actual control.

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
│       ├── config/            # env validation, Prisma singleton
│       ├── middleware/        # auth, validation, error handling
│       ├── modules/           # auth, customer, product, challan
│       ├── utils/             # AppError, asyncHandler, JWT, responses
│       ├── app.ts             # Express assembly (no port binding)
│       └── server.ts          # port binding + graceful shutdown
└── frontend/
    └── src/
        ├── components/        # shared UI
        ├── context/           # AuthContext
        ├── lib/               # axios client, shared types
        └── pages/             # route-level screens
```

## Running locally

Requires Node.js 18+ and a PostgreSQL database. The free tier at
[neon.tech](https://neon.tech) works without a card.

**1. Clone and install**

```bash
git clone <repo-url>
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

**Backend** — validated at startup in `src/config/env.ts`; the process refuses to
boot with a clear message if any required variable is missing or malformed.

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
| `VITE_API_URL` | Yes      | Base URL of the backend API |

Only variables prefixed `VITE_` are exposed to browser code. Anything in the
frontend `.env` ships in the JavaScript bundle, so no secrets belong there.

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
  from those same schemas.

**Request pipeline.**

```
CORS → JSON body parser → logger → authenticate → authorize
     → validate → controller → service
     → 404 handler → central error handler
```

Middleware order is load-bearing. The error handler must be registered last, and
Express identifies it by its four-argument signature.

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
product's name, SKU, and unit price at the moment the challan is created —
not just a foreign key. Editing a product's price later must not silently
rewrite the value of a document that was already issued. Snapshots are taken at
creation rather than confirmation, so a draft honours the price that was quoted.

**Stock ledger as the source of truth.** `products.current_stock` is a cached
running total; the authoritative record is the append-only `stock_movements`
table. Every movement stores `stock_after`, so a discrepancy can be traced to
the exact entry where the ledger and the cache diverged. Stock is deliberately
not editable through the product update endpoint — all changes flow through the
adjustment endpoint, which always writes a movement.

**Race-safe stock deduction.** A read-then-write check
(`if (stock < qty) throw`) is unsafe under concurrent requests: several can read
the same value, all pass the check, and all commit — overselling inventory
without any error. Wrapping it in a transaction does not help, because both
transactions legitimately read the same snapshot. Instead the guard lives inside
the write:

```sql
UPDATE products SET current_stock = current_stock - $1
WHERE id = $2 AND current_stock >= $1
```

The loser of the race matches zero rows and receives a `409`.

**Deadlock avoidance.** Challan line items are sorted by product ID before any
stock is touched, so every transaction acquires row locks in the same order.
Without this, two challans containing the same products in different orders can
deadlock and Postgres will kill one of them.

**Atomic challan numbering.** Numbers come from a dedicated counter table
incremented inside the database (`last_number = last_number + 1`), not from
counting existing rows. Counting produces duplicate numbers under concurrency.

**Soft deletes.** Customers and products are deactivated via `isActive` rather
than deleted. Hard deletion would either fail on foreign keys or orphan
financial history.

**Cancellation writes contra entries.** Cancelling a confirmed challan restores
stock by appending compensating `IN` movements. The original `OUT` movements are
never removed, so the ledger still shows that the goods left and came back.

## API overview

All routes are prefixed `/api`. Every route except `POST /auth/login` requires
`Authorization: Bearer <token>`.

**Auth**

| Method | Path                        | Roles |
| ------ | --------------------------- | ----- |
| POST   | `/auth/login`               | public |
| GET    | `/auth/me`                  | any |
| POST   | `/auth/change-password`     | any |
| POST   | `/auth/register`            | ADMIN |
| GET    | `/auth/users`               | ADMIN |
| PATCH  | `/auth/users/:id/status`    | ADMIN |

**Customers**

| Method | Path                          | Roles |
| ------ | ----------------------------- | ----- |
| GET    | `/customers`                  | any |
| GET    | `/customers/stats`            | any |
| GET    | `/customers/:id`              | any |
| POST   | `/customers`                  | ADMIN, SALES |
| PATCH  | `/customers/:id`              | ADMIN, SALES |
| DELETE | `/customers/:id`              | ADMIN |
| GET    | `/customers/:id/follow-ups`   | any |
| POST   | `/customers/:id/follow-ups`   | ADMIN, SALES |

Supports `?page`, `?limit`, `?search`, `?status`, `?customerType`, `?city`,
`?followUpBefore`, `?sortBy`, `?sortOrder`. Sortable columns are whitelisted.

**Products**

| Method | Path                        | Roles |
| ------ | --------------------------- | ----- |
| GET    | `/products`                 | any |
| GET    | `/products/low-stock`       | any |
| GET    | `/products/categories`      | any |
| GET    | `/products/stats`           | any |
| GET    | `/products/:id`             | any |
| POST   | `/products`                 | ADMIN, WAREHOUSE |
| PATCH  | `/products/:id`             | ADMIN, WAREHOUSE |
| DELETE | `/products/:id`             | ADMIN |
| POST   | `/products/:id/stock`       | ADMIN, WAREHOUSE |
| GET    | `/products/:id/movements`   | any |

**Challans**

| Method | Path                      | Roles |
| ------ | ------------------------- | ----- |
| GET    | `/challans`               | any |
| GET    | `/challans/stats`         | any |
| GET    | `/challans/:id`           | any |
| POST   | `/challans`               | ADMIN, SALES |
| PATCH  | `/challans/:id`           | ADMIN, SALES (drafts only) |
| POST   | `/challans/:id/confirm`   | ADMIN, SALES, WAREHOUSE |
| POST   | `/challans/:id/cancel`    | ADMIN |

**Status codes**

| Code | Meaning |
| ---- | ------- |
| 200  | Success |
| 201  | Created |
| 400  | Validation failed |
| 401  | Missing, invalid, or expired token |
| 403  | Authenticated but role not permitted |
| 404  | Resource not found |
| 409  | Conflict — duplicate SKU, insufficient stock, invalid state transition |
| 500  | Unhandled server error |

## Testing

A Postman collection covering every endpoint lives in `backend/postman/`.

1. Import `ERP-CRM-API.postman_collection.json` and `Local.postman_environment.json`
2. Select the **Local** environment and set `baseUrl` to `http://localhost:4000`
3. Run the collection

Every request asserts its expected status code, and the login request captures
its token into an environment variable that the rest of the collection inherits.
Role-restricted requests fetch their own token in a pre-request script, so they
pass regardless of execution order.

Coverage includes the failure paths, not just the happy ones: user enumeration
resistance on login, 403s for insufficient roles, 409s for duplicate SKUs and
insufficient stock, 400s for invalid UUIDs and non-whitelisted sort columns, and
the full challan lifecycle including cancellation restoring stock.

## Deployment

_To be completed._

## Known limitations

**Not implemented** — the following were listed as optional bonuses and were
deprioritised in favour of completing the core modules:

- PDF invoice export
- Docker setup
- GitHub Actions CI/CD
- Product image upload to S3

**Accepted trade-offs**

- **JWTs cannot be revoked.** Logging out clears the token client-side, but it
  stays valid on the server until it expires. A production system would use
  short-lived access tokens with refresh tokens, or a server-side revocation
  list.
- **Password changes don't invalidate existing tokens**, for the same reason.
  Storing a `passwordChangedAt` timestamp and rejecting older tokens would fix
  this.
- **Search uses `ILIKE '%term%'`**, which cannot use a B-tree index and so scans
  the table. Fine at this scale; a larger dataset would want Postgres full-text
  search or a trigram index.
- **Offset pagination** was chosen over cursor pagination because the admin UI
  needs page numbers. Deep pages get slower, and rows inserted mid-pagination
  can shift between pages.
- **Frontend types are hand-written duplicates** of the backend's types. A
  shared package, generated OpenAPI client, or tRPC would remove the drift risk.
- **No automated test suite.** Verification is via the Postman collection rather
  than unit or integration tests.
- **Decimal values cross the API as strings** to preserve exact precision. This
  is correct, but callers must convert explicitly rather than doing arithmetic
  on the raw value.
