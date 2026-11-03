/*
 * Fee-Nance service worker. Makes the app open with no connection.
 *
 * What it keeps, and how:
 *   /_next/static/*   the app's code, fonts and styles. Hashed and immutable,
 *                     so served from the saved copy first.
 *   pages             /dashboard, /finance, … Network first (you always get
 *                     the live page when you can), the last good copy when you
 *                     can't, and /offline.html if you've never opened that page.
 *   /api/private GET  Network first, the last good copy when offline. This is
 *                     what lets a page you've opened before show its data.
 *
 * What it never touches: anything that isn't a GET, /auth/*, and redirects
 * (a signed-out visit is bounced to /login, which must not be saved as the
 * page). Writes made offline are queued by the app itself, not here (see
 * src/lib/offline/client.ts), because they need the app's rules to be safe to
 * repeat.
 *
 * The saved copies hold the signed-in user's data, so the app tells this
 * worker to delete them all on sign-out, and when a different user signs in.
 */

const VERSION = "v1";
const SHELL = `feenance-shell-${VERSION}`;
const STATIC = `feenance-static-${VERSION}`;
const PAGES = `feenance-pages-${VERSION}`;
const API = `feenance-api-${VERSION}`;
const CURRENT = [SHELL, STATIC, PAGES, API];

const SHELL_URLS = ["/offline.html", "/icon.svg", "/icons/icon-192.png"];
const MAX_STATIC_ENTRIES = 400;
const PAGE_PREFIXES = [
  "/dashboard", "/finance", "/groups", "/analytics", "/insights",
  "/goals", "/tax", "/report", "/copilot", "/profile",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith("feenance-") && !CURRENT.includes(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CLEAR") {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith("feenance-")).map((n) => caches.delete(n)))));
  } else if (data.type === "CACHE") {
    event.waitUntil(warm(data.assets || [], data.pages || []));
  }
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Resolves with the response, or rejects after `ms` (0 = wait as long as it takes). */
function fetchWithin(request, ms) {
  if (!ms) return fetch(request);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function withHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

const isPagePath = (pathname) =>
  pathname === "/" || PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

/** Pages are saved by path alone: ?new=transaction and friends are one page. */
const pageKey = (url) => new Request(url.origin + url.pathname);
/** The most recent good copy of an API route, whatever its query was. */
const latestKey = (url) => new Request(url.origin + url.pathname + "?__latest");

/* ── Strategies ──────────────────────────────────────────────────────── */

async function cacheFirstStatic(event, request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    // waitUntil: the browser may stop the worker as soon as the response is
    // sent, and an unfinished write would leave nothing saved.
    event.waitUntil(cache.put(request, response.clone()).then(() => trim(STATIC, MAX_STATIC_ENTRIES)));
  }
  return response;
}

async function pageStrategy(event, request, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  const saved = await cache.match(key);

  try {
    // With a saved copy, don't make someone on a bad connection wait for it.
    const response = await fetchWithin(request, saved ? 4000 : 0);
    if (response.ok && !response.redirected && isPagePath(url.pathname)) {
      event.waitUntil(cache.put(key, response.clone()));
    }
    return response;
  } catch {
    if (saved) return saved;
    const fallback = await caches.match("/offline.html");
    return fallback || Response.error();
  }
}

async function apiStrategy(event, request, url) {
  const cache = await caches.open(API);
  const saved = (await cache.match(request)) || (await cache.match(latestKey(url)));

  try {
    const response = await fetchWithin(request, saved ? 6000 : 0);
    if (response.ok) {
      event.waitUntil(Promise.all([cache.put(request, response.clone()), cache.put(latestKey(url), response.clone())]));
    }
    return response;
  } catch {
    if (saved) return withHeader(saved, "x-offline-copy", "1");
    return new Response(
      JSON.stringify({ error: "You're offline, and this hasn't been opened on this device yet." }),
      { status: 503, headers: { "content-type": "application/json", "x-offline-copy": "0" } },
    );
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  });
  if (hit) {
    refresh.catch(() => undefined);
    return hit;
  }
  return refresh;
}

/* ── Routing ─────────────────────────────────────────────────────────── */

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith("/auth/") || path === "/sw.js") return;

  if (path.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(event, request));
    return;
  }

  if (path.startsWith("/api/private/")) {
    event.respondWith(apiStrategy(event, request, url));
    return;
  }
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return;

  // Next's client-side navigations ask for a data payload, not a page. When
  // those fail Next falls back to a normal navigation, which is handled below.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  const wantsHtml = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    event.respondWith(pageStrategy(event, request, url));
    return;
  }

  if (/\.(?:png|svg|ico|webp|jpg|jpeg|woff2?)$/.test(path) || path === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

/* ── Warm-up ─────────────────────────────────────────────────────────── */

/** Saves the app's code and the main pages so they open offline on first try. */
async function warm(assets, pages) {
  const statics = await caches.open(STATIC);
  await Promise.all(
    assets.map(async (asset) => {
      try {
        if (await statics.match(asset)) return;
        const response = await fetch(asset);
        if (response.ok) await statics.put(asset, response);
      } catch { /* offline: try again next time */ }
    }),
  );

  const saved = await caches.open(PAGES);
  for (const page of pages) {
    try {
      const response = await fetch(page, { credentials: "same-origin", headers: { accept: "text/html" } });
      if (!response.ok || response.redirected) continue;

      // A page is only useful offline if the code it runs is saved too: pull
      // every /_next/static file the page names out of its HTML.
      const html = await response.clone().text();
      const found = new Set();
      for (const match of html.matchAll(/(?:\/_next\/)?(static\/(?:chunks|css|media)\/[A-Za-z0-9_\-.~%\/]+\.(?:js|css|woff2?))/g)) {
        found.add("/_next/" + match[1]);
      }
      await Promise.all(
        [...found].map(async (asset) => {
          try {
            if (await statics.match(asset)) return;
            const file = await fetch(asset);
            if (file.ok) await statics.put(asset, file);
          } catch { /* skip */ }
        }),
      );

      await saved.put(pageKey(new URL(page, self.location.origin)), response);
    } catch { /* skip */ }
  }
  trim(STATIC, MAX_STATIC_ENTRIES);
}
