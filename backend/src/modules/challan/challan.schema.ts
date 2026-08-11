import { z } from "zod";
import { ChallanStatus } from "@prisma/client";

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid id format"),
});

// ============================================================
// CREATE
// ============================================================

const challanItemSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero"),
});

export const createChallanSchema = z.object({
  customerId: z.string().uuid("Invalid customer id"),

  /**
   * .min(1) — a challan with no line items is meaningless. Rejecting it
   * here means the service never has to handle an empty-items case.
   *
   * .max(100) — an upper bound on how many rows one transaction touches.
   * Without it, a request with 10,000 items would hold locks on 10,000
   * product rows for seconds, blocking every other confirmation.
   * Always bound anything a client controls the size of.
   */
  items: z.array(challanItemSchema).min(1, "At least one item is required").max(100),

  /**
   * Only DRAFT or CONFIRMED at creation. You cannot create something
   * already cancelled — that's a state you transition INTO, never start in.
   * Encoding the state machine in the validation layer means the service
   * doesn't have to defend against nonsense input.
   */
  status: z.enum([ChallanStatus.DRAFT, ChallanStatus.CONFIRMED]).default(ChallanStatus.DRAFT),

  remarks: z.string().trim().max(500).optional().or(z.literal("")),
});

// ============================================================
// UPDATE — drafts only, enforced in the service
// ============================================================

export const updateChallanSchema = z
  .object({
    customerId: z.string().uuid("Invalid customer id"),
    items: z.array(challanItemSchema).min(1).max(100),
    remarks: z.string().trim().max(500).or(z.literal("")),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const cancelChallanSchema = z.object({
  reason: z.string().trim().min(3, "Cancellation reason is required").max(255),
});

// ============================================================
// LIST
// ============================================================

export const listChallansQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),

  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(ChallanStatus).optional(),
  customerId: z.string().uuid().optional(),

  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),

  sortBy: z
    .enum(["createdAt", "challanNumber", "totalAmount", "totalQuantity"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateChallanInput = z.infer<typeof createChallanSchema>;
export type UpdateChallanInput = z.infer<typeof updateChallanSchema>;
export type CancelChallanInput = z.infer<typeof cancelChallanSchema>;
export type ListChallansQuery = z.infer<typeof listChallansQuerySchema>;
