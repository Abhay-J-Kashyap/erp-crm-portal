import { Response } from "express";

/**
 * A CONSISTENT RESPONSE SHAPE
 * ---------------------------
 * Every endpoint returns the same envelope. The frontend can then write
 * ONE response handler instead of guessing per endpoint whether the data
 * is at `res.data`, `res.result`, or the top level.
 *
 * Success: { success: true,  message, data, meta? }
 * Failure: { success: false, message, errors? }
 *
 * The `success` boolean is redundant with the status code, and worth it:
 * some HTTP clients swallow status codes, and it makes frontend code
 * read clearly.
 */

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = "Success",
  statusCode = 200,
  meta?: PaginationMeta
): Response => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}), // only include meta when there is some
  });
};

export const sendCreated = <T>(
  res: Response,
  data: T,
  message = "Created successfully"
): Response => sendSuccess(res, data, message, 201);

/**
 * Turns page/limit into Prisma's skip/take, with guard rails.
 *
 * Why clamp `limit` at 100: without a ceiling, ?limit=999999 is a free
 * denial-of-service — one request pulls your entire table into memory.
 * Always cap user-controlled limits.
 */
export const getPagination = (page?: unknown, limit?: unknown) => {
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 10));

  return {
    page: parsedPage,
    limit: parsedLimit,
    skip: (parsedPage - 1) * parsedLimit,
    take: parsedLimit,
  };
};

export const buildMeta = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};
