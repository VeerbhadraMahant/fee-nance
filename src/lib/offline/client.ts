"use client";

import { useSyncExternalStore } from "react";

import { toast } from "@/components/ui/toaster";

import { queueStore } from "./store";
import {
  classify,
  describe,
  makeRepeatable,
  overlayTransactions,
  runSync,
  type OverlayTransaction,
  type QueueItem,
} from "./rules";

/**
 * Offline mode, client side. Three jobs:
 *
 *   1. Intercept the app's own writes. A queueable write (see rules.ts) that
 *      can't reach the server is stored on this device and answered with a 202,
 *      so the forms behave as if it had saved. Everything else is untouched.
 *   2. Replay the queue when the connection returns, in order, only if there
 *      is anything in it.
 *   3. Tell the UI what is waiting, via useOfflineState().
 *
 * The service worker (public/sw.js) separately keeps the app shell and the
 * last-seen data available so pages open with no connection at all.
 *
 * The interception is a patch of window.fetch rather than a change at each of
 * the ~25 call sites, because it has to apply the same rules to all of them:
 * make the write repeatable, try it, queue it if the network is the reason it
 * failed. The patch only ever looks at same-origin /api/private requests.
 */

const UID_KEY = "feenance:uid";
const WARM_KEY = "feenance:warmed";
const WARM_EVERY_MS = 12 * 60 * 60 * 1000;
const WRITE_TIMEOUT_MS = 15_000;
const SYNCED_EVENT = "feenance:synced";

/* ── State ─────────────────────────────────────────────────────────────── */

export interface OfflineState {
  online: boolean;
  syncing: boolean;
  /** The session expired while changes were waiting; they sync after sign-in. */
  authRequired: boolean;
  items: QueueItem[];
}

const SERVER_STATE: OfflineState = { online: true, syncing: false, authRequired: false, items: [] };
let state: OfflineState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOfflineState() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** True while there is anything on this device that the server hasn't seen. */
export function hasPendingChanges() {
  return state.items.some((item) => item.status === "pending");
}

/* ── Identity ──────────────────────────────────────────────────────────── */

let currentUserId: string | null = null;
let nativeFetch: typeof fetch | null = null;
let channel: BroadcastChannel | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 5_000;
let counter = 0;

function readStoredUser() {
  try {
    return localStorage.getItem(UID_KEY);
  } catch {
    return null;
  }
}

const uuid = () => crypto.randomUUID();

/** Strictly increasing across tabs: millisecond time, then a per-page counter. */
const nextOrder = () => Date.now() * 1000 + (counter = (counter + 1) % 1000);

async function refreshItems() {
  if (!currentUserId) return setState({ items: [] });
  try {
    const all = await queueStore.all();
    setState({ items: all.filter((item) => item.userId === currentUserId).sort((a, b) => a.order - b.order) });
  } catch {
    setState({ items: [] });
  }
}

function announce(message: "changed" | "synced") {
  channel?.postMessage(message);
}

/* ── Queueing ──────────────────────────────────────────────────────────── */

function queuedResponse(item: QueueItem) {
  const body: Record<string, unknown> = { queued: true };
  if (item.kind === "transaction" && item.op === "create") body.transaction = { _id: item.targetId };
  return new Response(JSON.stringify(body), {
    status: 202,
    headers: { "content-type": "application/json", "x-queued": "1" },
  });
}

async function enqueue(
  url: URL,
  method: string,
  prepared: { body: string | null; headers: Record<string, string>; targetId?: string },
  classified: NonNullable<ReturnType<typeof classify>>,
): Promise<Response | null> {
  if (!currentUserId) return null;

  const item: QueueItem = {
    id: uuid(),
    userId: currentUserId,
    order: nextOrder(),
    createdAt: new Date().toISOString(),
    kind: classified.kind,
    op: classified.op,
    method: method as QueueItem["method"],
    url: url.pathname,
    body: prepared.body,
    headers: prepared.headers,
    targetId: prepared.targetId,
    label: describe(classified.kind, classified.op, prepared.body),
    status: "pending",
    attempts: 0,
  };

  try {
    await queueStore.put(item);
  } catch {
    return null; // Can't store it: let the request fail normally instead of promising a save.
  }

  await refreshItems();
  announce("changed");
  toast("Saved on this device. It will sync when you're back online.", { id: "offline-queued" });
  scheduleRetry();
  return queuedResponse(item);
}

/* ── The fetch patch ───────────────────────────────────────────────────── */

function headersToObject(headers: HeadersInit | undefined) {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const native = nativeFetch!;
  const request = input instanceof Request ? input : null;
  let url: URL;
  try {
    url = new URL(request ? request.url : String(input), window.location.href);
  } catch {
    return native(input, init);
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/private/")) {
    return native(input, init);
  }

  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();

  // Reads: show pending transaction changes on top of whatever came back,
  // from the network or from the service worker's saved copy.
  if (method === "GET") {
    const response = await native(input, init);
    const pending = state.items.filter((item) => item.kind === "transaction" && item.status === "pending");
    if (url.pathname !== "/api/private/finance/aggregate" || !pending.length || !response.ok) return response;
    try {
      const data = (await response.clone().json()) as { transactions?: OverlayTransaction[] };
      if (!Array.isArray(data.transactions)) return response;
      const merged = {
        ...data,
        transactions: overlayTransactions(data.transactions, pending, {
          startDate: url.searchParams.get("startDate"),
          endDate: url.searchParams.get("endDate"),
        }),
      };
      return new Response(JSON.stringify(merged), { status: 200, headers: response.headers });
    } catch {
      return response;
    }
  }

  // Writes: only the queueable ones, and only with a plain JSON body.
  const classified = classify(method, url.pathname);
  const body = init?.body;
  if (!classified || request || (body !== undefined && body !== null && typeof body !== "string")) {
    return native(input, init);
  }

  const prepared = makeRepeatable(classified, (body as string | null | undefined) ?? null, headersToObject(init?.headers), uuid);
  const send = (): Promise<Response> => {
    const timeout = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(WRITE_TIMEOUT_MS) : undefined;
    const signals = [init?.signal, timeout].filter((s): s is AbortSignal => Boolean(s));
    const signal = signals.length > 1 && typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : signals[0];
    return native(input, {
      ...init,
      body: prepared.body ?? undefined,
      headers: { ...prepared.headers, ...(prepared.body ? { "content-type": "application/json" } : {}) },
      signal,
    });
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return (await enqueue(url, method, prepared, classified)) ?? send();
  }

  try {
    return await send();
  } catch (error) {
    if (init?.signal?.aborted) throw error; // the caller cancelled it; that's not a network problem
    return (await enqueue(url, method, prepared, classified)) ?? Promise.reject(error);
  }
}

function installFetchPatch() {
  if (typeof window === "undefined") return;
  const marker = window as unknown as { __feenanceFetchPatched?: typeof fetch };
  if (marker.__feenanceFetchPatched) {
    nativeFetch = marker.__feenanceFetchPatched;
    return;
  }
  nativeFetch = window.fetch.bind(window);
  marker.__feenanceFetchPatched = nativeFetch;
  currentUserId = readStoredUser();
  window.fetch = patchedFetch;
}

installFetchPatch();

/* ── Syncing ───────────────────────────────────────────────────────────── */

async function sendItem(item: QueueItem) {
  const response = await nativeFetch!(item.url, {
    method: item.method,
    headers: { ...item.headers, ...(item.body ? { "content-type": "application/json" } : {}) },
    body: item.body ?? undefined,
    signal: AbortSignal.timeout?.(20_000),
  });
  let error: string | undefined;
  if (!response.ok) {
    try {
      error = ((await response.json()) as { error?: string }).error;
    } catch {
      // not JSON; the status is enough
    }
  }
  return { status: response.status, error };
}

function scheduleRetry() {
  if (retryTimer || typeof window === "undefined") return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow().then(() => {
      if (hasPendingChanges() && !state.authRequired) {
        retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
        scheduleRetry();
      } else {
        retryDelay = 5_000;
      }
    });
  }, retryDelay);
}

/**
 * Sends whatever is waiting. A no-op when nothing is: a device with no
 * changes never makes a sync request.
 */
export async function syncNow() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (state.syncing || !currentUserId || !nativeFetch) return;

  const userId = currentUserId;
  const work = async () => {
    let mine: QueueItem[];
    try {
      mine = (await queueStore.all()).filter((item) => item.userId === userId);
    } catch {
      return;
    }
    if (!mine.some((item) => item.status === "pending")) return;

    setState({ syncing: true, authRequired: false });
    try {
      const result = await runSync({
        load: async () => mine,
        save: (item) => queueStore.put(item),
        remove: (id) => queueStore.remove(id),
        send: sendItem,
      });

      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} change${result.synced === 1 ? "" : "s"}`);
        window.dispatchEvent(new Event(SYNCED_EVENT));
        announce("synced");
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} change${result.failed === 1 ? "" : "s"} couldn't be saved. Open the sync panel to review.`, {
          id: "offline-failed",
        });
      }
      if (result.authRequired) {
        setState({ authRequired: true });
        toast.error("Your session expired. Sign in again and your waiting changes will sync.", { id: "offline-auth" });
      }
    } finally {
      setState({ syncing: false });
      await refreshItems();
      announce("changed");
    }
  };

  if (navigator.locks) {
    await navigator.locks.request("feenance-sync", { ifAvailable: true }, async (lock) => {
      if (lock) await work();
    });
  } else {
    await work();
  }
}

export async function discardItem(id: string) {
  await queueStore.remove(id);
  await refreshItems();
  announce("changed");
  window.dispatchEvent(new Event(SYNCED_EVENT)); // lists drop the pending row
}

export async function retryItem(id: string) {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;
  await queueStore.put({ ...item, status: "pending", attempts: 0, error: undefined });
  await refreshItems();
  await syncNow();
}

/** Subscribe to "the queue just synced", to refetch what's on screen. */
export function onSynced(listener: () => void) {
  window.addEventListener(SYNCED_EVENT, listener);
  return () => window.removeEventListener(SYNCED_EVENT, listener);
}

/* ── Service worker ────────────────────────────────────────────────────── */

const WARM_ROUTES = [
  "/dashboard",
  "/finance",
  "/groups",
  "/analytics",
  "/insights",
  "/goals",
  "/tax",
  "/report",
  "/copilot",
  "/profile",
];

async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (process.env.NODE_ENV !== "production") {
    // A worker left over from a production build would serve stale code in dev.
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const registration = await navigator.serviceWorker.ready;
    warmCache(registration);
  } catch {
    // Offline pages are an enhancement; the app works without them.
  }
}

/** Once every 12 hours, while online: save the shell assets and main pages. */
function warmCache(registration: ServiceWorkerRegistration) {
  try {
    const last = Number(localStorage.getItem(WARM_KEY) ?? 0);
    if (Date.now() - last < WARM_EVERY_MS) return;
    const connection = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    localStorage.setItem(WARM_KEY, String(Date.now()));
  } catch {
    // no storage: warm anyway
  }

  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name, window.location.href))
    .filter((url) => url.origin === window.location.origin && url.pathname.startsWith("/_next/static/"))
    .map((url) => url.pathname + url.search);

  registration.active?.postMessage({ type: "CACHE", assets, pages: WARM_ROUTES });
}

/** Forget the saved copies of pages and data (not the waiting changes). */
async function clearSavedCopies() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.active?.postMessage({ type: "CLEAR" });
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("feenance-")).map((name) => caches.delete(name)));
    }
  } catch {
    // best effort
  }
  try {
    localStorage.removeItem(WARM_KEY);
  } catch {
    // ignore
  }
}

/** Forget everything saved on this device for a user, waiting changes included. */
export async function clearOfflineData(userId?: string | null) {
  const id = userId ?? currentUserId;
  try {
    if (id) await queueStore.removeForUser(id);
  } catch {
    // nothing stored
  }
  await clearSavedCopies();
  await refreshItems();
}

/* ── Start-up ──────────────────────────────────────────────────────────── */

let started = false;

/** Called once the signed-in user is known (from the app shell). */
export function startOffline(userId: string) {
  if (typeof window === "undefined") return;

  const previous = readStoredUser();
  if (previous && previous !== userId) {
    // Someone else's data is cached on this device; it must not be served to
    // this user. Their queued changes stay put and sync when they sign in.
    void clearSavedCopies();
  }
  currentUserId = userId;
  try {
    localStorage.setItem(UID_KEY, userId);
  } catch {
    // ignore
  }

  void refreshItems().then(() => {
    if (hasPendingChanges()) void syncNow();
  });

  if (started) return;
  started = true;

  setState({ online: navigator.onLine });
  window.addEventListener("online", () => {
    setState({ online: true });
    void syncNow().then(() => {
      // Nothing was waiting: still refetch what's on screen, it may be stale.
      if (!hasPendingChanges()) window.dispatchEvent(new Event(SYNCED_EVENT));
    });
  });
  window.addEventListener("offline", () => setState({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hasPendingChanges()) void syncNow();
  });

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("feenance-offline");
    channel.onmessage = (event) => {
      void refreshItems();
      if (event.data === "synced") window.dispatchEvent(new Event(SYNCED_EVENT));
    };
  }

  void registerServiceWorker();
  if (hasPendingChanges()) scheduleRetry();
}
