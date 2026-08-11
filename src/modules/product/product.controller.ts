import { Request, Response } from "express";
import { productService } from "./product.service";
import { sendSuccess, sendCreated } from "../../utils/apiResponse";
import { UnauthorizedError } from "../../utils/AppError";
import { ListProductsQuery, ListMovementsQuery } from "./product.schema";

export const productController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListProductsQuery;
    const { products, meta } = await productService.list(query);

    sendSuccess(res, products, "Products retrieved", 200, meta);
  },

  async getById(req: Request, res: Response): Promise<void> {
    const product = await productService.getById(req.params.id);

    sendSuccess(res, product, "Product retrieved");
  },

  async create(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const product = await productService.create(req.body, req.user.id);

    sendCreated(res, product, "Product created successfully");
  },

  async update(req: Request, res: Response): Promise<void> {
    const product = await productService.update(req.params.id, req.body);

    sendSuccess(res, product, "Product updated successfully");
  },

  async adjustStock(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();

    const product = await productService.adjustStock(
      req.params.id,
      req.body,
      req.user.id
    );

    sendSuccess(res, product, "Stock adjusted successfully");
  },

  async listMovements(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListMovementsQuery;

    const { movements, meta } = await productService.listMovements(
      req.params.id,
      query
    );

    sendSuccess(res, movements, "Stock movements retrieved", 200, meta);
  },

  async lowStock(_req: Request, res: Response): Promise<void> {
    const products = await productService.getLowStock();

    sendSuccess(res, products, "Low stock products retrieved");
  },

  async categories(_req: Request, res: Response): Promise<void> {
    const categories = await productService.getCategories();

    sendSuccess(res, categories, "Categories retrieved");
  },

  async stats(_req: Request, res: Response): Promise<void> {
    const stats = await productService.getStats();

    sendSuccess(res, stats, "Product stats retrieved");
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const product = await productService.deactivate(req.params.id);

    sendSuccess(res, product, "Product deactivated");
  },
};
