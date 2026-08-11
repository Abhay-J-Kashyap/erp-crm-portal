import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { UnauthorizedError } from "./AppError";

/**
 * WHAT GOES IN A TOKEN
 * --------------------
 * Only what you need on EVERY request: the user id and role. Remember the
 * payload is readable by anyone holding the token, so no personal data,
 * no email, nothing sensitive.
 *
 * Keep it small for a second reason: this travels in a header on every
 * single request. A bloated payload is bandwidth you pay for forever.
 */

export type JwtPayload = {
  sub: string; // "subject" — the standard claim for user id
  role: Role;
};

export const signToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  // jwt.sign adds two claims automatically:
  //   iat — issued at
  //   exp — expiry, derived from expiresIn
  // The `exp` check happens inside jwt.verify. You never check it yourself.
  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // jwt.verify's return type is `string | JwtPayload`, because a token
    // CAN carry a bare string. Ours never does, but TypeScript doesn't
    // know that — so we narrow explicitly rather than casting blindly.
    if (typeof decoded === "string" || !decoded.sub) {
      throw new UnauthorizedError("Invalid token payload");
    }

    return {
      sub: decoded.sub as string,
      role: decoded.role as Role,
    };
  } catch (error) {
    // Distinguish the two failure modes — the frontend reacts differently:
    // expired means "silently log them out", invalid means "something's wrong".
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Token has expired, please log in again");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid token");
    }
    throw error;
  }
};

/**
 * Pulls the token out of "Authorization: Bearer <token>".
 *
 * The "Bearer" scheme is RFC 6750. It means exactly what it sounds like:
 * whoever bears this token is treated as the user. There is no additional
 * proof of identity — which is why tokens must only ever travel over HTTPS.
 */
export const extractTokenFromHeader = (
  authHeader: string | undefined
): string | null => {
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  return token;
};
