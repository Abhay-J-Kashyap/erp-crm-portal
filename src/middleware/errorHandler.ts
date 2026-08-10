import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/library";
import { AppError } from "../utils/AppError";
import { isProduction } from "../config/env";

/**
 * THE CENTRAL ERROR HANDLER
 * -------------------------
 * ONE place that turns any error into an HTTP response. Every route in
 * the app funnels here, which means:
 *   - Error format is identical across all endpoints
 *   - Stack traces can never leak in production (enforced once, not
 *     remembered per route)
 *   - Adding a new error type is a single edit
 *
 * Express identifies error handlers by ARITY — a middleware with FOUR
 * parameters is an error handler. This is why `_next` must stay in the
 * signature even though it's unused. Remove it and Express silently
 * treats this as a normal middleware and your error handling stops
 * working with no warning.
 *
 * Must be registered LAST, after all routes.
 */

type ErrorResponse = {
  success: false;
  message: string;
  errors?: unknown;
  stack?: string;
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction // required for Express to recognise this as an error handler
): void => {
  let statusCode = 500;
  let message = "Internal server error";
  let errors: unknown;

  // ---- 1. Zod validation errors -> 400 ----
  if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    // Flatten Zod's nested issues into a flat, frontend-friendly list.
    // "body.mobile" is far more useful to a form than a nested object.
    errors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
  }

  // ---- 2. Our own thrown errors ----
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.details;
  }

  // ---- 3. Known Prisma errors ----
  // Prisma uses documented error codes. Translating them here means
  // controllers don't need try/catch around every query.
  else if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        // Unique constraint violated (duplicate email, duplicate SKU).
        statusCode = 409;
        const target = (err.meta?.target as string[] | undefined)?.join(", ");
        message = target
          ? `A record with this ${target} already exists`
          : "Duplicate value violates a unique constraint";
        break;
      }
      case "P2025":
        // update/delete targeted a row that doesn't exist.
        statusCode = 404;
        message = "The requested record was not found";
        break;
      case "P2003":
        // Foreign key constraint failed — e.g. customerId points nowhere.
        statusCode = 400;
        message = "Related record does not exist";
        break;
      case "P2014":
        statusCode = 400;
        message = "This change would break a required relation";
        break;
      default:
        statusCode = 400;
        message = "Database request error";
    }
  }

  // ---- 4. Prisma validation errors (wrong types passed to a query) ----
  else if (err instanceof PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid database query";
  }

  // ---- 5. Malformed JSON body ----
  // express.json() throws a SyntaxError when the payload isn't valid JSON.
  else if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    message = "Malformed JSON in request body";
  }

  // ---- 6. Anything else is a bug ----
  else if (err instanceof Error) {
    message = isProduction ? "Internal server error" : err.message;
  }

  /**
   * LOGGING. 5xx means WE broke — log the full error so you can debug.
   * 4xx means the CLIENT sent something wrong — log a single line, or
   * your logs fill with noise from people fat-fingering forms.
   */
  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}`, err);
  } else {
    console.warn(`[WARN] ${req.method} ${req.originalUrl} -> ${statusCode}: ${message}`);
  }

  const response: ErrorResponse = { success: false, message };
  if (errors) response.errors = errors;

  // Stack traces in dev only. In production they leak your file paths,
  // dependency versions, and sometimes secrets in error messages.
  if (!isProduction && err instanceof Error) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/** 404 handler. Registered after routes, before errorHandler. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};