/**
 * Financial Health Copilot: a Gemini agent that answers questions about the
 * signed-in user's own money using read-only tools (see lib/copilot/tools).
 */

import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { runCopilot } from "@/lib/copilot/agent";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/route";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(30),
});

export async function GET() {
  try {
    await requireUser();
    return Response.json({ available: Boolean(env.GEMINI_API_KEY) });
  } catch (error) {
    return handleRouteError(error, "Failed to check the copilot");
  }
}

/** Each question can cost up to six model calls on the project's key. */
const COPILOT_LIMIT = { limit: 30, windowSeconds: 60 * 60 };

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const { messages } = bodySchema.parse(await request.json());
    if (messages.at(-1)?.role !== "user") {
      return Response.json({ error: "The last message must be from the user" }, { status: 422 });
    }
    await enforceRateLimit("copilot", userId, COPILOT_LIMIT);
    return Response.json(await runCopilot(supabase, messages));
  } catch (error) {
    return handleRouteError(error, "The copilot ran into a problem");
  }
}
