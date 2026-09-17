/**
 * The contract a receipt OCR model has to satisfy. Nothing here knows or cares
 * which model that is.
 *
 * The boundary exists so the app can be finished and demonstrated before any
 * extractor exists, and so swapping one for another is a single file plus a
 * line in the registry — no route, schema or component changes.
 *
 * What an extractor may do: read an image and propose line items.
 * What it may never do: decide who owes what. Assignment stays with the user.
 */

import { z } from "zod";

export const extractedReceiptSchema = z.object({
  merchant: z.string().trim().max(120).optional(),
  lineItems: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        amount: z.number().nonnegative(),
      }),
    )
    .max(60),
  /** The printed total, if the model found one. Used only to warn the user
   *  when the items don't add up to it — never to overrule them. */
  total: z.number().nonnegative().optional(),
});

export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;

export interface ReceiptImage {
  base64: string;
  mimeType: string;
}

export interface ReceiptExtractor {
  /** Reported back to the client and stored as `extraction.source`. */
  readonly name: string;
  extract(image: ReceiptImage): Promise<ExtractedReceipt>;
}

/** Thrown when no extractor is configured. The route turns this into a 501. */
export class ExtractorNotConfiguredError extends Error {
  constructor() {
    super("No receipt extractor is configured");
    this.name = "ExtractorNotConfiguredError";
  }
}
