"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { toast } from "@/components/ui/toaster";

/* ── Response cache ────────────────────────────────────────────────────────
   Last good response per URL, for this tab's lifetime. Revisiting a page
   paints the cached data immediately and revalidates behind it, instead of
   flashing a skeleton for data the user saw a moment ago. Sign-out is a full
   navigation, so the cache never outlives the session that filled it. */

const cache = new Map<string, unknown>();

/* ── In-flight counter, for the global progress bar ────────────────────── */

let inFlight = 0;
const listeners = new Set<() => void>();

function setInFlight(delta: number) {
  inFlight = Math.max(0, inFlight + delta);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while any `useQuery` request is in flight. */
export function useIsFetching() {
  return useSyncExternalStore(
    subscribe,
    () => inFlight > 0,
    () => false,
  );
}

/**
 * Fetch JSON with stale-while-revalidate semantics.
 *
 * `isLoading` is true only while there is nothing to show yet. A `reload()`
 * after a mutation, or a URL change, keeps the current data on screen and
 * sets `isValidating` instead — so saving a transaction no longer swaps the
 * whole page for a skeleton and throws away scroll position and filters.
 *
 * A failed revalidation keeps the data already on screen and says so with a
 * toast; `error` is only set when there is no data to fall back on.
 */
export function useQuery<T>(url: string) {
  const [data, setData] = useState<T | null>(() => (cache.get(url) as T | undefined) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [prevUrl, setPrevUrl] = useState(url);

  // A new URL with a cached response shows that response straight away.
  // Adjusting state during render is React's sanctioned alternative to an
  // effect for this, and avoids painting one frame of the old data.
  if (prevUrl !== url) {
    setPrevUrl(url);
    const cached = cache.get(url) as T | undefined;
    if (cached !== undefined) setData(cached);
  }

  const reload = useCallback(() => {
    setRefreshCount((count) => count + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setIsValidating(true);
      setInFlight(1);
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          throw new Error("Request failed");
        }

        const result = (await response.json()) as T;
        cache.set(url, result);
        setData(result);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (cache.has(url)) {
          toast.error("Couldn't refresh — showing the last loaded data");
        } else {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      } finally {
        // Runs for aborted requests too, so the counter always balances.
        setInFlight(-1);
        if (!controller.signal.aborted) setIsValidating(false);
      }
    }

    void run();

    return () => controller.abort();
  }, [refreshCount, url]);

  const isLoading = data === null && error === null;

  return { data, isLoading, isValidating, error, reload };
}

/** Pulls the server's error message out of a failed response, with a fallback. */
export async function readApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
}
