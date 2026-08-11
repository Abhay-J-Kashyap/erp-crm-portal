import { Router } from "express";
import { Role } from "@prisma/client";
import { productController } from "./product.controller";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  adjustStockSchema,
  listMovementsQuerySchema,
  uuidParamSchema,
} from "./product.schema";
import { validate } from "../../middleware/validate";
import { authenticate, authorize } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

router.use(authenticate);

/**
 * ROLE MAPPING — note this differs from customers, and that's the point.
 * Authorization should mirror how the business actually works.
 *
 * Read           — everyone. Sales needs prices, accounts needs values.
 * Create/edit    — ADMIN and WAREHOUSE. Sales must not be able to change
 *                  a price mid-negotiation.
 * Adjust stock   — ADMIN and WAREHOUSE only. This is the physical
 *                  inventory; sales never touches it directly. Sales
 *                  moves stock INDIRECTLY, by confirming a challan.
 * Deactivate     — ADMIN only.
 */
const canManage = authorize(Role.ADMIN, Role.WAREHOUSE);
const adminOnly = authorize(Role.ADMIN);

// ---- Static routes first (see the /:id shadowing note in customers) ----

router.get("/low-stock", asyncHandler(productController.lowStock));
router.get("/categories", asyncHandler(productController.categories));
router.get("/stats", asyncHandler(productController.stats));

// ---- Collection ----

router.get(
  "/",
  validate({ query: listProductsQuerySchema }),
  asyncHandler(productController.list)
);

router.post(
  "/",
  canManage,
  validate({ body: createProductSchema }),
  asyncHandler(productController.create)
);

// ---- Single resource ----

router.get(
  "/:id",
  validate({ params: uuidParamSchema }),
  asyncHandler(productController.getById)
);

router.patch(
  "/:id",
  canManage,
  validate({ params: uuidParamSchema, body: updateProductSchema }),
  asyncHandler(productController.update)
);

router.delete(
  "/:id",
  adminOnly,
  validate({ params: uuidParamSchema }),
  asyncHandler(productController.deactivate)
);

// ---- Stock ----

/**
 * POST, not PATCH. Adjusting stock CREATES a movement record — it is an
 * append to a ledger, not an edit of a field. The verb should reflect
 * what actually happens.
 */
router.post(
  "/:id/stock",
  canManage,
  validate({ params: uuidParamSchema, body: adjustStockSchema }),
  asyncHandler(productController.adjustStock)
);

router.get(
  "/:id/movements",
  validate({ params: uuidParamSchema, query: listMovementsQuerySchema }),
  asyncHandler(productController.listMovements)
);

export const productRouter = router;
