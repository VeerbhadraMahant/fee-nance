"use client";

import * as React from "react";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
}

const SUGGESTIONS = [
  "How healthy are my finances right now?",
  "Where is most of my money going?",
  "Which subscriptions could I cut?",
  "Am I on track for my goals?",
  "Anything unusual in my recent spending?",
];

/** Minimal markdown: **bold**, `-`/`*` bullets, paragraphs. Output is React
 *  nodes, never raw HTML, so model text can't inject markup. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4 ? (
      <strong key={i}>{chunk.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{chunk}</React.Fragment>
    ),
  );
}

function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)/);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="font-semibold">
          {inline(heading[1])}
        </p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();

  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}

export function CopilotChat() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch("/api/private/copilot")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUnavailable(!data.available))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;

    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/private/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      setMessages([
        ...next,
        {
          role: "assistant",
          content: res.ok ? data.reply : (data.error ?? "Something went wrong. Try again."),
          steps: res.ok ? data.steps : undefined,
        },
      ]);
    } catch {
      setMessages([...next, { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex min-h-[28rem] flex-col p-4 sm:p-6">
      {unavailable && (
        <p className="mb-4 rounded-2xl bg-secondary px-4 py-3 text-sm">
          The copilot isn&apos;t switched on for this deployment yet — add a <code>GEMINI_API_KEY</code>.
        </p>
      )}

      <div className="flex-1 space-y-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-start gap-4 py-6">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="font-display text-xl">What would you like to know?</p>
              <p className="text-sm text-muted-foreground">Try one of these, or ask in your own words.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="secondary" size="sm" disabled={unavailable} onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-3xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={i} className="max-w-[92%] space-y-2">
                {m.steps && m.steps.length > 0 && (
                  <p className="text-xs text-muted-foreground">{[...new Set(m.steps)].join(" · ")}</p>
                )}
                <Markdown text={m.content} />
              </div>
            ),
          )
        )}

        {pending && (
          <p className="animate-pulse text-sm text-muted-foreground">Looking through your numbers…</p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-6 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Ask about your spending, budgets, goals…"
          aria-label="Message the copilot"
          disabled={unavailable}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-3xl border-[1.5px] border-border bg-transparent px-4 py-2 text-sm outline-none focus-visible:border-foreground"
        />
        {messages.length > 0 && (
          <Button type="button" variant="ghost" size="icon" aria-label="Start over" onClick={() => setMessages([])} disabled={pending}>
            <RotateCcw />
          </Button>
        )}
        <Button type="submit" size="icon" aria-label="Send" disabled={pending || unavailable || !input.trim()}>
          <ArrowUp />
        </Button>
      </form>
    </Card>
  );
}
