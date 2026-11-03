import { fetchGemini } from "@/lib/gemini-call";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { HttpError } from "@/lib/route";

import type { ExtractedReceipt, ReceiptExtractor, ReceiptImage } from "./extractor";

/**
 * Reads a photographed bill with Gemini's vision input and returns draft line
 * items. It is asked for structure only: what was on the bill and what it
 * cost. Who shared what is never asked for or inferred.
 *
 * The response is requested as JSON against a schema, but the route still
 * validates it with Zod, because a model's output is untrusted input.
 */

const PROMPT = `Read this restaurant, grocery or shop bill and list what was bought.

Rules:
- One entry per priced line, with the amount for the whole line (quantity already multiplied in), in rupees.
- Tax, GST, service charge, delivery fee and tip are separate lines. Label them plainly (e.g. "GST 18%", "Service charge").
- Discounts are a line with a negative amount only if the bill shows one; otherwise omit them.
- "total" is the final amount payable as printed on the bill, if you can see it.
- "merchant" is the shop or restaurant name, if visible.
- Do not invent lines. If the image is not a bill or is unreadable, return an empty list.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    merchant: { type: "STRING" },
    lineItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          amount: { type: "NUMBER" },
        },
        required: ["label", "amount"],
      },
    },
    total: { type: "NUMBER" },
  },
  required: ["lineItems"],
};

export class GeminiReceiptExtractor implements ReceiptExtractor {
  readonly name = "gemini";

  async extract(image: ReceiptImage): Promise<ExtractedReceipt> {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new HttpError(503, "Receipt scanning needs GEMINI_API_KEY.");

    const response = await fetchGemini(key, {
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }).catch((error: unknown) => {
      logger.error("Gemini receipt unreachable", error instanceof Error ? error : new Error(String(error)));
      throw new HttpError(502, "Couldn't reach the receipt reader. Add the items by hand, or try again.");
    });

    if (!response.ok) {
      logger.error("Gemini receipt request failed", new Error(`${response.status} ${(await response.text()).slice(0, 300)}`));
      if (response.status === 429) throw new HttpError(429, "Receipt scanning is busy right now. Try again in a moment.");
      throw new HttpError(502, "Couldn't reach the receipt reader. Add the items by hand, or try again.");
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HttpError(422, "Couldn't read that receipt. Try a clearer, flatter photo.");
    }

    const raw = parsed as { merchant?: unknown; lineItems?: unknown; total?: unknown };
    const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems : [];

    return {
      merchant: typeof raw.merchant === "string" && raw.merchant.trim() ? raw.merchant.trim().slice(0, 120) : undefined,
      // The schema only allows non-negative amounts, so a discount line is dropped
      // rather than failing the whole scan.
      lineItems: lineItems
        .filter(
          (item): item is { label: string; amount: number } =>
            typeof item?.label === "string" &&
            item.label.trim().length > 0 &&
            typeof item?.amount === "number" &&
            Number.isFinite(item.amount) &&
            item.amount > 0,
        )
        .slice(0, 60)
        .map((item) => ({ label: item.label.trim().slice(0, 80), amount: Math.round(item.amount * 100) / 100 })),
      total: typeof raw.total === "number" && raw.total >= 0 ? raw.total : undefined,
    };
  }
}
