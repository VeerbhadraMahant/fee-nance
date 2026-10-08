import { z } from "zod";

/**
 * Environment, validated once and read lazily so a missing value fails at the
 * point of use with a clear message — not at import time, which would break
 * `next build` in pipelines that only inject secrets at runtime.
 *
 * Supabase: the URL and anon (publishable) key are public by design — RLS is
 * what protects the data — so they carry the NEXT_PUBLIC_ prefix and are
 * inlined into the browser bundle. The service-role key bypasses RLS and is
 * read only by the seed script; the app itself never uses it.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Upstash Redis (REST). Both unset → caching is off and every read hits Postgres.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Selects a receipt OCR implementation from src/lib/receipt/registry.ts.
  RECEIPT_EXTRACTOR: z.string().min(1).optional(),
  // Gemini key for the Financial Health Copilot. Unset: the copilot reports itself unavailable.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
});

// NEXT_PUBLIC_ values must be referenced literally for Next to inline them
// into client bundles, so they are listed explicitly rather than via spread.
const parsed = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
  RECEIPT_EXTRACTOR: process.env.RECEIPT_EXTRACTOR || undefined,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
  GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
});

function required(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  get SUPABASE_URL() {
    return required(parsed.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  },
  get SUPABASE_ANON_KEY() {
    return required(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required(parsed.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  },
  UPSTASH_REDIS_REST_URL: parsed.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: parsed.UPSTASH_REDIS_REST_TOKEN,
  RECEIPT_EXTRACTOR: parsed.RECEIPT_EXTRACTOR,
  GEMINI_API_KEY: parsed.GEMINI_API_KEY,
  GEMINI_MODEL: parsed.GEMINI_MODEL ?? "gemini-3.8-flash",
};
