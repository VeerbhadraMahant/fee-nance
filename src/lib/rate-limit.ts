import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { HttpError } from "@/lib/route";

/**
 * Fixed-window rate limiting per user, for routes that spend money on every
 * call (the copilot and receipt scanning both call Gemini on the project's
 * key).
 *
 * With Upstash configured the count is shared across every server instance.
 * Without it, each instance keeps its own count in memory: weaker, since a
 * cold start resets it, but it still stops one tab from looping. Redis
 * errors fall back to the in-memory count rather than failing open.
 */

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

const memory = new Map<string, { count: number; resetAt: number }>();

function countInMemory(key: string, windowSeconds: number) {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Counts one call for (bucket, user) and throws a 429 once `limit` calls
 * have been made in the current window.
 */
export async function enforceRateLimit(
  bucket: string,
  userId: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `fn:rl:${bucket}:${userId}:${window}`;

  let count: number;
  const r = redis();
  if (r) {
    try {
      count = await r.incr(key);
      if (count === 1) await r.expire(key, windowSeconds);
    } catch (error) {
      logger.warn("Rate limit store failed; counting in memory", { bucket, error: String(error) });
      count = countInMemory(key, windowSeconds);
    }
  } else {
    count = countInMemory(key, windowSeconds);
  }

  if (count > limit) {
    const minutes = Math.ceil(windowSeconds / 60);
    throw new HttpError(
      429,
      `You've reached the limit of ${limit} requests per ${minutes} minutes. Try again shortly.`,
    );
  }
}
