import express, { Application, Request, Response } from "express";
import cors from "cors";
import { z } from "zod";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { validate } from "./middleware/validate";
import { asyncHandler } from "./utils/asyncHandler";
import { sendSuccess, sendCreated } from "./utils/apiResponse";
import { NotFoundError, ConflictError } from "./utils/AppError";
import { authRouter } from "./modules/auth/auth.routes";
import { customerRouter } from "./modules/customer/customer.routes";

export const createApp = (): Application => {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, _res: Response, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });

  app.get("/", (_req: Request, res: Response) => {
    res.json({ name: "ERP + CRM API", version: "1.0.0", health: "/health" });
  });

  app.get("/health", (_req: Request, res: Response) => {
    sendSuccess(res, {
      status: "ok",
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================================
  // API ROUTES
  // ==========================================================

  app.use("/api/auth", authRouter);
  app.use("/api/customers", customerRouter);

  // ==========================================================
  // TEMPORARY DEMO ROUTES - delete these once Part 4 lands.
  // They exist so you can watch each error path fire in Postman.
  // ==========================================================

  const demoSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    mobile: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number"),
    email: z.string().email("Invalid email address").optional(),
    age: z.coerce.number().int().positive().max(120).optional(),
  });

  // 201 on success, 400 with per-field errors on failure
  app.post(
    "/demo/validate",
    validate({ body: demoSchema }),
    asyncHandler(async (req: Request, res: Response) => {
      sendCreated(res, req.body, "Validation passed");
    })
  );

  // 404 through our AppError classes
  app.get(
    "/demo/not-found",
    asyncHandler(async () => {
      throw new NotFoundError("Customer");
    })
  );

  // 409 - valid request, conflicts with current state
  app.get(
    "/demo/conflict",
    asyncHandler(async () => {
      throw new ConflictError("Insufficient stock for Steel Pipe 2 inch", {
        available: 10,
        requested: 25,
      });
    })
  );

  // 500 - an unexpected bug. Note it does NOT hang, thanks to asyncHandler.
  app.get(
    "/demo/crash",
    asyncHandler(async () => {
      const broken: any = undefined;
      return broken.someProperty.deeper;
    })
  );

  // ==========================================================

  app.use(notFoundHandler);
  app.use(errorHandler); // must be LAST

  return app;
};