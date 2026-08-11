import { Prisma, ChallanStatus, MovementType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError, ConflictError, BadRequestError } from "../../utils/AppError";
import { buildMeta } from "../../utils/apiResponse";
import {
  CreateChallanInput,
  UpdateChallanInput,
  CancelChallanInput,
  ListChallansQuery,
} from "./challan.schema";

/**
 * Prisma's transaction client type. Extracting it lets helper functions
 * accept `tx` with full type safety instead of `any`.
 */
type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** The product shape we need for building snapshot lines. */
type ProductForSnapshot = {
  id: string;
  name: string;
  sku: string;
  unitPrice: Prisma.Decimal;
  isActive: boolean;
};

/** A line item as stored on the challan. */
type ChallanLine = { productId: string; quantity: number };

/**
 * MERGE DUPLICATE LINES.
 * A user can add "Steel Pipe x5" twice instead of editing to 10. If we
 * left both lines, we'd try to lock and update the same product row
 * twice inside one transaction — and the stock check would validate
 * 5 and 5 separately rather than 10 against available stock.
 * Collapse them first.
 */
const mergeItems = (items: ChallanLine[]): ChallanLine[] => {
  const merged = new Map<string, number>();

  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  return Array.from(merged.entries())
    .map(([productId, quantity]) => ({ productId, quantity }))
    /**
     * DEADLOCK PREVENTION — sort by productId.
     *
     * Two challans containing the same products in different orders will
     * grab row locks in different orders and deadlock:
     *   A locks X, wants Y | B locks Y, wants X  -> neither proceeds
     *
     * Postgres detects it after ~1s and kills one transaction, so the
     * user sees a random unreproducible failure.
     *
     * Sorting means EVERY transaction acquires locks in the same order,
     * which makes the cycle impossible. One line, whole class of bug gone.
     */
    .sort((a, b) => a.productId.localeCompare(b.productId));
};

/**
 * Reserve the next challan number for the year.
 *
 * `increment` compiles to `last_number = last_number + 1`, evaluated by
 * the database on a locked row — so concurrent callers each get a
 * distinct value. Counting existing challans instead would hand the same
 * number to two simultaneous requests.
 */
const generateChallanNumber = async (tx: TxClient): Promise<string> => {
  const year = new Date().getFullYear();

  const counter = await tx.challanCounter.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return `CH-${year}-${String(counter.lastNumber).padStart(4, "0")}`;
};

/**
 * Deduct stock for every line, writing a ledger entry per product.
 * Uses the same conditional-update guard as Part 6, so a concurrent
 * shipment cannot push stock negative.
 */
const deductStockForItems = async (
  tx: TxClient,
  items: ChallanLine[],
  challanId: string,
  challanNumber: string,
  userId: string
): Promise<void> => {
  // Already sorted by mergeItems — do not reorder here.
  for (const item of items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { id: true, name: true, sku: true, currentStock: true, isActive: true },
    });

    if (!product) {
      throw new NotFoundError(`Product ${item.productId}`);
    }

    if (!product.isActive) {
      throw new ConflictError(`Product ${product.name} (${product.sku}) is inactive`);
    }

    // The guard is INSIDE the WHERE clause, so the check and the write
    // are one indivisible statement.
    const result = await tx.product.updateMany({
      where: { id: item.productId, currentStock: { gte: item.quantity } },
      data: { currentStock: { decrement: item.quantity } },
    });

    if (result.count === 0) {
      /**
       * Throwing here rolls back the ENTIRE transaction — including
       * products already decremented earlier in this loop, and the
       * challan row itself. All or nothing. This is exactly what the
       * PDF means by "if stock is insufficient, API should return a
       * proper error": no partial shipment is left behind.
       */
      throw new ConflictError(
        `Insufficient stock for ${product.name} (${product.sku}). Available: ${product.currentStock}, requested: ${item.quantity}`,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          available: product.currentStock,
          requested: item.quantity,
        }
      );
    }

    const updated = await tx.product.findUniqueOrThrow({
      where: { id: item.productId },
      select: { currentStock: true },
    });

    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        quantity: item.quantity,
        movementType: MovementType.OUT,
        reason: `Challan ${challanNumber} confirmed`,
        stockAfter: updated.currentStock,
        createdById: userId,
        challanId,
      },
    });
  }
};

export const challanService = {
  async list(query: ListChallansQuery) {
    const { page, limit, search, status, customerId, from, to, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ChallanWhereInput = {
      status,
      customerId,
      createdAt: from || to ? { gte: from, lte: to } : undefined,
      OR: search
        ? [
            { challanNumber: { contains: search, mode: "insensitive" } },
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { customer: { businessName: { contains: search, mode: "insensitive" } } },
          ]
        : undefined,
    };

    const [challans, total] = await prisma.$transaction([
      prisma.challan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          challanNumber: true,
          status: true,
          totalQuantity: true,
          totalAmount: true,
          createdAt: true,
          confirmedAt: true,
          customer: {
            select: { id: true, name: true, businessName: true, mobile: true },
          },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.challan.count({ where }),
    ]);

    return { challans, meta: buildMeta(page, limit, total) };
  },

  async getById(id: string) {
    const challan = await prisma.challan.findUnique({
      where: { id },
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { productName: "asc" },
          include: {
            // The live product, for reference only. The PRINTED values
            // come from the snapshot columns on the item itself.
            product: { select: { id: true, sku: true, currentStock: true, isActive: true } },
          },
        },
        stockMovements: {
          select: {
            id: true,
            quantity: true,
            movementType: true,
            reason: true,
            stockAfter: true,
            createdAt: true,
            product: { select: { id: true, name: true, sku: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!challan) throw new NotFoundError("Challan");

    return challan;
  },

  /**
   * ============================================================
   * CREATE — the core operation.
   * ============================================================
   */
  async create(input: CreateChallanInput, userId: string) {
    const items = mergeItems(input.items);

    return prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true, isActive: true, name: true },
        });

        if (!customer) throw new NotFoundError("Customer");
        if (!customer.isActive) {
          throw new ConflictError("Cannot create a challan for an inactive customer");
        }

        /**
         * FETCH ALL PRODUCTS IN ONE QUERY.
         * `where: { id: { in: [...] } }` becomes a single
         * `WHERE id IN (...)`. Looping with findUnique would be N
         * queries — the N+1 problem from Part 5.
         */
        const productIds = items.map((i) => i.productId);
        const products: ProductForSnapshot[] = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true, name: true, sku: true, unitPrice: true,
            currentStock: true, isActive: true,
          },
        });

        // Report EVERY missing id at once, not just the first. A caller
        // fixing one error at a time is a bad experience.
        if (products.length !== productIds.length) {
          const found = new Set(products.map((p) => p.id));
          const missing = productIds.filter((id) => !found.has(id));
          throw new BadRequestError("Some products were not found", { missingProductIds: missing });
        }

        const inactive = products.filter((p) => !p.isActive);
        if (inactive.length > 0) {
          throw new ConflictError("Some products are inactive", {
            inactiveProducts: inactive.map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
          });
        }

        const productMap = new Map<string, ProductForSnapshot>(products.map((p) => [p.id, p]));

        /**
         * BUILD THE SNAPSHOT LINES.
         * productName, productSku and unitPrice are COPIED here, at
         * creation time. Editing the product tomorrow will not alter
         * this document — that is the entire point (see Part 2).
         */
        let totalQuantity = 0;
        let totalAmount = new Prisma.Decimal(0);

        const itemData = items.map((item) => {
          const product = productMap.get(item.productId)!;

          /**
           * MONEY ARITHMETIC WITH Decimal, NOT NUMBER.
           * `450.10 * 3` in plain JavaScript floats gives
           * 1350.3000000000002. Across hundreds of lines those errors
           * accumulate into real rupees your accounts team cannot
           * reconcile. Decimal does exact base-10 arithmetic.
           */
          const unitPrice = new Prisma.Decimal(product.unitPrice);
          const lineTotal = unitPrice.mul(item.quantity);

          totalQuantity += item.quantity;
          totalAmount = totalAmount.add(lineTotal);

          return {
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
            unitPrice,
            quantity: item.quantity,
            lineTotal,
          };
        });

        const challanNumber = await generateChallanNumber(tx);
        const isConfirmed = input.status === ChallanStatus.CONFIRMED;

        const challan = await tx.challan.create({
          data: {
            challanNumber,
            customerId: input.customerId,
            createdById: userId,
            status: input.status,
            totalQuantity,
            totalAmount,
            remarks: input.remarks || undefined,
            confirmedAt: isConfirmed ? new Date() : undefined,
            // Nested create — Prisma inserts the challan and all its
            // items together, still inside this transaction.
            items: { create: itemData },
          },
        });

        // Stock only moves on confirmation. A draft reserves nothing.
        if (isConfirmed) {
          await deductStockForItems(tx, items, challan.id, challanNumber, userId);
        }

        return tx.challan.findUniqueOrThrow({
          where: { id: challan.id },
          include: {
            customer: { select: { id: true, name: true, businessName: true, mobile: true } },
            items: true,
            createdBy: { select: { id: true, name: true } },
          },
        });
      },
      {
        /**
         * Prisma's default interactive-transaction timeout is 5s. A
         * 100-line challan does ~300 queries, which can exceed that on
         * a slow connection. maxWait is how long to wait for a free
         * connection from the pool before giving up.
         */
        maxWait: 5000,
        timeout: 20000,
      }
    );
  },

  /**
   * CONFIRM — draft to confirmed. This is where stock actually leaves.
   */
  async confirm(id: string, userId: string) {
    return prisma.$transaction(
      async (tx) => {
        const challan = await tx.challan.findUnique({
          where: { id },
          include: { items: { select: { productId: true, quantity: true } } },
        });

        if (!challan) throw new NotFoundError("Challan");

        // STATE MACHINE GUARD. Confirming twice would deduct stock twice.
        if (challan.status !== ChallanStatus.DRAFT) {
          throw new ConflictError(
            `Only draft challans can be confirmed. This challan is ${challan.status}.`
          );
        }

        const items = mergeItems(
          challan.items.map((i: ChallanLine) => ({ productId: i.productId, quantity: i.quantity }))
        );

        await deductStockForItems(tx, items, challan.id, challan.challanNumber, userId);

        return tx.challan.update({
          where: { id },
          data: { status: ChallanStatus.CONFIRMED, confirmedAt: new Date() },
          include: {
            customer: { select: { id: true, name: true, businessName: true } },
            items: true,
          },
        });
      },
      { maxWait: 5000, timeout: 20000 }
    );
  },

  /**
   * CANCEL. From DRAFT: nothing to undo.
   * From CONFIRMED: write compensating IN movements to return the stock.
   */
  async cancel(id: string, input: CancelChallanInput, userId: string) {
    return prisma.$transaction(
      async (tx) => {
        const challan = await tx.challan.findUnique({
          where: { id },
          include: { items: { select: { productId: true, quantity: true } } },
        });

        if (!challan) throw new NotFoundError("Challan");

        if (challan.status === ChallanStatus.CANCELLED) {
          throw new ConflictError("Challan is already cancelled");
        }

        if (challan.status === ChallanStatus.CONFIRMED) {
          const items = mergeItems(
            challan.items.map((i: ChallanLine) => ({ productId: i.productId, quantity: i.quantity }))
          );

          for (const item of items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: { increment: item.quantity } },
            });

            const updated = await tx.product.findUniqueOrThrow({
              where: { id: item.productId },
              select: { currentStock: true },
            });

            /**
             * A CONTRA ENTRY, not a deletion.
             * We never remove the original OUT movement. The ledger is
             * append-only, so the history reads:
             *   OUT 10 (challan confirmed)
             *   IN  10 (challan cancelled)
             * Both events are preserved and the running balance is
             * still correct. Deleting the OUT would erase the fact that
             * the goods ever left.
             */
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                quantity: item.quantity,
                movementType: MovementType.IN,
                reason: `Challan ${challan.challanNumber} cancelled: ${input.reason}`,
                stockAfter: updated.currentStock,
                createdById: userId,
                challanId: challan.id,
              },
            });
          }
        }

        return tx.challan.update({
          where: { id },
          data: {
            status: ChallanStatus.CANCELLED,
            remarks: challan.remarks
              ? `${challan.remarks}\n[Cancelled] ${input.reason}`
              : `[Cancelled] ${input.reason}`,
          },
          include: { items: true },
        });
      },
      { maxWait: 5000, timeout: 20000 }
    );
  },

  /**
   * UPDATE — drafts only. A confirmed challan is immutable: its stock
   * movements are already written, so changing quantities would leave
   * the ledger describing a document that no longer exists.
   */
  async update(id: string, input: UpdateChallanInput) {
    return prisma.$transaction(async (tx) => {
      const challan = await tx.challan.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!challan) throw new NotFoundError("Challan");

      if (challan.status !== ChallanStatus.DRAFT) {
        throw new ConflictError(
          `Only draft challans can be edited. This challan is ${challan.status}.`
        );
      }

      if (input.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true, isActive: true },
        });
        if (!customer) throw new NotFoundError("Customer");
        if (!customer.isActive) throw new ConflictError("Customer is inactive");
      }

      let totals: { totalQuantity: number; totalAmount: Prisma.Decimal } | undefined;

      if (input.items) {
        const items = mergeItems(input.items);
        const productIds = items.map((i) => i.productId);

        const products: ProductForSnapshot[] = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true, unitPrice: true, isActive: true },
        });

        if (products.length !== productIds.length) {
          const found = new Set(products.map((p) => p.id));
          throw new BadRequestError("Some products were not found", {
            missingProductIds: productIds.filter((pid) => !found.has(pid)),
          });
        }

        const productMap = new Map<string, ProductForSnapshot>(products.map((p) => [p.id, p]));

        let totalQuantity = 0;
        let totalAmount = new Prisma.Decimal(0);

        const itemData = items.map((item) => {
          const product = productMap.get(item.productId)!;
          const unitPrice = new Prisma.Decimal(product.unitPrice);
          const lineTotal = unitPrice.mul(item.quantity);

          totalQuantity += item.quantity;
          totalAmount = totalAmount.add(lineTotal);

          return {
            challanId: id,
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
            unitPrice,
            quantity: item.quantity,
            lineTotal,
          };
        });

        // Replace the line set wholesale — simpler and less error-prone
        // than diffing, and safe because drafts have no stock impact.
        await tx.challanItem.deleteMany({ where: { challanId: id } });
        await tx.challanItem.createMany({ data: itemData });

        totals = { totalQuantity, totalAmount };
      }

      return tx.challan.update({
        where: { id },
        data: {
          customerId: input.customerId,
          remarks: input.remarks,
          ...(totals ?? {}),
        },
        include: {
          customer: { select: { id: true, name: true, businessName: true } },
          items: true,
        },
      });
    });
  },

  async getStats() {
    const [byStatus, totals] = await prisma.$transaction([
      prisma.challan.groupBy({ by: ["status"], _count: true }),
      prisma.challan.aggregate({
        where: { status: ChallanStatus.CONFIRMED },
        _sum: { totalAmount: true, totalQuantity: true },
      }),
    ]);

    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      confirmedValue: totals._sum.totalAmount?.toString() ?? "0",
      confirmedUnits: totals._sum.totalQuantity ?? 0,
    };
  },
};
