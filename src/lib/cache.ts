import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Redis read-through cache for the expensive, read-heavy routes (dashboard,
 * analytics, insights, report…), shared across every server instance.
 *
 * Invalidation is by per-user version number rather than by deleting keys:
 *
 *   read   GET fn:v:<user>           → v
 *          GET fn:c:<user>:<v>:<key> → hit, or compute and SET with a TTL
 *   write  INCR fn:v:<user>          → every older entry is unreachable
 *
 * A computation that started before a write lands under the old version, so
 * a slow read can never repopulate the cache with pre-write data. Old
 * entries simply expire. A group change bumps every member's version, since
 * one person's expense changes everyone's balances.
 *
 * Optional and fail-open: with no Upstash credentials, or if Redis errors,
 * the route computes from Postgres as if there were no cache.
 */

const DEFAULT_TTL_SECONDS = 300;

let client: Redis | null | undefined;

function redis() {
  if (client === undefined) {
    client =
      env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
        ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
        : null;
  }
  return client;
}

export function isCacheEnabled() {
  return redis() !== null;
}

const versionKey = (userId: string) => `fn:v:${userId}`;

function digest(parts: unknown) {
  return createHash("sha1").update(JSON.stringify(parts)).digest("base64url").slice(0, 16);
}

/**
 * Returns the cached value for (user, name, params), computing and storing
 * it on a miss. `params` must include everything the result depends on
 * (date range, month, …) — it becomes part of the key.
 */
export async function cached<T>(
  userId: string,
  name: string,
  params: unknown,
  compute: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<T> {
  const r = redis();
  if (!r) return compute();

  let key: string | null = null;
  try {
    const version = (await r.get<number>(versionKey(userId))) ?? 0;
    key = `fn:c:${userId}:${version}:${name}:${digest(params)}`;
    const hit = await r.get<T>(key);
    if (hit !== null) return hit;
  } catch (error) {
    logger.warn("Cache read failed; computing directly", { name, error: String(error) });
    return compute();
  }

  const value = await compute();
  try {
    // JSON round-trip so a hit and a miss return the same shape (Dates as strings).
    await r.set(key, JSON.parse(JSON.stringify(value)), { ex: ttlSeconds });
  } catch (error) {
    logger.warn("Cache write failed", { name, error: String(error) });
  }
  return value;
}

/** Makes every cached entry for these users stale. Call after any write. */
export async function invalidateUsers(userIds: Iterable<string>) {
  const r = redis();
  if (!r) return;
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  try {
    const pipeline = r.pipeline();
    for (const id of ids) pipeline.incr(versionKey(id));
    await pipeline.exec();
  } catch (error) {
    // Entries still expire on their TTL; worst case is a few minutes stale.
    logger.warn("Cache invalidation failed", { error: String(error) });
  }
}
