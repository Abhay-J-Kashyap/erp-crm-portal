import { Request, Response } from "express";
import { authService } from "./auth.service";
import { sendSuccess, sendCreated } from "../../utils/apiResponse";
import { UnauthorizedError } from "../../utils/AppError";

/**
 * CONTROLLERS ARE THIN BY DESIGN.
 * Read input -> call service -> send response. Nothing else.
 *
 * No try/catch: asyncHandler (applied in the routes file) forwards any
 * rejection to the central error handler. No manual status codes for
 * errors: those come from the AppError subclass the service threw.
 *
 * If a controller grows past ~10 lines, logic has leaked into the wrong
 * layer — move it into the service.
 */

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body);

    sendSuccess(res, result, "Logged in successfully");
  },

  async register(req: Request, res: Response): Promise<void> {
    const user = await authService.register(req.body);

    sendCreated(res, user, "User created successfully");
  },

  async me(req: Request, res: Response): Promise<void> {
    // req.user is optional in the type because it only exists after
    // `authenticate` runs. This guard satisfies TypeScript AND catches
    // the real bug where a route forgot the authenticate middleware.
    if (!req.user) {
      throw new UnauthorizedError();
    }

    const user = await authService.getCurrentUser(req.user.id);

    sendSuccess(res, user, "Current user retrieved");
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    await authService.changePassword(req.user.id, req.body);

    sendSuccess(res, null, "Password changed successfully");
  },

  async listUsers(_req: Request, res: Response): Promise<void> {
    const users = await authService.listUsers();

    sendSuccess(res, users, "Users retrieved");
  },

  async setUserActive(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    const user = await authService.setUserActive(
      req.params.id,
      req.body.isActive,
      req.user.id
    );

    sendSuccess(res, user, "User status updated");
  },
};
