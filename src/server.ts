import { createApp } from "./app";
import { env } from "./config/env";

/**
 * WHY app.ts AND server.ts ARE SEPARATE FILES
 * -------------------------------------------
 * `app.ts` builds the Express app but never starts listening on a port.
 * `server.ts` is the only place that binds to a port.
 *
 * This split means your tests can import createApp() and fire fake requests
 * at it without ever opening a real socket. It costs you one extra file and
 * buys you a testable application. Standard practice in production Node.
 */

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

/**
 * GRACEFUL SHUTDOWN
 * -----------------
 * When Render or Docker redeploys, it sends your process a SIGTERM signal
 * and then force-kills it a few seconds later. If you ignore the signal,
 * in-flight requests get dropped mid-response.
 *
 * server.close() stops accepting NEW connections but lets existing ones
 * finish. Small detail; interviewers notice it.
 */
const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });

  // Safety net: if something hangs, don't wait forever.
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C

// A promise that rejects with nobody to catch it would otherwise
// crash silently or leave the process in a bad state.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  shutdown("unhandledRejection");
});
