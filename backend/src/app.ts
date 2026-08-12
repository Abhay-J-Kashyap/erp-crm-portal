import express, { Application, Request, Response } from "express";
import cors from "cors";
import { env } from "./config/env";
import { corsOptions } from "./config/cors";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { sendSuccess } from "./utils/apiResponse";
import { authRouter } from "./modules/auth/auth.routes";
import { customerRouter } from "./modules/customer/customer.routes";
import { productRouter } from "./modules/product/product.routes";
import { challanRouter } from "./modules/challan/challan.routes";

export const createApp = (): Application => {
  const app = express();

  /**
   * trust proxy: Render/Vercel sit behind a load balancer that
   * terminates TLS. Without this, req.protocol reports "http" and
   * req.ip reports the proxy's address rather than the client's.
   */
  app.set("trust proxy", 1);

  app.use(cors(corsOptions));

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
  app.use("/api/products", productRouter);
  app.use("/api/challans", challanRouter);

  app.use(notFoundHandler);
  app.use(errorHandler); // must be LAST

  return app;
};
