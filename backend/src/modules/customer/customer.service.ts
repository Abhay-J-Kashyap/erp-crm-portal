import { Prisma, CustomerStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError, ConflictError } from "../../utils/AppError";
import { buildMeta } from "../../utils/apiResponse";
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
  CreateFollowUpInput,
} from "./customer.schema";

/**
 * Turns "" into undefined so empty form fields become NULL in the database
 * rather than empty strings. Mixing "" and NULL for "no value" means every
 * later query needs `WHERE (email IS NULL OR email = '')`. Normalise once,
 * at the boundary.
 */
const emptyToUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned) as (keyof T)[]) {
    if (cleaned[key] === "") {
      cleaned[key] = undefined as T[keyof T];
    }
  }
  return cleaned;
};

export const customerService = {
  /**
   * LIST — pagination, search, filters, sorting.
   */
  async list(query: ListCustomersQuery) {
    const { page, limit, search, status, customerType, city, followUpBefore, includeInactive, sortBy, sortOrder } = query;

    const skip = (page - 1) * limit;

    /**
     * BUILDING A DYNAMIC WHERE CLAUSE
     * -------------------------------
     * Prisma IGNORES keys whose value is `undefined`. That's the whole
     * trick: assign undefined when a filter wasn't supplied and the
     * condition disappears from the generated SQL.
     *
     * Note `undefined` and `null` are NOT the same to Prisma —
     * `undefined` means "no filter", `null` means "WHERE col IS NULL".
     * Confusing these is a classic source of wrong results.
     */
    const where: Prisma.CustomerWhereInput = {
      isActive: includeInactive ? undefined : true,
      status,
      customerType,

      city: city ? { equals: city, mode: "insensitive" } : undefined,

      followUpDate: followUpBefore ? { lte: followUpBefore } : undefined,

      /**
       * SEARCH ACROSS MULTIPLE COLUMNS.
       * OR means "match any of these". `contains` compiles to SQL LIKE
       * '%term%', and mode: "insensitive" makes it ILIKE on Postgres so
       * "sharma" matches "Sharma".
       *
       * PERFORMANCE NOTE: a leading-wildcard LIKE cannot use a normal
       * B-tree index, so this is a full table scan. Fine for thousands
       * of rows; at millions you would reach for Postgres full-text
       * search or a trigram index. Worth stating in your README.
       */
      OR: search
        ? [
            { name: { contains: search, mode: "insensitive" } },
            { mobile: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
            { businessName: { contains: search, mode: "insensitive" } },
            { gstNumber: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    };

    /**
     * TWO QUERIES IN ONE ROUND TRIP.
     * We need the page of rows AND the total count for pagination meta.
     * $transaction with an array sends both together, so they see the
     * same snapshot — otherwise a row inserted between them gives you a
     * count that doesn't match the data.
     */
    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        // `select` instead of returning everything: don't ship `notes`
        // (up to 2000 chars) in a list view nobody reads it in.
        select: {
          id: true,
          name: true,
          mobile: true,
          email: true,
          businessName: true,
          customerType: true,
          city: true,
          status: true,
          followUpDate: true,
          isActive: true,
          createdAt: true,
          // Aggregate in the same query — avoids the N+1 problem.
          _count: { select: { challans: true, followUps: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      customers,
      meta: buildMeta(page, limit, total),
    };
  },

  /**
   * DETAIL — the full record plus related data for the detail page.
   */
  async getById(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },

        // Newest first, capped. Without `take`, a customer with 5,000
        // follow-ups would return all of them in one response.
        followUps: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { createdBy: { select: { id: true, name: true } } },
        },

        challans: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            challanNumber: true,
            status: true,
            totalQuantity: true,
            totalAmount: true,
            createdAt: true,
          },
        },

        _count: { select: { challans: true, followUps: true } },
      },
    });

    if (!customer) {
      throw new NotFoundError("Customer");
    }

    return customer;
  },

  /**
   * CREATE
   */
  async create(input: CreateCustomerInput, userId: string) {
    const data = emptyToUndefined(input);

    /**
     * A SOFT duplicate check. Mobile is not UNIQUE in the schema on
     * purpose — a family business legitimately shares one number across
     * two accounts. So we warn rather than forbid at the DB level, and
     * decide the policy here where it can be changed without a migration.
     */
    const existing = await prisma.customer.findFirst({
      where: { mobile: data.mobile, isActive: true },
      select: { id: true, name: true },
    });

    if (existing) {
      throw new ConflictError(
        `A customer with mobile ${data.mobile} already exists (${existing.name})`,
        { existingCustomerId: existing.id }
      );
    }

    return prisma.customer.create({
      data: {
        ...data,
        // The creator comes from the VERIFIED token, never from the body.
        // Accepting createdById from input would let anyone forge authorship.
        createdById: userId,
      },
    });
  },

  /**
   * UPDATE — partial.
   */
  async update(id: string, input: UpdateCustomerInput) {
    const existing = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundError("Customer");
    }

    const data = emptyToUndefined(input);

    if (data.mobile) {
      const duplicate = await prisma.customer.findFirst({
        where: { mobile: data.mobile, isActive: true, NOT: { id } },
        select: { id: true, name: true },
      });

      if (duplicate) {
        throw new ConflictError(
          `Another customer already uses mobile ${data.mobile} (${duplicate.name})`
        );
      }
    }

    return prisma.customer.update({ where: { id }, data });
  },

  /**
   * SOFT DELETE. A hard delete would fail on the foreign key from
   * challans, and even if it succeeded it would destroy financial history.
   */
  async deactivate(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!customer) {
      throw new NotFoundError("Customer");
    }

    if (!customer.isActive) {
      throw new ConflictError("Customer is already inactive");
    }

    return prisma.customer.update({
      where: { id },
      data: { isActive: false, status: CustomerStatus.INACTIVE },
    });
  },

  async reactivate(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError("Customer");
    }

    return prisma.customer.update({
      where: { id },
      data: { isActive: true, status: CustomerStatus.ACTIVE },
    });
  },

  /**
   * ADD FOLLOW-UP — writes the note and optionally reschedules/promotes
   * the customer, all atomically.
   */
  async addFollowUp(customerId: string, input: CreateFollowUpInput, userId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError("Customer");
    }

    /**
     * Interactive transaction: the note and the customer update must
     * both land or neither. Otherwise you get a logged call with no
     * scheduled follow-up, and the lead quietly goes cold.
     */
    return prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.create({
        data: { customerId, note: input.note, createdById: userId },
        include: { createdBy: { select: { id: true, name: true } } },
      });

      const shouldUpdate =
        input.nextFollowUpDate !== undefined || input.status !== undefined;

      if (shouldUpdate) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            followUpDate: input.nextFollowUpDate,
            status: input.status,
          },
        });
      }

      return followUp;
    });
  },

  async listFollowUps(customerId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [followUps, total] = await prisma.$transaction([
      prisma.followUp.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { createdBy: { select: { id: true, name: true } } },
      }),
      prisma.followUp.count({ where: { customerId } }),
    ]);

    return { followUps, meta: buildMeta(page, limit, total) };
  },

  /**
   * DASHBOARD STATS. Not in the PDF — added because a CRM landing page
   * with no numbers looks unfinished, and it demonstrates groupBy.
   */
  async getStats() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const [byStatus, byType, dueFollowUps, total] = await prisma.$transaction([
      prisma.customer.groupBy({
        by: ["status"],
        where: { isActive: true },
        _count: true,
        orderBy: { status: "asc" },
      }),
      prisma.customer.groupBy({
        by: ["customerType"],
        where: { isActive: true },
        _count: true,
        orderBy: { customerType: "asc" },
      }),
      prisma.customer.count({
        where: { isActive: true, followUpDate: { lte: today } },
      }),
      prisma.customer.count({ where: { isActive: true } }),
    ]);

    return {
      total,
      dueFollowUps,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      byType: Object.fromEntries(byType.map((r) => [r.customerType, r._count])),
    };
  },
};
