/**
 * THE TWO KINDS OF ERROR
 * ----------------------
 * OPERATIONAL — expected, part of normal life. "Customer not found",
 *   "insufficient stock", "email already registered". The user should
 *   see a clear message and be able to act on it.
 *
 * PROGRAMMER — a bug. Undefined property access, a typo, a null deref.
 *   The user must NEVER see the details: stack traces leak file paths,
 *   library versions, and sometimes credentials. Log it, return a
 *   generic 500.
 *
 * `isOperational` is how the error handler tells them apart.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
    isOperational = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Without this, `instanceof AppError` fails when extending built-in
    // classes in compiled TypeScript. Obscure, well-documented gotcha.
    Object.setPrototypeOf(this, new.target.prototype);

    // Omit the constructor itself from the stack trace, so the trace
    // points at the line that actually threw.
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Named helpers. `throw new NotFoundError("Customer")` reads better than
 * `throw new AppError("Customer not found", 404)` and can't be typo'd
 * into a 400.
 */

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404);
  }
}

/** 409 — the request was valid but conflicts with current state. */
export class ConflictError extends AppError {
  constructor(message = "Request conflicts with the current state", details?: unknown) {
    super(message, 409, details);
  }
}