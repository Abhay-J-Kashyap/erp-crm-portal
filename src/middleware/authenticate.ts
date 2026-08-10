import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { verifyToken, extractTokenFromHeader } from "../utils/jwt";
import { UnauthorizedError, ForbiddenError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * AUTHENTICATE — "who are you?"
 * Verifies the token and attaches req.user. Fails with 401.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      throw new UnauthorizedError("No authentication token provided");
    }

    // Throws UnauthorizedError on an invalid or expired signature.
    const payload = verifyToken(token);

    /**
     * WHY WE HIT THE DATABASE HERE
     * ----------------------------
     * The token alone is cryptographically sufficient — we could trust
     * payload.role and skip this query entirely. That's the "stateless"
     * selling point of JWT.
     *
     * We look the user up anyway because tokens live for 7 days, and in
     * that window a user can be deactivated or have their role changed.
     * Without this check, a fired employee keeps full access for a week.
     *
     * The tradeoff: one indexed primary-key lookup per request (sub-millisecond)
     * in exchange for revocation actually working. For an internal ERP
     * that's obviously the right call. A high-traffic public API might
     * decide differently, or cache the lookup in Redis.
     */
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("This account has been deactivated");
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role, // from the DB, NOT the token — role changes take effect immediately
    };

    next();
  }
);

/**
 * AUTHORIZE — "are you allowed?"
 * Checks the role. Fails with 403. Must run AFTER authenticate.
 *
 * Usage:
 *   router.delete("/:id", authenticate, authorize("ADMIN"), controller.remove);
 *   router.post("/", authenticate, authorize("ADMIN", "SALES"), controller.create);
 *
 * Note this is a FACTORY: authorize(...) returns the middleware. That's
 * what lets you pass arguments to it, since Express only ever calls
 * middleware with (req, res, next).
 */
export const authorize =
  (...allowedRoles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Reaching here means authorize was mounted without authenticate
      // before it — a wiring bug, not a user error.
      return next(new UnauthorizedError("Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `This action requires one of: ${allowedRoles.join(", ")}. Your role is ${req.user.role}.`
        )
      );
    }

    next();
  };

/**
 * Convenience: ADMIN can do anything, so it's implicitly allowed everywhere.
 * Saves writing authorize("ADMIN", "SALES") on every single route.
 */
export const authorizeWithAdmin = (...allowedRoles: Role[]) =>
  authorize(...allowedRoles, Role.ADMIN);
