/**
 * Exercises public/sw.js without a browser: the worker is run in a sandbox
 * with an in-memory CacheStorage and a network that can be switched off, and
 * each caching rule is checked through the same fetch event a browser fires.
 *
 *   npm run verify:sw
 *
 * This proves the worker's logic, not that a given browser honours it; that
 * part still needs a real device (see docs/offline.md).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const ORIGIN = "https://app.test";

/* ── Fakes ─────────────────────────────────────────────────────────────── */

interface Stored {
  status: number;
  headers: [string, string][];
  body: string;
}

class FakeCache {
  entries = new Map<string, Stored>();
  private key(input: unknown) {
    return typeof input === "string" ? new URL(input, ORIGIN).href : (input as { url: string }).url;
  }
  async match(input: unknown) {
    const hit = this.entries.get(this.key(input));
    return hit ? new Response(hit.body, { status: hit.status, headers: hit.headers }) : undefined;
  }
  async put(input: unknown, response: Response) {
    this.entries.set(this.key(input), {
      status: response.status,
      headers: [...response.headers.entries()],
      body: await response.text(),
    });
  }
  async addAll(urls: string[]) {
    for (const url of urls) await this.put(url, new Response(`shell:${url}`));
  }
  async delete(input: unknown) {
    return this.entries.delete(this.key(input));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }
  async match(input: unknown) {
    for (const store of this.stores.values()) {
      const hit = await store.match(input);
      if (hit) return hit;
    }
    return undefined;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

let online = true;
let redirected = false;
const hits: string[] = [];
const network: Record<string, () => Response> = {};

function fakeFetch(input: unknown) {
  const url = typeof input === "string" ? new URL(input, ORIGIN).href : (input as { url: string }).url;
  hits.push(url);
  if (!online) return Promise.reject(new TypeError("Failed to fetch"));
  const pathname = new URL(url).pathname;
  const make = network[pathname];
  const response = make ? make() : new Response("not found", { status: 404 });
  if (redirected) Object.defineProperty(response, "redirected", { value: true });
  return Promise.resolve(response);
}

/* ── Load the worker ───────────────────────────────────────────────────── */

const listeners: Record<string, (event: unknown) => void> = {};
const caches = new FakeCaches();
const sandbox: Record<string, unknown> = {
  self: {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  },
  caches,
  fetch: fakeFetch,
  Response,
  Request,
  Headers,
  URL,
  Promise,
  setTimeout,
  clearTimeout,
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8"), sandbox);

/** Fires a fetch event; resolves with the response, or null when the worker declined to handle it. */
async function request(
  pathAndQuery: string,
  opts: { method?: string; navigate?: boolean; headers?: Record<string, string> } = {},
) {
  let handled: Promise<Response> | null = null;
  const background: Promise<unknown>[] = [];
  listeners.fetch({
    waitUntil: (p: Promise<unknown>) => background.push(p),
    request: {
      url: ORIGIN + pathAndQuery,
      method: opts.method ?? "GET",
      mode: opts.navigate ? "navigate" : "cors",
      headers: new Headers(opts.headers ?? (opts.navigate ? { accept: "text/html" } : {})),
    },
    respondWith: (p: Promise<Response>) => {
      handled = p;
    },
  });
  const response = handled ? await handled : null;
  // The browser keeps the worker alive for waitUntil work; do the same.
  await Promise.all(background);
  return response;
}

async function main() {
  const waited: Promise<unknown>[] = [];
  const lifecycle = (type: string, data?: unknown) =>
    listeners[type]({ data, waitUntil: (p: Promise<unknown>) => waited.push(p) });

  lifecycle("install");
  await Promise.all(waited.splice(0));

  console.log("\nInstall");
  check("the offline page is saved up front", Boolean(await caches.match("/offline.html")));

  console.log("\nApp code (/_next/static)");
  network["/_next/static/chunks/a.js"] = () => new Response("code-a");
  const first = await request("/_next/static/chunks/a.js");
  check("fetched and saved on first use", (await first!.text()) === "code-a");
  online = false;
  const offlineCode = await request("/_next/static/chunks/a.js");
  check("served from the saved copy offline", (await offlineCode!.text()) === "code-a");
  hits.length = 0;
  online = true;
  await request("/_next/static/chunks/a.js");
  check("not refetched once saved", hits.length === 0, hits.join());

  console.log("\nData (/api/private)");
  network["/api/private/finance/aggregate"] = () =>
    new Response(JSON.stringify({ transactions: ["fresh"] }), { headers: { "content-type": "application/json" } });
  const live = await request("/api/private/finance/aggregate?startDate=2026-06-01");
  check("online: the live response, and no offline marker", !live!.headers.get("x-offline-copy"));
  online = false;
  const same = await request("/api/private/finance/aggregate?startDate=2026-06-01");
  check("offline: the saved copy for that exact URL", same!.headers.get("x-offline-copy") === "1" && same!.status === 200, `${same!.status} ${same!.headers.get("x-offline-copy")}`);
  const nextDay = await request("/api/private/finance/aggregate?startDate=2026-06-02");
  check("offline, different date range: the latest saved copy of that route",
    nextDay!.headers.get("x-offline-copy") === "1" && (await nextDay!.json()).transactions[0] === "fresh");
  const never = await request("/api/private/insights");
  check("offline, never opened: a clear 503, not a hang", never!.status === 503 && (await never!.json()).error.includes("offline"));
  online = true;
  network["/api/private/budgets"] = () => new Response('{"error":"nope"}', { status: 500 });
  await request("/api/private/budgets");
  online = false;
  const failedBefore = await request("/api/private/budgets");
  check("an error response is never saved as the copy", failedBefore!.status === 503);
  online = true;

  console.log("\nPages");
  network["/finance"] = () => new Response("<html>finance live</html>", { headers: { "content-type": "text/html" } });
  const page = await request("/finance?new=transaction", { navigate: true });
  check("online: the live page", (await page!.text()).includes("live"));
  online = false;
  const savedPage = await request("/finance", { navigate: true });
  check("offline: the saved page, whatever the query", (await savedPage!.text()).includes("live"));
  const unopened = await request("/tax", { navigate: true });
  check("offline, never opened: the offline page", (await unopened!.text()).includes("shell:/offline.html"));
  online = true;
  redirected = true;
  network["/goals"] = () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } });
  await request("/goals", { navigate: true });
  redirected = false;
  online = false;
  const bounced = await request("/goals", { navigate: true });
  check("a redirect (signed out) is never saved as the page", (await bounced!.text()).includes("shell:/offline.html"));
  online = true;
  network["/login"] = () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } });
  await request("/login", { navigate: true });
  online = false;
  const loginOffline = await request("/login", { navigate: true });
  check("pages outside the app are not saved", (await loginOffline!.text()).includes("shell:/offline.html"));
  online = true;

  console.log("\nWhat it leaves alone");
  check("writes", (await request("/api/private/transactions", { method: "POST" })) === null);
  check("auth routes", (await request("/auth/callback?code=x", { navigate: true })) === null);
  check("Next's client-side navigation payloads", (await request("/finance?_rsc=abc", { headers: { RSC: "1" } })) === null);
  check("other origins", await (async () => {
    let handled = false;
    listeners.fetch({
      request: { url: "https://elsewhere.test/x", method: "GET", mode: "cors", headers: new Headers() },
      respondWith: () => (handled = true),
    });
    return !handled;
  })());

  console.log("\nSlow connection");
  network["/dashboard"] = () => new Response("<html>dash</html>", { headers: { "content-type": "text/html" } });
  await request("/dashboard", { navigate: true });
  const realFetch = sandbox.fetch;
  sandbox.fetch = () => new Promise(() => undefined); // never answers
  const started = Date.now();
  const slow = await request("/dashboard", { navigate: true });
  check("a hung request falls back to the saved page within seconds, not forever",
    (await slow!.text()).includes("dash") && Date.now() - started < 6000, `${Date.now() - started}ms`);
  sandbox.fetch = realFetch;

  console.log("\nSign-out and updates");
  lifecycle("message", { type: "CLEAR" });
  await Promise.all(waited.splice(0));
  check("CLEAR deletes every saved copy", (await caches.keys()).length === 0);

  await caches.open("feenance-static-v0");
  await caches.open("unrelated-cache");
  lifecycle("activate");
  await Promise.all(waited.splice(0));
  const left = await caches.keys();
  check("a new version removes the old version's caches and no one else's",
    !left.includes("feenance-static-v0") && left.includes("unrelated-cache"), left.join());

  console.log(failures === 0 ? "\nAll service worker checks passed.\n" : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
