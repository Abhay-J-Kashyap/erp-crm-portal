import { Router } from "express";
import { Role } from "@prisma/client";
import { challanController } from "./challan.controller";
import {
  createChallanSchema,
  updateChallanSchema,
  cancelChallanSchema,
  listChallansQuerySchema,
  uuidParamSchema,
} from "./challan.schema";
import { validate } from "../../middleware/validate";
import { authenticate, authorize } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

router.use(authenticate);

/**
 * ROLES
 * Read    - everyone. Warehouse packs it, accounts invoices it.
 * Create  - ADMIN and SALES. Sales raises the challan.
 * Confirm - ADMIN, SALES and WAREHOUSE. Warehouse confirms at dispatch,
 *           which is when stock physically leaves the building.
 * Cancel  - ADMIN only. It reverses stock, so it needs a higher bar.
 */
const canCreate = authorize(Role.ADMIN, Role.SALES);
const canConfirm = authorize(Role.ADMIN, Role.SALES, Role.WAREHOUSE);
const adminOnly = authorize(Role.ADMIN);

// Static before parameterised.
router.get("/stats", asyncHandler(challanController.stats));

router.get(
  "/",
  validate({ query: listChallansQuerySchema }),
  asyncHandler(challanController.list)
);

router.post(
  "/",
  canCreate,
  validate({ body: createChallanSchema }),
  asyncHandler(challanController.create)
);

router.get(
  "/:id",
  validate({ params: uuidParamSchema }),
  asyncHandler(challanController.getById)
);

router.patch(
  "/:id",
  canCreate,
  validate({ params: uuidParamSchema, body: updateChallanSchema }),
  asyncHandler(challanController.update)
);

/**
 * POST, not PATCH. Confirming is not "editing the status field" — it
 * deducts stock across N products and writes N ledger rows. The verb
 * should reflect that this is an ACTION with side effects, not a field
 * assignment. Sub-resource action routes like this are a common and
 * readable REST pattern.
 */
router.post(
  "/:id/confirm",
  canConfirm,
  validate({ params: uuidParamSchema }),
  asyncHandler(challanController.confirm)
);

router.post(
  "/:id/cancel",
  adminOnly,
  validate({ params: uuidParamSchema, body: cancelChallanSchema }),
  asyncHandler(challanController.cancel)
);

export const challanRouter = router;
