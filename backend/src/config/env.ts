import "dotenv/config";
import { z } from "zod";

/**
 * WHY THIS FILE EXISTS
 * --------------------
 * `process.env.PORT` is typed as `string | undefined` by Node. That means
 * every time you touch it, TypeScript rightly nags you about undefined.
 *
 * Worse: if you deploy without setting DATABASE_URL, your app starts fine
 * and then explodes on the first request. That is the worst failure mode.
 *
 * So we validate every environment variable ONCE, at startup. If something
 * is missing, the process refuses to boot and tells you exactly what's wrong.
 * This is called "fail fast" and it is the single cheapest reliability win
 * you can add to a backend.
 */

const envSchema = z.object({
  // z.enum() creates a union type: "development" | "production" | "test"
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Env vars are ALWAYS strings. `coerce` converts "4000" -> 4000 for us.
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // A short secret is a security hole, so we enforce a minimum length.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Comma-separated list of allowed frontend origins for CORS.
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

// .safeParse() returns a result object instead of throwing,
// which lets us print a friendly message rather than a stack trace.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1); // Stop the process. Non-zero code = failure.
}

/**
 * `parsed.data` is fully typed. Hover over `env.PORT` in your editor and
 * TypeScript will tell you it's a `number` — not `string | undefined`.
 * That type came from the Zod schema. One source of truth.
 */
export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
