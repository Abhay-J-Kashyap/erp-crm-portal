import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { authController } from "./auth.controller";
import { loginSchema, registerSchema, changePasswordSchema } from "./auth.schema";
import { validate } from "../../middleware/validate";
import { authenticate, authorize } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";

/**
 * A ROUTER IS A MINI-APP.
 * It collects related routes and gets mounted at a prefix in app.ts:
 *   app.use("/api/auth", authRouter)
 * So `router.post("/login")` becomes POST /api/auth/login.
 *
 * READ EACH LINE LEFT TO RIGHT — that is the exact execution order:
 *   path -> authenticate -> authorize -> validate -> controller
 *
 * Ordering is not cosmetic. `authorize` must follow `authenticate`
 * because it reads req.user. `validate` sits last so that an
 * unauthenticated request is rejected before you spend any effort
 * parsing its body.
 */

const router = Router();

// ---- Public ----

router.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(authController.login)
);

// ---- Authenticated (any role) ----

router.get("/me", authenticate, asyncHandler(authController.me));

router.post(
  "/change-password",
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
);

// ---- Admin only ----

router.post(
  "/register",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: registerSchema }),
  asyncHandler(authController.register)
);

router.get(
  "/users",
  authenticate,
  authorize(Role.ADMIN),
  asyncHandler(authController.listUsers)
);

router.patch(
  "/users/:id/status",
  authenticate,
  authorize(Role.ADMIN),
  validate({
    params: z.object({ id: z.string().uuid("Invalid user id") }),
    body: z.object({ isActive: z.boolean() }),
  }),
  asyncHandler(authController.setUserActive)
);

export const authRouter = router;
