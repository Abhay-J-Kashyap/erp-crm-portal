import { Request, Response } from "express";
import { customerService } from "./customer.service";
import { sendSuccess, sendCreated, getPagination } from "../../utils/apiResponse";
import { UnauthorizedError } from "../../utils/AppError";
import { ListCustomersQuery } from "./customer.schema";

export const customerController = {
  async list(req: Request, res: Response): Promise<void> {
    // Safe to cast: the validate middleware already parsed req.query
    // against listCustomersQuerySchema, so defaults and coercion applied.
    const query = req.query as unknown as ListCustomersQuery;

    const { customers, meta } = await customerService.list(query);

    sendSuccess(res, customers, "Customers retrieved", 200, meta);
  },

  async getById(req: Request, res: Response): Promise<void> {
    const customer = await customerService.getById(req.params.id);

    sendSuccess(res, customer, "Customer retrieved");
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const customer = await customerService.create(req.body, req.user.id);

    sendCreated(res, customer, "Customer created successfully");
  },

  async update(req: Request, res: Response): Promise<void> {
    const customer = await customerService.update(req.params.id, req.body);

    sendSuccess(res, customer, "Customer updated successfully");
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const customer = await customerService.deactivate(req.params.id);

    sendSuccess(res, customer, "Customer deactivated");
  },

  async reactivate(req: Request, res: Response): Promise<void> {
    const customer = await customerService.reactivate(req.params.id);

    sendSuccess(res, customer, "Customer reactivated");
  },

  async addFollowUp(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const followUp = await customerService.addFollowUp(
      req.params.id,
      req.body,
      req.user.id
    );

    sendCreated(res, followUp, "Follow-up added");
  },

  async listFollowUps(req: Request, res: Response): Promise<void> {
    const { page, limit } = getPagination(req.query.page, req.query.limit);

    const { followUps, meta } = await customerService.listFollowUps(
      req.params.id,
      page,
      limit
    );

    sendSuccess(res, followUps, "Follow-ups retrieved", 200, meta);
  },

  async stats(_req: Request, res: Response): Promise<void> {
    const stats = await customerService.getStats();

    sendSuccess(res, stats, "Customer stats retrieved");
  },
};
