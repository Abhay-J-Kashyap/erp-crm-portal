import { Router } from "express";
import { Role } from "@prisma/client";
import { customerController } from "./customer.controller";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  createFollowUpSchema,
  uuidParamSchema,
} from "./customer.schema";
import { validate } from "../../middleware/validate";
import { authenticate, authorize } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

/**
 * ROUTER-LEVEL MIDDLEWARE.
 * Applied here rather than repeated on every route. Every customer
 * endpoint requires a logged-in user, so state it once.
 *
 * This is also a security property: a new route added below is protected
 * BY DEFAULT. Per-route middleware fails open — forget it and the
 * endpoint is public, with nothing to warn you.
 */
router.use(authenticate);

/**
 * WHO CAN DO WHAT
 * ---------------
 * Read  — everyone. Warehouse needs the delivery address; accounts needs
 *         the GST number.
 * Write — SALES and ADMIN. The warehouse team has no business editing
 *         CRM records.
 * Deactivate — ADMIN only. Destructive-ish and rarely needed.
 */
const canWrite = authorize(Role.ADMIN, Role.SALES);
const adminOnly = authorize(Role.ADMIN);

// ---- Static routes BEFORE parameterised ones ----
/**
 * ROUTE ORDER MATTERS. Express matches top to bottom, first match wins.
 * If "/:id" were declared above "/stats", the string "stats" would match
 * the :id parameter, and you would get "Invalid id format" from the UUID
 * validator instead of your stats. Always put literal paths first.
 */
router.get("/stats", asyncHandler(customerController.stats));

// ---- Collection ----

router.get(
  "/",
  validate({ query: listCustomersQuerySchema }),
  asyncHandler(customerController.list)
);

router.post(
  "/",
  canWrite,
  validate({ body: createCustomerSchema }),
  asyncHandler(customerController.create)
);

// ---- Single resource ----

router.get(
  "/:id",
  validate({ params: uuidParamSchema }),
  asyncHandler(customerController.getById)
);

router.patch(
  "/:id",
  canWrite,
  validate({ params: uuidParamSchema, body: updateCustomerSchema }),
  asyncHandler(customerController.update)
);

router.delete(
  "/:id",
  adminOnly,
  validate({ params: uuidParamSchema }),
  asyncHandler(customerController.deactivate)
);

router.patch(
  "/:id/reactivate",
  adminOnly,
  validate({ params: uuidParamSchema }),
  asyncHandler(customerController.reactivate)
);

// ---- Follow-ups (sub-resource) ----

router.get(
  "/:id/follow-ups",
  validate({ params: uuidParamSchema }),
  asyncHandler(customerController.listFollowUps)
);

router.post(
  "/:id/follow-ups",
  canWrite,
  validate({ params: uuidParamSchema, body: createFollowUpSchema }),
  asyncHandler(customerController.addFollowUp)
);

export const customerRouter = router;
