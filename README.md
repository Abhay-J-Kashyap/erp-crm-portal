# Mini ERP + CRM — Backend

Node.js + TypeScript + Express + PostgreSQL backend for a wholesale/distribution
operations portal.

## Tech stack

| Concern        | Choice                      |
| -------------- | --------------------------- |
| Runtime        | Node.js 18+                 |
| Language       | TypeScript (strict mode)    |
| Framework      | Express.js                  |
| Database       | PostgreSQL                  |
| ORM            | Prisma (added in Part 2)    |
| Validation     | Zod                         |
| Auth           | JWT + bcrypt (Part 4)       |

## Getting started

Requires Node.js 18 or newer. Check with `node -v`.

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env

# 3. Generate a JWT secret and paste it into .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Start the dev server (auto-restarts on file changes)
npm run dev
```

Verify it's alive:

```bash
curl http://localhost:4000/health
```

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server with hot reload via `tsx watch`    |
| `npm run build`     | Compile TypeScript to `dist/`                 |
| `npm start`         | Run the compiled build (production)           |
| `npm run typecheck` | Type-check without emitting files             |

## Project structure

```
src/
├── config/       # Environment validation, app configuration
├── modules/      # Feature folders: auth, customers, products, challans
├── middleware/   # Auth guard, error handler, request validation
├── utils/        # Shared helpers
├── types/        # Shared TypeScript types
├── app.ts        # Express app assembly (no port binding)
└── server.ts     # Port binding + graceful shutdown
```

Each feature lives in `src/modules/<feature>/` containing its own
`*.routes.ts`, `*.controller.ts`, `*.service.ts`, and `*.schema.ts`.

## Environment variables

| Variable         | Required | Description                                |
| ---------------- | -------- | ------------------------------------------ |
| `NODE_ENV`       | No       | `development` \| `production` \| `test`     |
| `PORT`           | No       | HTTP port, defaults to `4000`               |
| `DATABASE_URL`   | Yes      | PostgreSQL connection string                |
| `JWT_SECRET`     | Yes      | Min 32 characters                           |
| `JWT_EXPIRES_IN` | No       | Token lifetime, defaults to `7d`            |
| `CORS_ORIGIN`    | No       | Comma-separated allowed frontend origins    |

All variables are validated at startup in `src/config/env.ts`. The process
exits with a clear error if any required variable is missing or malformed.
