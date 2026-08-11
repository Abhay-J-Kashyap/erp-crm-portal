import { z } from "zod";
import { Role } from "@prisma/client";

/**
 * VALIDATION RULES ARE PRODUCT DECISIONS
 * --------------------------------------
 * Every constraint here is a choice about what your system accepts.
 * Too loose and bad data gets in; too strict and real users get locked
 * out. Write them deliberately rather than copying a regex off the internet.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please provide a valid email address")
    // Emails are case-insensitive in practice. Normalising here means
    // "Admin@ERP.com" matches the stored "admin@erp.com".
    .toLowerCase()
    .trim(),

  // Deliberately NO complexity rules on login — only on registration.
  // Validating password strength at login tells an attacker which
  // passwords are worth trying, and locks out users whose password
  // predates your current policy.
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120).trim(),

  email: z.string().email("Please provide a valid email address").toLowerCase().trim(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters") // bcrypt truncates past 72 bytes
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/\d/, "Password must contain a number"),

  // z.nativeEnum reuses the Prisma enum directly, so adding a role to
  // schema.prisma automatically updates this validation. One source of truth.
  role: z.nativeEnum(Role, {
    errorMap: () => ({ message: `Role must be one of: ${Object.values(Role).join(", ")}` }),
  }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(72)
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/\d/, "Password must contain a number"),
  })
  // .refine validates ACROSS fields — impossible with per-field rules.
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"], // attach the error to this field for the form
  });

// Types derived from the schemas. Never write these by hand.
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
