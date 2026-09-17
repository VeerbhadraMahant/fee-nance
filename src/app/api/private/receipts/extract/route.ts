/**
 * Turns a photograph of a bill into a *draft* set of line items.
 *
 * Two rules this route does not bend:
 *
 *   1. The image is never persisted. It exists for the life of the request and
 *      is not written to any collection, disk or external store.
 *   2. Nothing here writes to the ledger. The response is a suggestion the
 *      user edits and confirms; the confirmed payload is then posted to
 *      `/api/private/groups/[groupId]/expenses` and validated there like any
 *      hand-typed expense. A model's output is never trusted into the balance
 *      sheet on its own.
 *
 * The extractor itself lives behind `src/lib/receipt/registry.ts`. With none
 * configured this returns 501 and the UI falls back to manual entry.
 */

import { z } from "zod";

import { requireUserId } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import {
  ExtractorNotConfiguredError,
  extractedReceiptSchema,
} from "@/lib/receipt/extractor";
import { getReceiptExtractor, isExtractorConfigured } from "@/lib/receipt/registry";

/** Base64 inflates by about a third, so this caps the decoded image near 5 MB. */
const MAX_BASE64_LENGTH = 7_000_000;

const extractRequestSchema = z.object({
  base64: z.string().min(1).max(MAX_BASE64_LENGTH),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/** Lets the dialog decide whether to offer a "Scan a bill" button at all. */
export async function GET() {
  try {
    await requireUserId();
    return Response.json({ configured: isExtractorConfigured() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Receipt extractor status error", error);
    return jsonError("Failed to read extractor status", 500);
  }
}

export async function POST(request: Request) {
  try {
    await requireUserId();

    const payload = extractRequestSchema.parse(await request.json());
    const extractor = getReceiptExtractor();
    const raw = await extractor.extract(payload);

    // The model's output is untrusted input like any other. Validate it with
    // the same rigour as a request body before it reaches the client.
    const receipt = extractedReceiptSchema.parse(raw);

    return Response.json({
      source: extractor.name,
      extractedAt: new Date().toISOString(),
      receipt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof ExtractorNotConfiguredError) {
      return jsonError(
        "Receipt scanning isn't set up yet — add the line items by hand for now.",
        501,
      );
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid receipt image", 422);
    }

    logger.error("Receipt extraction error", error);
    return jsonError("Couldn't read that receipt", 500);
  }
}
