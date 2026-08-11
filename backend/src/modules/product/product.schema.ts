import { z } from "zod";
import { MovementType } from "@prisma/client";

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid id format"),
});

/**
 * MONEY VALIDATION
 * ----------------
 * Accepted as a STRING, not a number. Sending money as a JSON number
 * means it passes through a JavaScript float on the way in, and
 * 1234567.89 is not exactly representable. Keeping it a string
 * preserves the exact digits all the way to Postgres NUMERIC.
 *
 * The regex enforces at most 2 decimal places, matching Decimal(12,2).
 * Without it, "450.999" would be silently rounded by the database —
 * better to reject it and let the user see what happened.
 */
const priceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Price must be a number with up to 2 decimal places")
  .refine((v) => Number(v) >= 0, "Price cannot be negative");

/**
 * SKU: Stock Keeping Unit — your internal product code. Uppercased so
 * "sp-2in" and "SP-2IN" can't both exist as separate products. The
 * database UNIQUE constraint is case-sensitive, so normalising here is
 * what actually prevents the duplicate.
 */
const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "SKU must be at least 2 characters")
  .max(40)
  .regex(/^[A-Z0-9\-_]+$/, "SKU may only contain letters, numbers, hyphens and underscores");

// ============================================================
// PRODUCT CRUD
// ============================================================

export const createProductSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160),
  sku: skuSchema,
  category: z.string().trim().max(80).optional().or(z.literal("")),
  unitPrice: priceSchema,

  /**
   * Opening stock is optional and defaults to 0. When supplied, the
   * service writes a matching StockMovement so even the very first
   * quantity has a ledger entry explaining it.
   */
  openingStock: z.coerce.number().int().min(0, "Opening stock cannot be negative").default(0),

  minStockAlert: z.coerce.number().int().min(0).default(0),
  location: z.string().trim().max(80).optional().or(z.literal("")),
});

/**
 * NOTE WHAT IS MISSING: currentStock.
 *
 * Stock is NEVER editable through the product update endpoint. If it
 * were, someone could set it to any number with no ledger entry, and
 * your audit trail would have a hole in it. Every change to stock must
 * go through the adjust endpoint, which always writes a movement.
 *
 * This is a design decision worth stating explicitly in your README.
 */
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    sku: skuSchema,
    category: z.string().trim().max(80).or(z.literal("")),
    unitPrice: priceSchema,
    minStockAlert: z.coerce.number().int().min(0),
    location: z.string().trim().max(80).or(z.literal("")),
    isActive: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// ============================================================
// LIST QUERY
// ============================================================

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),

  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),

  // "show me only products at or below their alert threshold"
  lowStock: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  includeInactive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  sortBy: z
    .enum(["createdAt", "name", "sku", "currentStock", "unitPrice"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================================
// STOCK ADJUSTMENT
// ============================================================

export const adjustStockSchema = z.object({
  /**
   * Always POSITIVE. Direction is carried by movementType, not by the
   * sign of the number.
   *
   * Allowing negative quantities would mean an "IN" movement of -50
   * could remove stock while being labelled as an addition — the ledger
   * would read as nonsense during an audit. One representation, enforced.
   */
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero"),

  movementType: z.nativeEnum(MovementType),

  // Mandatory. A ledger entry with no explanation is nearly useless six
  // months later when someone asks why stock dropped by 200.
  reason: z.string().trim().min(3, "Reason is required").max(255),
});

export const listMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  movementType: z.nativeEnum(MovementType).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
