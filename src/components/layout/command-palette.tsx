"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CornerDownLeft,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS } from "./nav-config";

/**
 * ⌘K / Ctrl+K launcher, adapted from HackMatrix's command palette: jump to
 * any page, start a common action, or switch theme without leaving the
 * keyboard. Built on the same Radix dialog as every other modal here, so
 * focus trapping, Escape and scroll lock behave identically.
 */

interface Command {
  id: string;
  group: "Go to" | "Create" | "Theme";
  label: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

const OPEN_EVENT = "fee-nance:command-palette";

/** Opens the palette from anywhere — e.g. a search button in the shell. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function score(command: Command, query: string) {
  if (!query) return 1;
  const label = command.label.toLowerCase();
  const haystack = `${label} ${command.hint ?? ""} ${command.keywords ?? ""}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.every((term) => haystack.includes(term))) return 0;
  // Label prefix matches rank above matches buried in keywords.
  return label.startsWith(terms[0]!) ? 3 : label.includes(terms[0]!) ? 2 : 1;
}

export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const commands = React.useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...ALL_NAV_ITEMS.map((item) => ({
        id: `go:${item.href}`,
        group: "Go to" as const,
        label: item.label,
        hint: item.description,
        keywords: item.keywords,
        icon: item.icon,
        run: go(item.href),
      })),
      {
        id: "go:/profile",
        group: "Go to",
        label: "Profile & settings",
        hint: "Name, password and preferences",
        keywords: "account settings password",
        icon: Settings,
        run: go("/profile"),
      },
      {
        id: "new:transaction",
        group: "Create",
        label: "New transaction",
        hint: "Record income or an expense",
        keywords: "add expense income spend",
        icon: Plus,
        run: go("/finance?new=transaction"),
      },
      {
        id: "new:goal",
        group: "Create",
        label: "New savings goal",
        keywords: "add target save",
        icon: Plus,
        run: go("/goals?new=goal"),
      },
      {
        id: "new:group",
        group: "Create",
        label: "New group",
        hint: "Split expenses with others",
        keywords: "add split friends",
        icon: Plus,
        run: go("/groups"),
      },
      { id: "theme:light", group: "Theme", label: "Light theme", icon: Sun, run: () => setTheme("light") },
      { id: "theme:dark", group: "Theme", label: "Dark theme", icon: Moon, run: () => setTheme("dark") },
      {
        id: "theme:system",
        group: "Theme",
        label: "Match system theme",
        icon: Monitor,
        run: () => setTheme("system"),
      },
    ];
  }, [router, setTheme]);

  const results = React.useMemo(
    () =>
      commands
        .map((command) => ({ command, rank: score(command, query.trim()) }))
        .filter((entry) => entry.rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .map((entry) => entry.command),
    [commands, query],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  };

  const runCommand = (command: Command) => {
    handleOpenChange(false);
    command.run();
  };

  const moveTo = (index: number) => {
    const next = (index + results.length) % Math.max(1, results.length);
    setActive(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(active - 1);
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      runCommand(results[active]);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 flex max-h-[min(32rem,76vh)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden",
            "rounded-3xl border-[1.5px] border-border bg-popover text-popover-foreground outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search pages and actions. Use the arrow keys to move and Enter to choose.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b-[1.5px] border-border px-5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder="Search pages and actions…"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              aria-autocomplete="list"
            />
            <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>

          <ul
            id="command-results"
            ref={listRef}
            role="listbox"
            aria-label="Results"
            className="flex-1 overflow-y-auto p-2"
          >
            {results.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing matches “{query}”.
              </li>
            )}
            {results.map((command, index) => {
              // Group headings render inline, once, where each group starts.
              const heading =
                !query && command.group !== results[index - 1]?.group ? command.group : null;
              const Icon = command.icon;
              const selected = index === active;

              return (
                <React.Fragment key={command.id}>
                  {heading && (
                    <li role="presentation" className="overline px-3 pb-1 pt-3">
                      {heading}
                    </li>
                  )}
                  <li
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => runCommand(command)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5",
                      selected ? "bg-muted" : "",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{command.label}</span>
                      {command.hint && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {command.hint}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
