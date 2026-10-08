import { z } from "zod";

import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";

/** A Postgres / PostgREST error as supabase-js reports it. */
interface DbError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/** Thrown by `must()` so a failed query reaches the route's error handler. */
export class DbQueryError extends Error {
  constructor(readonly db: DbError) {
    super(db.message);
    this.name = "DbQueryError";
  }
}

/** An expected failure with a status and a message safe to show the user. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Unwraps a supabase-js result, throwing on error. */
export function must<T>(result: { data: T; error: DbError | null }): T {
  if (result.error) throw new DbQueryError(result.error);
  return result.data;
}

/** Messages raised by our own SQL functions that are safe to show users. */
const USER_FACING_DB_MESSAGES: Record<string, { status: number; message: string }> = {
  group_not_found: { status: 404, message: "Group not found" },
  invalid_invite_code: { status: 404, message: "Invalid invite code" },
  unauthorized: { status: 401, message: "Unauthorized" },
};

/**
 * One error mapping for every route:
 *   UNAUTHORIZED            → 401
 *   HttpError               → its own status and message
 *   Zod validation          → 422, first issue's message
 *   unique violation        → 409 (`conflictMessage`)
 *   malformed uuid          → 404 (`notFoundMessage`) — an id that can't
 *                             exist is indistinguishable from one that doesn't
 *   our SQL `raise exception` → its mapped status/message, or 422 verbatim
 *   anything else           → logged, 500 with `fallback`
 */
export function handleRouteError(
  error: unknown,
  fallback: string,
  { notFoundMessage = "Not found", conflictMessage = "Already exists" } = {},
) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return jsonError("Unauthorized", 401);
  }

  if (error instanceof HttpError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof z.ZodError) {
    return jsonError(error.issues[0]?.message ?? "Invalid input", 422);
  }

  if (error instanceof DbQueryError) {
    const { code, message } = error.db;
    if (code === "23505") return jsonError(conflictMessage, 409);
    if (code === "22P02") return jsonError(notFoundMessage, 404);
    // P0001 = RAISE EXCEPTION from one of our functions.
    if (code === "P0001") {
      const mapped = USER_FACING_DB_MESSAGES[message];
      return mapped ? jsonError(mapped.message, mapped.status) : jsonError(message, 422);
    }
    // 23514 check violation, 23503 FK violation: the input was bad.
    if (code === "23514" || code === "23503") return jsonError("Invalid input", 422);
  }

  logger.error(fallback, error);
  return jsonError(fallback, 500);
}

/** Query params that are absent or blank become undefined, for Zod. */
export function optionalParam(value: string | null) {
  return value === null || value.trim() === "" ? undefined : value;
}

export const uuidSchema = z.string().uuid();

/** Validates a path id; a malformed one is a 404, same as a missing one. */
export function isUuid(value: string) {
  return uuidSchema.safeParse(value).success;
}

/**
 * PostgREST caps a response at `max_rows` (1000 on Supabase by default), and
 * a capped response looks exactly like a complete one. Anything that needs
 * every matching row pages through with `range()` until a short page.
 * `build` must apply a deterministic order, or rows can repeat or go missing
 * between pages.
 */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = must(await build(from, from + pageSize - 1)) ?? [];
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}
