import { z } from "zod";
import { CustomerType, CustomerStatus } from "@prisma/client";

/**
 * Reusable pieces. Defining `mobileSchema` once means the rule lives in
 * one place — change it here and every endpoint that uses it updates.
 */

const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Mobile must be a 10-digit Indian number starting with 6-9");

// GSTIN format: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum.
const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/,
    "Invalid GSTIN format (example: 29ABCDE1234F1Z5)"
  );

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid id format"),
});

// ============================================================
// CREATE
// ============================================================

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),

  mobile: mobileSchema,

  /**
   * WHY .or(z.literal("")) — a real-world detail.
   * HTML inputs submit "" when left blank, not undefined. Plain
   * .email().optional() rejects "" with "invalid email", which is a
   * confusing error for a field the user deliberately skipped.
   * We accept "" and normalise it to undefined below.
   */
  email: z.string().trim().toLowerCase().email("Invalid email address").optional().or(z.literal("")),

  businessName: z.string().trim().max(160).optional().or(z.literal("")),

  gstNumber: gstSchema.optional().or(z.literal("")),

  customerType: z.nativeEnum(CustomerType).default(CustomerType.RETAIL),

  addressLine: z.string().trim().max(255).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Pincode must be 6 digits")
    .optional()
    .or(z.literal("")),

  status: z.nativeEnum(CustomerStatus).default(CustomerStatus.LEAD),

  // z.coerce.date() accepts an ISO string from JSON and produces a Date.
  followUpDate: z.coerce.date().optional().nullable(),

  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

// ============================================================
// UPDATE
// ============================================================

/**
 * .partial() makes EVERY field optional in one call — exactly PATCH
 * semantics. Written by hand you'd duplicate all 13 fields and they
 * would drift apart within a week.
 *
 * .refine() then rejects an empty body, which would otherwise be a
 * silent no-op returning 200 and confusing the caller.
 */
export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// ============================================================
// LIST QUERY
// ============================================================

/**
 * SORT WHITELIST — a security control, not a convenience.
 *
 * If sortBy came straight from the query string, a caller could sort by
 * `passwordHash` on a user endpoint and infer values from the ordering.
 * With enough requests that leaks data one comparison at a time.
 *
 * z.enum means anything outside this list is a 400 before it reaches
 * the database. NEVER interpolate user input into a query structure.
 */
export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),

  search: z.string().trim().max(120).optional(),

  status: z.nativeEnum(CustomerStatus).optional(),
  customerType: z.nativeEnum(CustomerType).optional(),
  city: z.string().trim().max(80).optional(),

  // "customers due for follow-up on or before today"
  followUpBefore: z.coerce.date().optional(),

  includeInactive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  sortBy: z
    .enum(["createdAt", "name", "followUpDate", "status"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================================
// FOLLOW-UPS
// ============================================================

export const createFollowUpSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty").max(2000),

  // Optionally reschedule the next follow-up in the same call — this is
  // what a salesperson actually does: log the call, set the next one.
  nextFollowUpDate: z.coerce.date().optional().nullable(),

  status: z.nativeEnum(CustomerStatus).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
