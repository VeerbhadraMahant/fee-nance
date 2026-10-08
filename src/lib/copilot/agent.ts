/**
 * The copilot's reasoning loop: send the conversation to Gemini with the
 * read-only tool set, run whatever tools it asks for, feed the results back,
 * and repeat until it answers in prose. Plain REST — no SDK dependency.
 */

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { HttpError } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import { runTool, TOOL_DECLARATIONS } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Part = {
  text?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: unknown };
  thoughtSignature?: string;
};
type Content = { role: "user" | "model"; parts: Part[] };

const MAX_STEPS = 6;

const TOOL_LABELS: Record<string, string> = {
  get_financial_snapshot: "Reviewing your financial snapshot",
  get_spending_by_category: "Breaking down spending by category",
  get_monthly_trend: "Checking monthly trends",
  search_transactions: "Searching your transactions",
  get_budgets: "Checking your budgets",
  get_goals: "Reviewing your goals",
  get_recurring_rules: "Looking at recurring payments",
  get_unusual_activity: "Scanning for unusual activity",
};

function systemPrompt() {
  return `You are Fee-Nance Copilot, a personal finance assistant inside the user's money-tracking app. Today is ${new Date().toISOString().slice(0, 10)}. All amounts are Indian rupees (INR); write them like ₹12,500.

How to work:
- Ground every answer in the user's real data. Call the tools to look things up; never invent figures. If a tool returns nothing, say the data isn't there yet.
- For broad questions ("how am I doing?"), start with get_financial_snapshot, then dig into whatever stands out.
- Be specific and actionable: name the categories, merchants, amounts and dates behind each point, and give concrete next steps with rupee impact where you can.
- Keep answers tight: short paragraphs or bullets, markdown allowed, no filler. Lead with the answer.
- You are read-only. You cannot create, edit or delete anything; if asked, explain which page of the app to use.
- You give general financial guidance, not regulated investment, legal or tax advice; mention that briefly only when it matters.
- Stay on personal finance and this app. Politely decline anything else.`;
}

async function callGemini(contents: Content[]) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, "The copilot isn't configured yet (missing GEMINI_API_KEY).");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    logger.error("Gemini request failed", new Error(`${response.status} ${(await response.text()).slice(0, 300)}`));
    if (response.status === 429) throw new HttpError(429, "The copilot is busy right now. Try again in a moment.");
    throw new HttpError(502, "The copilot couldn't reach its model. Try again shortly.");
  }
  return (await response.json()) as { candidates?: Array<{ content?: Content; finishReason?: string }> };
}

export async function runCopilot(supabase: SupabaseServerClient, messages: ChatMessage[]) {
  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const steps: string[] = [];

  for (let i = 0; i < MAX_STEPS; i += 1) {
    const data = await callGemini(contents);
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) {
      const reply = parts.map((p) => p.text ?? "").join("").trim();
      return { reply: reply || "I couldn't put an answer together for that. Try rephrasing it.", steps };
    }

    // Keep the model turn verbatim (thought signatures included) so the
    // next request is accepted.
    contents.push({ role: "model", parts });

    const responses = await Promise.all(
      calls.map(async (part) => {
        const { id, name, args } = part.functionCall!;
        steps.push(TOOL_LABELS[name] ?? name);
        try {
          return { functionResponse: { id, name, response: { result: await runTool(supabase, name, args ?? {}) } } };
        } catch (error) {
          logger.error(`Copilot tool ${name} failed`, error);
          return { functionResponse: { id, name, response: { error: "That lookup failed." } } };
        }
      }),
    );
    contents.push({ role: "user", parts: responses });
  }

  return { reply: "That took more digging than I could finish. Try asking something narrower.", steps };
}
