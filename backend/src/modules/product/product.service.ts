import { Prisma, MovementType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError, ConflictError } from "../../utils/AppError";
import { buildMeta } from "../../utils/apiResponse";
import {
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
  AdjustStockInput,
  ListMovementsQuery,
} from "./product.schema";

const emptyToUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned) as (keyof T)[]) {
    if (cleaned[key] === "") cleaned[key] = undefined as T[keyof T];
  }
  return cleaned;
};

export const productService = {
  /**
   * LIST
   */
  async list(query: ListProductsQuery) {
    const { page, limit, search, category, location, lowStock, includeInactive, sortBy, sortOrder } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: includeInactive ? undefined : true,
      category: category ? { equals: category, mode: "insensitive" } : undefined,
      location: location ? { equals: location, mode: "insensitive" } : undefined,

      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    /**
     * COMPARING TWO COLUMNS: currentStock <= minStockAlert.
     *
     * Prisma's `where` compares a column to a VALUE, not to another
     * column, so there is no way to express this in the fluent API.
     * Raw SQL is the escape hatch.
     *
     * Note Prisma.sql uses PARAMETERISED queries — values are sent
     * separately from the SQL text, so they can never be interpreted as
     * SQL. That is what prevents injection. NEVER build raw SQL by
     * string-concatenating user input.
     */
    if (lowStock) {
      const lowStockIds = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM products WHERE current_stock <= min_stock_alert AND is_active = true`
      );
      where.id = { in: lowStockIds.map((r) => r.id) };
    }

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          unitPrice: true,
          currentStock: true,
          minStockAlert: true,
          location: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    /**
     * A COMPUTED FIELD. isLowStock isn't stored — it's derived on read.
     * Storing it would mean keeping yet another value in sync with
     * currentStock. Derive anything you can cheaply derive.
     */
    const withFlags = products.map((p) => ({
      ...p,
      isLowStock: p.currentStock <= p.minStockAlert,
    }));

    return { products: withFlags, meta: buildMeta(page, limit, total) };
  },

  /**
   * DETAIL — includes recent ledger entries.
   */
  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            createdBy: { select: { id: true, name: true } },
            challan: { select: { id: true, challanNumber: true } },
          },
        },
        _count: { select: { stockMovements: true, challanItems: true } },
      },
    });

    if (!product) throw new NotFoundError("Product");

    return { ...product, isLowStock: product.currentStock <= product.minStockAlert };
  },

  /**
   * CREATE — product plus its opening-stock ledger entry, atomically.
   */
  async create(input: CreateProductInput, userId: string) {
    const data = emptyToUndefined(input);

    const existing = await prisma.product.findUnique({
      where: { sku: data.sku },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(`A product with SKU ${data.sku} already exists`);
    }

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: data.name,
          sku: data.sku,
          category: data.category,
          unitPrice: data.unitPrice, // string -> Postgres NUMERIC, no float involved
          currentStock: data.openingStock,
          minStockAlert: data.minStockAlert,
          location: data.location,
        },
      });

      // Even the opening balance gets a ledger row, so `current_stock`
      // is ALWAYS explainable as the sum of movements.
      if (data.openingStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            quantity: data.openingStock,
            movementType: MovementType.IN,
            reason: "Opening stock",
            stockAfter: data.openingStock,
            createdById: userId,
          },
        });
      }

      return product;
    });
  },

  async update(id: string, input: UpdateProductInput) {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) throw new NotFoundError("Product");

    const data = emptyToUndefined(input);

    if (data.sku) {
      const duplicate = await prisma.product.findFirst({
        where: { sku: data.sku, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError(`Another product already uses SKU ${data.sku}`);
      }
    }

    return prisma.product.update({ where: { id }, data });
  },

  /**
   * ============================================================
   * ADJUST STOCK — the important one.
   * ============================================================
   */
  async adjustStock(
    productId: string,
    input: AdjustStockInput,
    userId: string,
    challanId?: string
  ) {
    const { quantity, movementType, reason } = input;

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, sku: true, currentStock: true, isActive: true },
      });

      if (!product) throw new NotFoundError("Product");

      if (!product.isActive) {
        throw new ConflictError("Cannot adjust stock for an inactive product");
      }

      const delta = movementType === MovementType.IN ? quantity : -quantity;

      /**
       * THE RACE-SAFE WRITE
       * -------------------
       * The naive version is:
       *
       *   if (product.currentStock < quantity) throw ...
       *   await tx.product.update({ data: { currentStock: newValue } })
       *
       * Two concurrent requests both read 15, both pass the check, and
       * both write 5. Twenty units leave a stock of fifteen.
       *
       * Instead we put the guard INSIDE the WHERE clause. This compiles to:
       *
       *   UPDATE products SET current_stock = current_stock - 10
       *   WHERE id = ? AND current_stock >= 10
       *
       * Postgres evaluates the condition and applies the change as ONE
       * indivisible statement. The loser of the race matches zero rows.
       *
       * `increment` is also key — it means "add to whatever is there
       * now", computed by the database. Sending a precomputed absolute
       * value would reintroduce the stale-read problem.
       */
      const result = await tx.product.updateMany({
        where:
          movementType === MovementType.OUT
            ? { id: productId, currentStock: { gte: quantity } }
            : { id: productId },
        data: { currentStock: { increment: delta } },
      });

      // Zero rows updated => the condition failed => insufficient stock.
      if (result.count === 0) {
        throw new ConflictError(
          `Insufficient stock for ${product.name} (${product.sku}). Available: ${product.currentStock}, requested: ${quantity}`,
          {
            productId,
            sku: product.sku,
            available: product.currentStock,
            requested: quantity,
          }
        );
      }

      // Re-read INSIDE the transaction to get the true post-update value.
      // product.currentStock from earlier is a stale snapshot.
      const updated = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: {
          id: true, name: true, sku: true, currentStock: true,
          minStockAlert: true, unitPrice: true,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          quantity,
          movementType,
          reason,
          stockAfter: updated.currentStock, // the audit anchor
          createdById: userId,
          challanId,
        },
      });

      return {
        ...updated,
        isLowStock: updated.currentStock <= updated.minStockAlert,
      };
    });
  },

  async listMovements(productId: string, query: ListMovementsQuery) {
    const { page, limit, movementType, from, to } = query;
    const skip = (page - 1) * limit;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundError("Product");

    const where: Prisma.StockMovementWhereInput = {
      productId,
      movementType,
      // Only build the date filter if at least one bound was given.
      createdAt: from || to ? { gte: from, lte: to } : undefined,
    };

    const [movements, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, name: true } },
          challan: { select: { id: true, challanNumber: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return { movements, meta: buildMeta(page, limit, total) };
  },

  async getLowStock() {
    const products = await prisma.$queryRaw<
      Array<{
        id: string; name: string; sku: string;
        current_stock: number; min_stock_alert: number; location: string | null;
      }>
    >(
      Prisma.sql`
        SELECT id, name, sku, current_stock, min_stock_alert, location
        FROM products
        WHERE current_stock <= min_stock_alert AND is_active = true
        ORDER BY (current_stock - min_stock_alert) ASC
      `
    );

    // Raw SQL returns snake_case column names — map back to camelCase so
    // the API stays consistent with every other endpoint.
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      currentStock: p.current_stock,
      minStockAlert: p.min_stock_alert,
      location: p.location,
      shortfall: p.min_stock_alert - p.current_stock,
    }));
  },

  async getCategories() {
    const rows = await prisma.product.findMany({
      where: { isActive: true, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });

    return rows.map((r) => r.category).filter((c): c is string => c !== null);
  },

  async deactivate(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!product) throw new NotFoundError("Product");
    if (!product.isActive) throw new ConflictError("Product is already inactive");

    return prisma.product.update({ where: { id }, data: { isActive: false } });
  },

  async getStats() {
    const [total, lowStock, totalUnits] = await prisma.$transaction([
      prisma.product.count({ where: { isActive: true } }),
      prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM products WHERE current_stock <= min_stock_alert AND is_active = true`
      ),
      prisma.product.aggregate({
        where: { isActive: true },
        _sum: { currentStock: true },
      }),
    ]);

    return {
      totalProducts: total,
      // Postgres COUNT returns bigint, which JSON.stringify cannot
      // serialise — it throws "Do not know how to serialize a BigInt".
      // Convert to Number explicitly.
      lowStockCount: Number(lowStock[0]?.count ?? 0),
      totalUnitsInStock: totalUnits._sum.currentStock ?? 0,
    };
  },
};
