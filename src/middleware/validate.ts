import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";

/**
 * VALIDATION MIDDLEWARE
 * ---------------------
 * Runs BEFORE the route handler. If validation fails, the handler never
 * executes — so by the time your controller runs, the data is guaranteed
 * valid. That guarantee is what lets controllers stay short.
 *
 * We validate all three input sources in one schema:
 *   body   — JSON payload
 *   query  — ?page=1&search=steel
 *   params — the :id in /customers/:id
 *
 * Usage:
 *   router.post("/", validate(createCustomerSchema), controller.create);
 */

type RequestSchemas = {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
};

export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      /**
       * We REASSIGN req.body with the parsed result rather than just
       * checking it. Two reasons this matters:
       *
       * 1. STRIPPING. Zod removes fields you didn't declare. If someone
       *    posts { name: "X", role: "ADMIN" } to a customer endpoint,
       *    `role` is silently dropped instead of reaching your database.
       *    This defends against mass-assignment attacks.
       *
       * 2. COERCION. z.coerce.number() turns the string "5" from a query
       *    string into the number 5. Query params are ALWAYS strings.
       */
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        // Express 5 makes req.query a getter-only property, so mutate
        // in place rather than reassigning.
        const parsedQuery = schemas.query.parse(req.query);
        Object.assign(req.query, parsedQuery);
      }

      next();
    } catch (error) {
      // Hand ZodErrors to the central handler, which formats them.
      if (error instanceof ZodError) {
        return next(error);
      }
      return next(error);
    }
  };