import { Request, Response } from "express";
import { challanService } from "./challan.service";
import { sendSuccess, sendCreated } from "../../utils/apiResponse";
import { UnauthorizedError } from "../../utils/AppError";
import { ListChallansQuery } from "./challan.schema";

export const challanController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListChallansQuery;
    const { challans, meta } = await challanService.list(query);

    sendSuccess(res, challans, "Challans retrieved", 200, meta);
  },

  async getById(req: Request, res: Response): Promise<void> {
    const challan = await challanService.getById(req.params.id);

    sendSuccess(res, challan, "Challan retrieved");
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const challan = await challanService.create(req.body, req.user.id);

    sendCreated(res, challan, "Challan created successfully");
  },

  async update(req: Request, res: Response): Promise<void> {
    const challan = await challanService.update(req.params.id, req.body);

    sendSuccess(res, challan, "Challan updated successfully");
  },

  async confirm(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const challan = await challanService.confirm(req.params.id, req.user.id);

    sendSuccess(res, challan, "Challan confirmed and stock deducted");
  },

  async cancel(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const challan = await challanService.cancel(req.params.id, req.body, req.user.id);

    sendSuccess(res, challan, "Challan cancelled");
  },

  async stats(_req: Request, res: Response): Promise<void> {
    const stats = await challanService.getStats();

    sendSuccess(res, stats, "Challan stats retrieved");
  },
};
