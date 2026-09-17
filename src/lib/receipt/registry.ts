/**
 * Resolves the configured receipt extractor.
 *
 * To plug a model in:
 *   1. add a file next to this one implementing `ReceiptExtractor`;
 *   2. add one entry to `EXTRACTORS` below;
 *   3. set `RECEIPT_EXTRACTOR` in `.env` to that key.
 *
 * Nothing else in the codebase changes. Until then the app runs with no
 * extractor and itemized splitting works by manual entry, which is the
 * primary path regardless — scanning only ever pre-fills the form.
 */

import { env } from "@/lib/env";
import { ExtractorNotConfiguredError, type ReceiptExtractor } from "./extractor";

/** Every registered implementation, keyed by the `RECEIPT_EXTRACTOR` value
 *  that selects it. Lazily constructed so an unused extractor's dependencies
 *  are never loaded. */
const EXTRACTORS: Record<string, () => ReceiptExtractor> = {
  // "my-ocr": () => new MyOcrExtractor(),
};

export function isExtractorConfigured() {
  const configured = env.RECEIPT_EXTRACTOR;
  return Boolean(configured && configured !== "none" && EXTRACTORS[configured]);
}

export function getReceiptExtractor(): ReceiptExtractor {
  const configured = env.RECEIPT_EXTRACTOR;

  if (!configured || configured === "none") {
    throw new ExtractorNotConfiguredError();
  }

  const factory = EXTRACTORS[configured];

  if (!factory) {
    throw new ExtractorNotConfiguredError();
  }

  return factory();
}
