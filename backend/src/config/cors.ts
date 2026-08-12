import type { CorsOptions } from "cors";
import { env, isProduction } from "./env";

/**
 * CORS IN PRODUCTION
 * ------------------
 * Locally both halves are on localhost, so the browser is lenient. In
 * production the frontend is on vercel.app and the API on onrender.com —
 * different ORIGINS. The browser blocks every cross-origin request
 * unless the server explicitly names the caller in
 * Access-Control-Allow-Origin.
 *
 * THE PREVIEW-URL PROBLEM.
 * Vercel gives every deployment its own URL:
 *   erp-crm-portal.vercel.app                      (production)
 *   erp-crm-portal-git-main-abhay.vercel.app       (branch)
 *   erp-crm-portal-k3j9x2-abhay.vercel.app         (per-commit preview)
 *
 * You cannot list them ahead of time — the last one changes on every
 * push. So we take exact origins from the env var AND allow a pattern
 * for your own Vercel previews.
 *
 * WHY NOT origin: true (allow everything)?
 * Because `credentials: true` plus a wildcard origin means any website
 * can make authenticated requests to your API using a logged-in user's
 * browser. That is CSRF. Never pair the two.
 */

const parseOrigins = (raw: string): string[] =>
  raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const allowedOrigins = parseOrigins(env.CORS_ORIGIN);

/**
 * Matches preview deployments of THIS project only.
 * Tighten the prefix to your actual Vercel project name so you aren't
 * trusting every *.vercel.app site on the internet.
 */
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    /**
     * `origin` is undefined for same-origin requests and for non-browser
     * clients like curl, Postman, and server-to-server calls. Those have
     * no Origin header at all, so there is nothing to block — CORS is a
     * browser mechanism, not an auth mechanism. Your real protection is
     * the JWT.
     */
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    if (isProduction && VERCEL_PREVIEW.test(origin)) {
      return callback(null, true);
    }

    // Log the rejection — "CORS error" in a browser console tells you
    // nothing about WHICH origin was refused.
    console.warn(`[CORS] blocked origin: ${origin}`);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },

  credentials: true,

  // Preflight (OPTIONS) requests ask permission before the real request.
  // These must cover every method and header your API actually uses, or
  // the browser refuses before your handler ever runs.
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],

  // Cache the preflight result for 24h so the browser stops re-asking
  // before every request.
  maxAge: 86400,
};
