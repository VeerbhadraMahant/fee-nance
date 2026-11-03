import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * One place that talks to Gemini's generateContent endpoint, so the copilot and
 * the receipt reader behave the same when Google is busy.
 *
 * Gemini answers 503 ("high demand") and 429 during spikes, often for a few
 * seconds only. So a busy answer is retried once on the configured model, then
 * tried on steadier fallback models, before the caller gives up. Anything else
 * (a bad key, a malformed request) is returned straight away.
 */

/** Used, in order, after the configured model keeps failing. */
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const PER_ATTEMPT_MS = 20_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchGemini(key: string, body: unknown): Promise<Response> {
  const models = [env.GEMINI_MODEL, ...FALLBACK_MODELS.filter((m) => m !== env.GEMINI_MODEL)];
  const payload = JSON.stringify(body);
  let last: Response | null = null;
  let lastError: unknown = null;

  for (let m = 0; m < models.length; m += 1) {
    // Two tries on the model the owner chose, one on each fallback.
    const attempts = m === 0 ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[m]!)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: payload,
            signal: AbortSignal.timeout(PER_ATTEMPT_MS),
          },
        );
        if (response.ok || !RETRYABLE.has(response.status)) return response;
        last = response;
        logger.warn("Gemini busy, retrying", { model: models[m], status: response.status });
      } catch (error) {
        lastError = error;
        logger.warn("Gemini request errored, retrying", { model: models[m], error: String(error) });
      }
      if (attempt < attempts - 1) await sleep(800);
    }
  }

  if (last) return last;
  throw lastError ?? new Error("Gemini unreachable");
}
