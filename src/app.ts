import express, { Application, Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env";

/**
 * WHAT IS EXPRESS, MENTALLY?
 * --------------------------
 * An Express app is a PIPELINE. A request enters at the top and flows
 * downward through a stack of functions called "middleware". Each one can:
 *
 *   1. Read or modify the request        (req)
 *   2. Send a response and stop          (res.json(...))
 *   3. Pass control to the next function (next())
 *
 * Every middleware has the signature (req, res, next).
 * ORDER MATTERS ENORMOUSLY. Middleware registered first runs first.
 */

export const createApp = (): Application => {
  const app = express();

  // ---- 1. CORS ----
  // Browsers block requests from one origin to another by default.
  // Your React app on :5173 calling this API on :4000 counts as
  // cross-origin, so we must explicitly allow it.
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );

  // ---- 2. Body parsing ----
  // Raw HTTP bodies arrive as a stream of bytes. This middleware reads
  // that stream, parses it as JSON, and puts the result on `req.body`.
  // WITHOUT THIS LINE, req.body IS UNDEFINED. This trips up everyone once.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ---- 3. A tiny request logger ----
  // Demonstrates the middleware contract: do something, then call next().
  // If you forget next(), the request hangs forever. Try it once to see.
  app.use((req: Request, _res: Response, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });


  // ---- 4. Health check ----
  // Render, Railway, and every load balancer ping an endpoint like this
  // to decide whether your service is alive. Always ship one.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  // ---- 5. API routes ----
  // Module routers get mounted here in Part 4 onwards, e.g.:
  //   app.use("/api/auth", authRouter);
  //   app.use("/api/customers", customerRouter);

  // ---- 6. 404 handler ----
  // Placed AFTER all routes. If we reach here, nothing matched.
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // ---- 7. Error handler goes here (Part 3) ----
  // Express identifies error handlers by their FOUR arguments:
  // (err, req, res, next). It must be registered last.

  return app;
};
