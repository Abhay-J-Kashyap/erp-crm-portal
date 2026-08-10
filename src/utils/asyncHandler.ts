import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * THE ASYNC ERROR TRAP IN EXPRESS 4
 * ---------------------------------
 * Express 4 does NOT catch errors thrown inside async route handlers.
 * This code looks completely fine and is broken:
 *
 *   app.get("/customers", async (req, res) => {
 *     const data = await prisma.customer.findMany();  // if this throws...
 *     res.json(data);
 *   });
 *
 * The rejected promise escapes. Express never sees it, never calls your
 * error handler, and never sends a response. The client hangs until it
 * times out. No error appears in your logs.
 *
 * The manual fix is a try/catch in every single handler:
 *
 *   try { ... } catch (err) { next(err); }
 *
 * ...which is 4 extra lines per route and one forgotten catch away from
 * the same silent hang. So we wrap instead.
 *
 * asyncHandler takes your async function and returns a normal handler
 * that attaches .catch(next) to the returned promise. Any rejection is
 * forwarded to the central error handler automatically.
 */

export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    // Promise.resolve() normalises the return value, so this works
    // whether fn is async or a plain synchronous function.
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Express 5 handles this natively, so if you upgrade later you can drop
 * this wrapper. Worth understanding regardless — "my endpoint hangs
 * forever with no error" is one of the most confusing bugs in Node, and
 * this is almost always the cause.
 */
