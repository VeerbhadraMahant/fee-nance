/**
 * Resolves the configured receipt extractor.
 *
 * To plug another model in:
 *   1. add a file next to this one implementing `ReceiptExtractor`;
 *   2. add one entry to `EXTRACTORS` below;
 *   3. set `RECEIPT_EXTRACTOR` in `.env` to that key.
 *
 * With `RECEIPT_EXTRACTOR` unset, Gemini is used when `GEMINI_API_KEY` is
 * present (the copilot already needs it); set it to `none` to turn scanning
 * off. With neither, itemized splitting works by manual entry, which is the
 * primary path regardless — scanning only ever pre-fills the form.
 */

import { env } from "@/lib/env";
import { ExtractorNotConfiguredError, type ReceiptExtractor } from "./extractor";
import { GeminiReceiptExtractor } from "./gemini";

/** Every registered implementation, keyed by the `RECEIPT_EXTRACTOR` value
 *  that selects it. Lazily constructed so an unused extractor's dependencies
 *  are never loaded. */
const EXTRACTORS: Record<string, () => ReceiptExtractor> = {
  gemini: () => new GeminiReceiptExtractor(),
};

function selectedExtractor() {
  return env.RECEIPT_EXTRACTOR ?? (env.GEMINI_API_KEY ? "gemini" : undefined);
}

export function isExtractorConfigured() {
  const configured = selectedExtractor();
  if (!configured || configured === "none" || !EXTRACTORS[configured]) return false;
  return configured !== "gemini" || Boolean(env.GEMINI_API_KEY);
}

export function getReceiptExtractor(): ReceiptExtractor {
  const configured = selectedExtractor();

  if (!configured || configured === "none") {
    throw new ExtractorNotConfiguredError();
  }

  const factory = EXTRACTORS[configured];

  if (!factory) {
    throw new ExtractorNotConfiguredError();
  }

  return factory();
}
