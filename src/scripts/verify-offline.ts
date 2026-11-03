/**
 * Exercises the offline client (src/lib/offline/client.ts) end to end without
 * a browser: a stubbed window, a fake IndexedDB, and a network that can be
 * switched off or made to answer with any status.
 *
 *   npm run verify:offline
 *
 * It checks what a person relies on: that a write made with no connection is
 * kept and shown, that it's sent once when the connection returns, that a
 * device with nothing to send sends nothing, and that nothing is silently lost.
 */

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

/* ── A browser-shaped environment ──────────────────────────────────────── */

const ORIGIN = "https://app.test";

const win = new EventTarget() as EventTarget & Record<string, unknown>;
win.location = { href: `${ORIGIN}/finance`, origin: ORIGIN };

const store = new Map<string, Record<string, unknown>>();
function fakeIndexedDB() {
  const done = (tx: { oncomplete?: () => void }) => setTimeout(() => tx.oncomplete?.(), 0);
  const db = {
    createObjectStore() {},
    transaction() {
      const tx: { oncomplete?: () => void; objectStore?: () => unknown } = {};
      tx.objectStore = () => ({
        getAll() {
          done(tx);
          return { result: [...store.values()].map((v) => structuredClone(v)) };
        },
        put(value: { id: string }) {
          store.set(value.id, structuredClone(value) as Record<string, unknown>);
          done(tx);
          return { result: value.id };
        },
        delete(id: string) {
          store.delete(id);
          done(tx);
          return { result: undefined };
        },
      });
      return tx;
    },
  };
  return {
    open() {
      const request: { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void } = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

const local = new Map<string, string>();
const navigatorStub = { onLine: true } as { onLine: boolean };

Object.assign(globalThis, {
  window: win,
  // sonner (the toast library) injects its stylesheet when imported.
  document: Object.assign(new EventTarget(), {
    visibilityState: "visible",
    head: { appendChild() {} },
    getElementsByTagName: () => [{ appendChild() {} }],
    createElement: () => ({ appendChild() {} }),
    createTextNode: () => ({}),
  }),
  localStorage: {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
  },
  indexedDB: fakeIndexedDB(),
});
Object.defineProperty(globalThis, "navigator", { value: navigatorStub, configurable: true });

/** The network. */
interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
}
const calls: Call[] = [];
let networkUp = true;
let respond: (call: Call) => { status: number; body?: unknown } = () => ({ status: 201, body: {} });

win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const call: Call = {
    url: String(input),
    method: (init?.method ?? "GET").toUpperCase(),
    body: typeof init?.body === "string" ? init.body : null,
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
  };
  calls.push(call);
  if (!networkUp) throw new TypeError("Failed to fetch");
  const { status, body } = respond(call);
  return new Response(JSON.stringify(body ?? {}), { status, headers: { "content-type": "application/json" } });
};

const post = (path: string, body: unknown) =>
  (win.fetch as typeof fetch)(`${ORIGIN}${path}`, { method: "POST", body: JSON.stringify(body) });

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const client = await import("../lib/offline/client");
  const T = "11111111-1111-4111-8111-111111111111";
  const G = "22222222-2222-4222-8222-222222222222";
  const txn = { type: "expense", title: "Chai", amount: 20, transactionDate: "2026-06-12T00:00:00.000Z" };

  client.startOffline("user-a");
  await tick();

  console.log("\nOnline");
  respond = () => ({ status: 201, body: { transaction: {} } });
  const online = await post("/api/private/transactions", txn);
  const sent = JSON.parse(calls.at(-1)!.body!);
  check("a write goes straight through", online.status === 201 && calls.length === 1);
  check("and carries the id it will keep, so a retry can't double it", /^[0-9a-f-]{36}$/.test(sent.id));
  check("nothing is queued", store.size === 0);

  console.log("\nOffline");
  calls.length = 0;
  navigatorStub.onLine = false;
  networkUp = false;
  const queued = await post("/api/private/transactions", txn);
  check("a write with no connection is accepted (202) without touching the network",
    queued.status === 202 && queued.headers.get("x-queued") === "1" && calls.length === 0);
  check("and is stored on the device", store.size === 1);
  await tick();
  check("the UI is told it's waiting", client.hasPendingChanges());

  const unsupported = await (win.fetch as typeof fetch)(`${ORIGIN}/api/private/budgets`, {
    method: "POST", body: "{}",
  }).catch((e: unknown) => e);
  check("a change that can't be queued is attempted, and fails visibly",
    unsupported instanceof Error && calls.at(-1)?.url.endsWith("/budgets") === true);
  const leaving = await (win.fetch as typeof fetch)(`${ORIGIN}/api/private/groups/${G}`, { method: "DELETE" }).catch((e: unknown) => e);
  check("leaving a group offline is not promised", leaving instanceof Error);
  check("neither was stored", store.size === 1);
  networkUp = true;

  console.log("\nShown before it syncs");
  respond = () => ({ status: 200, body: { categories: [], budgets: [], transactions: [] } });
  const view = await (win.fetch as typeof fetch)(`${ORIGIN}/api/private/finance/aggregate?startDate=2026-06-01&endDate=2026-06-30`);
  const listed = (await view.json()) as { transactions: Array<{ title: string; pending?: boolean }> };
  check("the offline entry appears in the list, marked pending",
    listed.transactions.length === 1 && listed.transactions[0].title === "Chai" && listed.transactions[0].pending === true);

  console.log("\nBack online");
  calls.length = 0;
  navigatorStub.onLine = true;
  respond = () => ({ status: 201, body: {} });
  let synced = 0;
  win.addEventListener("feenance:synced", () => (synced += 1));
  await client.syncNow();
  const replay = calls.filter((c) => c.method === "POST");
  check("the queued write is sent once", replay.length === 1 && replay[0].url === "/api/private/transactions");
  check("with the same body it was made with", JSON.parse(replay[0].body!).title === "Chai");
  check("the queue empties and screens are told to refetch", store.size === 0 && synced >= 1);

  calls.length = 0;
  await client.syncNow();
  check("with nothing waiting, a sync makes no request at all", calls.length === 0);

  console.log("\nA flaky network");
  networkUp = false;
  const flaky = await post("/api/private/transactions", { ...txn, title: "Bus" });
  check("online by the browser's account but unreachable: queued, not lost", flaky.status === 202 && store.size === 1);
  await client.syncNow();
  check("a failed sync keeps the change", store.size === 1);
  networkUp = true;
  respond = () => ({ status: 503 });
  await client.syncNow();
  check("a server error keeps it too", store.size === 1);
  respond = () => ({ status: 201 });
  await client.syncNow();
  check("and the next success clears it", store.size === 0);

  console.log("\nRejected on replay");
  navigatorStub.onLine = false;
  await post(`/api/private/groups/${G}/expenses`, { title: "Dinner", amount: 100, splitType: "equal", paidBy: [] });
  const expense = [...store.values()][0] as { body: string };
  check("a group expense gets a client key for safe replay", /^exp-/.test(JSON.parse(expense.body).clientKey));
  navigatorStub.onLine = true;
  respond = () => ({ status: 422, body: { error: "Payer amounts add up to 0" } });
  await client.syncNow();
  const failed = [...store.values()][0] as { status: string; error: string };
  check("a change the server rejects is kept, marked, with the reason",
    failed.status === "failed" && failed.error.includes("Payer"), JSON.stringify(failed));
  calls.length = 0;
  await client.syncNow();
  check("and isn't retried behind the user's back", calls.length === 0);
  await client.discardItem([...store.keys()][0]);
  check("it can be discarded", store.size === 0);

  console.log("\nEdits to a change that hasn't synced");
  navigatorStub.onLine = false;
  respond = () => ({ status: 200, body: { categories: [], budgets: [], transactions: [] } });
  await post("/api/private/transactions", { ...txn, id: T, title: "Lunch" });
  await (win.fetch as typeof fetch)(`${ORIGIN}/api/private/transactions/${T}`, {
    method: "PATCH", body: JSON.stringify({ amount: 99 }),
  });
  const after = await (await (win.fetch as typeof fetch)(`${ORIGIN}/api/private/finance/aggregate`)).json() as {
    transactions: Array<{ _id: string; amount: number }>;
  };
  check("an offline edit of an offline entry shows the new amount",
    after.transactions.find((t) => t._id === T)?.amount === 99);
  navigatorStub.onLine = true;
  calls.length = 0;
  respond = () => ({ status: 200 });
  await client.syncNow();
  check("replayed in order: create, then edit",
    calls.map((c) => c.method).join() === "POST,PATCH" && calls[1].url.endsWith(T), calls.map((c) => c.method).join());

  console.log("\nAnother account on the same device");
  navigatorStub.onLine = false;
  await post("/api/private/transactions", { ...txn, title: "A's change" });
  navigatorStub.onLine = true;
  client.startOffline("user-b");
  await tick();
  calls.length = 0;
  respond = () => ({ status: 201 });
  await client.syncNow();
  check("one account's waiting changes are never sent as another", calls.length === 0 && store.size === 1);
  client.startOffline("user-a");
  await tick(50);
  check("they sync when the right account is back", store.size === 0 && calls.length >= 1);

  console.log(failures === 0 ? "\nAll offline client checks passed.\n" : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
