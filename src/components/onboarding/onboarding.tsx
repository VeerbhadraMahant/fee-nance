"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { useCurrentUser } from "@/components/providers/current-user";
import { TOUR_STEPS, type TourStep } from "./steps";

/**
 * First-run onboarding: a welcome dialog the first time someone lands on the
 * dashboard, a guided tour that spotlights the real screens, and optional
 * sample data so the charts have something in them.
 *
 * "Seen it" is remembered per account in localStorage. If storage is blocked
 * the welcome simply shows again, which is harmless.
 */

interface SampleState {
  hasData: boolean;
  hasSampleData: boolean;
}

interface OnboardingContextValue {
  startTour: () => void;
  sample: SampleState | null;
  busy: boolean;
  loadSample: () => Promise<boolean>;
  removeSample: () => Promise<boolean>;
}

const OnboardingContext = React.createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const value = React.useContext(OnboardingContext);
  if (!value) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return value;
}

const SYNCED_EVENT = "feenance:synced"; // screens refetch when they hear this
const flagKey = (userId: string) => `feenance:tour:${userId}`;

function readFlag(userId: string) {
  try {
    return localStorage.getItem(flagKey(userId));
  } catch {
    return null;
  }
}
function writeFlag(userId: string, value: "done" | "skipped") {
  try {
    localStorage.setItem(flagKey(userId), value);
  } catch {
    // ignore
  }
}

/* ── Finding and placing ───────────────────────────────────────────────── */

function visible(el: Element) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveTarget(step: TourStep): HTMLElement | null {
  for (const name of step.targets ?? []) {
    const match = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)).find(visible);
    if (match) return match;
  }
  return null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 368;
const MARGIN = 16;
const GAP = 14;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

function cardStyle(box: Box | null, vw: number, vh: number): React.CSSProperties {
  if (!box) {
    return { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `min(${CARD_WIDTH}px, calc(100vw - 2rem))` };
  }
  if (vw < 640) {
    // Docked, on whichever half of the screen the target is not.
    const targetLow = box.top + box.height / 2 > vh / 2;
    return targetLow
      ? { left: MARGIN, right: MARGIN, top: "calc(4rem + env(safe-area-inset-top))" }
      : { left: MARGIN, right: MARGIN, bottom: "calc(5.5rem + env(safe-area-inset-bottom))" };
  }
  const cardHeight = 260;
  const right = box.left + box.width + GAP;
  if (right + CARD_WIDTH <= vw - MARGIN) {
    return { left: right, top: clamp(box.top, MARGIN, vh - cardHeight - MARGIN), width: CARD_WIDTH };
  }
  const left = clamp(box.left, MARGIN, vw - CARD_WIDTH - MARGIN);
  if (box.top + box.height + GAP + cardHeight <= vh - MARGIN) {
    return { left, top: box.top + box.height + GAP, width: CARD_WIDTH };
  }
  if (box.top - GAP - cardHeight >= MARGIN) {
    return { left, top: box.top - GAP - cardHeight, width: CARD_WIDTH };
  }
  return { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_WIDTH };
}

/* ── The tour ──────────────────────────────────────────────────────────── */

function Tour({ onClose }: { onClose: (outcome: "done" | "skipped") => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = React.useState(0);
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;

  // The step whose page is open and whose target (if any) has been looked for.
  const [found, setFound] = React.useState<{ index: number; el: HTMLElement | null } | null>(null);
  const [box, setBox] = React.useState<Box | null>(null);
  const [viewport, setViewport] = React.useState({ w: 1024, h: 768 });
  const primary = React.useRef<HTMLButtonElement>(null);

  // Go to the step's page, then wait for its target to render (data loads
  // first on some pages), giving up after three seconds.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;

    if (step.route && window.location.pathname !== step.route) router.push(step.route);

    const look = () => {
      if (cancelled) return;
      const onPage = !step.route || window.location.pathname === step.route;
      const el = onPage ? resolveTarget(step) : null;
      if (onPage && (el || !step.targets || tries >= 30)) {
        el?.scrollIntoView({ block: "center", inline: "nearest" });
        setFound({ index, el });
        return;
      }
      tries += 1;
      timer = setTimeout(look, 100);
    };
    timer = setTimeout(look, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `pathname` is a dependency so a slow navigation is noticed.
  }, [index, step, router, pathname]);

  const el = found?.index === index ? found.el : null;
  const ready = found?.index === index;

  // Keep the spotlight on the element through scrolling, resizing and layout shifts.
  React.useEffect(() => {
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!el || !el.isConnected) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const first = requestAnimationFrame(measure);
    const interval = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [el]);

  const next = React.useCallback(() => {
    if (last) onClose("done");
    else setIndex((i) => i + 1);
  }, [last, onClose]);
  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose("skipped");
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onClose]);

  React.useEffect(() => {
    if (ready) primary.current?.focus({ preventScroll: true });
  }, [ready, index]);

  if (!ready) return null;

  const spot = el && box ? box : null;
  return (
    <div className="fixed inset-0 z-[60]" data-slot="tour">
      {/* Blocks clicks into the page while the tour is open, and dims it when
          nothing is spotlighted. */}
      <div className={spot ? "absolute inset-0" : "absolute inset-0 bg-black/55"} aria-hidden="true" onClick={() => undefined} />
      {spot && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            top: spot.top - 6,
            left: spot.left - 6,
            width: spot.width + 12,
            height: spot.height + 12,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute flex flex-col gap-3 rounded-3xl border-[1.5px] border-foreground bg-popover p-5 text-popover-foreground"
        style={cardStyle(spot, viewport.w, viewport.h)}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="overline">
            Step {index + 1} of {TOUR_STEPS.length}
          </p>
          <button
            type="button"
            onClick={() => onClose("skipped")}
            className="rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Skip tour
          </button>
        </div>
        <h2 id="tour-title" className="font-display text-2xl leading-tight">
          {step.title}
        </h2>
        <p id="tour-body" className="text-sm text-muted-foreground">
          {step.body}
        </p>
        {step.points && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {step.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex gap-1" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span key={s.id} className={i === index ? "size-2 rounded-full bg-primary" : "size-2 rounded-full bg-muted-foreground/30"} />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={back}>
                <ArrowLeft /> Back
              </Button>
            )}
            <Button ref={primary} size="sm" onClick={next}>
              {last ? "Finish" : "Next"} {!last && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Provider ──────────────────────────────────────────────────────────── */

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const userId = user?.id;
  const pathname = usePathname();
  const router = useRouter();

  const [touring, setTouring] = React.useState(false);
  const [welcome, setWelcome] = React.useState(false);
  const [sample, setSample] = React.useState<SampleState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const checkedWelcome = React.useRef(false);

  const refreshSample = React.useCallback(async () => {
    try {
      const response = await fetch("/api/private/demo");
      if (!response.ok) return null;
      const body = (await response.json()) as SampleState;
      setSample(body);
      return body;
    } catch {
      return null;
    }
  }, []);

  // Sample-data status, for the banner and the Profile card.
  React.useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => void refreshSample(), 0);
    return () => clearTimeout(timer);
  }, [userId, refreshSample]);

  // Offer the tour once, on the dashboard, to someone who has not seen it.
  React.useEffect(() => {
    if (!userId || checkedWelcome.current || pathname !== "/dashboard") return;
    checkedWelcome.current = true;
    if (readFlag(userId)) return;
    const timer = setTimeout(() => setWelcome(true), 600);
    return () => clearTimeout(timer);
  }, [userId, pathname]);

  const startTour = React.useCallback(() => {
    setWelcome(false);
    setTouring(true);
  }, []);

  const closeTour = React.useCallback(
    (outcome: "done" | "skipped") => {
      setTouring(false);
      if (userId) writeFlag(userId, outcome);
      if (outcome === "done") router.push("/dashboard");
    },
    [router, userId],
  );

  const loadSample = React.useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/private/demo", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Couldn't add sample data");
        return false;
      }
      await refreshSample();
      window.dispatchEvent(new Event(SYNCED_EVENT));
      toast.success("Sample data added. Remove it any time from the banner at the top.");
      return true;
    } catch {
      toast.error("You need a connection to add sample data");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshSample]);

  const removeSample = React.useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/private/demo", { method: "DELETE" });
      if (!response.ok) {
        toast.error("Couldn't remove sample data");
        return false;
      }
      await refreshSample();
      window.dispatchEvent(new Event(SYNCED_EVENT));
      toast.success("Sample data removed. Anything you added yourself is untouched.");
      return true;
    } catch {
      toast.error("You need a connection to remove sample data");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshSample]);

  const skipWelcome = () => {
    setWelcome(false);
    if (userId) writeFlag(userId, "skipped");
  };

  const value = React.useMemo<OnboardingContextValue>(
    () => ({ startTour, sample, busy, loadSample, removeSample }),
    [startTour, sample, busy, loadSample, removeSample],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}

      <Dialog open={welcome} onOpenChange={(open) => !open && skipWelcome()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Compass className="size-5 text-primary" aria-hidden="true" /> Welcome to Fee-Nance
            </DialogTitle>
            <DialogDescription>
              Your own money and the money you share with friends, in one place. Want a two-minute look around?
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2 text-sm">
            <p>The tour points out the main screens as you go. Nothing in it changes your data.</p>
            {sample && !sample.hasData && (
              <p className="text-muted-foreground">
                Your account is empty, so the charts will be blank. You can add a few months of made-up sample data
                first, and remove it again with one click.
              </p>
            )}
          </DialogBody>
          <DialogFooter className="sm:flex-col sm:items-stretch">
            <Button onClick={startTour}>Take the tour</Button>
            {sample && !sample.hasData && (
              <Button
                variant="outline"
                loading={busy}
                onClick={async () => {
                  if (await loadSample()) startTour();
                }}
              >
                <FlaskConical /> Add sample data, then tour
              </Button>
            )}
            <Button variant="ghost" onClick={skipWelcome}>
              Skip for now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {touring && <Tour onClose={closeTour} />}
    </OnboardingContext.Provider>
  );
}

/* ── Banner ────────────────────────────────────────────────────────────── */

/** Shown while sample data is in the account, with the one-click way out. */
export function SampleDataBanner() {
  const { sample, busy, removeSample, startTour } = useOnboarding();
  const { confirm, confirmDialog } = useConfirm();
  if (!sample?.hasSampleData) return null;

  return (
    <>
      <div
        role="status"
        className="mb-6 flex flex-col gap-3 rounded-2xl border-[1.5px] border-foreground bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between print:hidden"
      >
        <p className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            You are looking at <b>sample data</b>, not real money. Adding your own entries is fine: removing the sample
            later deletes only the sample.
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={startTour}>
            Take the tour
          </Button>
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "Remove the sample data?",
                description: "This deletes the sample transactions, budgets and goals. Anything you added yourself stays.",
                confirmLabel: "Remove sample data",
                destructive: true,
              });
              if (ok) await removeSample();
            }}
          >
            Remove sample data
          </Button>
        </div>
      </div>
      {confirmDialog}
    </>
  );
}
