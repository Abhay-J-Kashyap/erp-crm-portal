import bcrypt from "bcryptjs";
import { Role, User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { signToken } from "../../utils/jwt";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "../../utils/AppError";
import { LoginInput, RegisterInput, ChangePasswordInput } from "./auth.schema";

const BCRYPT_COST = 10;

/**
 * A REAL bcrypt hash of a throwaway string, used only to burn time on the
 * "user not found" path (see login below).
 *
 * It must be a VALID hash. bcrypt.compare returns false IMMEDIATELY when
 * the hash is malformed — it never runs the key derivation. A made-up
 * string like "$2b$10$invalid..." therefore costs 0ms instead of ~90ms,
 * which leaves exactly the timing side-channel you were trying to close.
 * Measure it if you change this.
 */
const DUMMY_HASH = "$2b$10$sFem8KrF2QWknWAzp8fdA.Oo9BLcW6PxM86QFp12utSrg.SI30J6y";

/**
 * Strips passwordHash before anything leaves the service.
 *
 * Doing this in ONE place matters. If each controller remembered to
 * delete the field, one of them eventually wouldn't — and a leaked hash
 * is an offline brute-force target. Make the safe path the only path.
 */
type SafeUser = Omit<User, "passwordHash">;

const toSafeUser = (user: User): SafeUser => {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
};

export const authService = {
  /**
   * LOGIN
   */
  async login(input: LoginInput): Promise<{ user: SafeUser; token: string }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    /**
     * THE IDENTICAL ERROR MESSAGE IS DELIBERATE.
     * -----------------------------------------
     * If "no such user" and "wrong password" returned different messages,
     * an attacker could enumerate valid emails: submit a garbage password
     * against a list of addresses and note which ones say "wrong password".
     * That gives them a confirmed list of accounts to attack, and confirms
     * who has an account with you — a privacy leak on its own.
     *
     * One message for both. This is called preventing USER ENUMERATION.
     */
    const genericError = new UnauthorizedError("Invalid email or password");

    if (!user) {
      /**
       * TIMING ATTACK DEFENCE.
       * bcrypt.compare takes ~100ms. Returning immediately here would
       * make "user not found" measurably faster than "wrong password" —
       * a timing side-channel that leaks the same information the
       * generic message was hiding.
       *
       * So we hash against a dummy value to burn equivalent time.
       */
      await bcrypt.compare(input.password, DUMMY_HASH);
      throw genericError;
    }

    if (!user.isActive) {
      throw new UnauthorizedError("This account has been deactivated");
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw genericError;
    }

    const token = signToken({ sub: user.id, role: user.role });

    return { user: toSafeUser(user), token };
  },

  /**
   * REGISTER — admin-only in this system. Employees don't self-register
   * into an internal ERP; an admin provisions them.
   */
  async register(input: RegisterInput): Promise<SafeUser> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
    });

    return toSafeUser(user);
  },

  /**
   * CURRENT USER — the frontend calls this on page load to restore a
   * session from a stored token, and to get fresh role data.
   */
  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError("User");
    }

    return toSafeUser(user);
  },

  /**
   * CHANGE PASSWORD — requires the current password even though the user
   * is already authenticated. This defends against an unattended logged-in
   * session being used to lock the real owner out of their account.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError("User");
    }

    const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    /**
     * KNOWN LIMITATION, worth stating in your README:
     * Existing tokens remain valid after a password change, because JWTs
     * can't be revoked. A production system would store a
     * `passwordChangedAt` timestamp and reject tokens issued before it.
     */
  },

  /**
   * LIST USERS — admin only. Used by the frontend's user management screen.
   */
  async listUsers(): Promise<SafeUser[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });

    return users.map(toSafeUser);
  },

  /**
   * TOGGLE ACTIVE — soft deactivation instead of deleting. A deleted user
   * would orphan every challan and stock movement they created.
   */
  async setUserActive(userId: string, isActive: boolean, actingUserId: string): Promise<SafeUser> {
    if (userId === actingUserId && !isActive) {
      throw new BadRequestError("You cannot deactivate your own account");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    return toSafeUser(user);
  },
};

export const ADMIN_ROLE = Role.ADMIN;
