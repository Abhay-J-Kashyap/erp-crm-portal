import { Role } from "@prisma/client";

/**
 * DECLARATION MERGING
 * -------------------
 * We want `req.user` available in every handler. But Express's Request
 * type is defined in a library we don't control, and TypeScript will
 * reject `req.user` as a non-existent property.
 *
 * The wrong fixes:
 *   (req as any).user          — kills type safety exactly where you need it
 *   req.user = ... // @ts-ignore — same, but noisier
 *
 * The right fix is DECLARATION MERGING: reopen the library's own namespace
 * and add to it. TypeScript merges our declaration with Express's, and
 * `req.user` becomes properly typed everywhere, with autocomplete.
 *
 * `user` is optional (`?`) because it only exists AFTER the authenticate
 * middleware runs. That optionality is deliberate — it forces you to
 * handle the unauthenticated case rather than assuming a user is present.
 */

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// An empty export makes this file a MODULE rather than a script.
// Without it, the `declare global` block is not applied. Easy to miss.
export {};
