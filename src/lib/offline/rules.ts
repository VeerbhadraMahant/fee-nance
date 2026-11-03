/**
 * The decisions behind offline mode, with no browser APIs in sight so they can
 * be checked from `npm run verify:calc`: which requests may be queued, how a
 * queued request is made safe to repeat, how the server's answer to a replay
 * is read, and how pending changes are laid over cached data.
 *
 * What may be queued is a deliberate short list. A queued change has to be
 * valid whenever it eventually runs, and has to be harmless if it runs twice.
 * Creating, editing and deleting your own transactions, adding a group expense
 * and recording a settlement all qualify. Leaving a group (needs a settled
 * balance), editing someone else's expense (needs their current version),
 * budgets, goals and profile changes do not, and fail with a plain
 * "needs a connection" instead of being promised and then rejected later.
 */

export type QueueKind = "transaction" | "expense" | "settlement";
export type QueueOp = "create" | "update" | "delete";

export interface QueueItem {
  id: string;
  userId: string;
  /** Replay order. Strictly increasing per device. */
  order: number;
  createdAt: string;
  kind: QueueKind;
  op: QueueOp;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  /** JSON text, or null for DELETE. */
  body: string | null;
  /** Extra request headers, e.g. the settlement idempotency key. */
  headers: Record<string, string>;
  /** The server-side id this item creates or changes, for dependency checks. */
  targetId?: string;
  label: string;
  status: "pending" | "failed";
  attempts: number;
  error?: string;
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export interface Classified {
  kind: QueueKind;
  op: QueueOp;
  /** Transaction id from the path, for updates and deletes. */
  targetId?: string;
}

/** Null means the request is not queueable and is sent as-is. */
export function classify(method: string, pathname: string): Classified | null {
  const m = method.toUpperCase();

  if (m === "POST" && pathname === "/api/private/transactions") return { kind: "transaction", op: "create" };

  const txn = pathname.match(new RegExp(`^/api/private/transactions/(${UUID})$`));
  if (txn && m === "PATCH") return { kind: "transaction", op: "update", targetId: txn[1].toLowerCase() };
  if (txn && m === "DELETE") return { kind: "transaction", op: "delete", targetId: txn[1].toLowerCase() };

  if (m === "POST" && new RegExp(`^/api/private/groups/${UUID}/expenses$`).test(pathname)) {
    return { kind: "expense", op: "create" };
  }
  if (m === "POST" && new RegExp(`^/api/private/groups/${UUID}/settlements$`).test(pathname)) {
    return { kind: "settlement", op: "create" };
  }
  return null;
}

/**
 * Makes a create safe to send twice, online or off: the transaction gets the
 * id it will have for good, the expense a client key, the settlement the
 * idempotency header it already supports. Returns what to send and what to
 * remember about it.
 */
export function makeRepeatable(
  classified: Classified,
  bodyText: string | null,
  headers: Record<string, string>,
  newKey: () => string,
): { body: string | null; headers: Record<string, string>; targetId?: string } {
  if (classified.op !== "create") return { body: bodyText, headers, targetId: classified.targetId };

  let body: Record<string, unknown> = {};
  try {
    body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    return { body: bodyText, headers };
  }

  if (classified.kind === "transaction") {
    const id = typeof body.id === "string" ? body.id.toLowerCase() : newKey();
    return { body: JSON.stringify({ ...body, id }), headers, targetId: id };
  }
  if (classified.kind === "expense") {
    const clientKey = typeof body.clientKey === "string" ? body.clientKey : `exp-${newKey()}`;
    return { body: JSON.stringify({ ...body, clientKey }), headers };
  }
  const hasKey = Object.keys(headers).some((h) => h.toLowerCase() === "x-idempotency-key");
  return { body: bodyText, headers: hasKey ? headers : { ...headers, "x-idempotency-key": `set-${newKey()}` } };
}

const rupees = (n: unknown) =>
  typeof n === "number" ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "";

/** What the pending-changes list shows for an item. */
export function describe(kind: QueueKind, op: QueueOp, bodyText: string | null): string {
  let body: Record<string, unknown> = {};
  try {
    body = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    // fall through with an empty body
  }
  const title = typeof body.title === "string" ? `"${body.title}"` : "";
  if (kind === "transaction") {
    if (op === "create") return `Add ${title} ${rupees(body.amount)}`.replace(/\s+/g, " ").trim();
    if (op === "update") return `Edit ${title || "a transaction"}`.trim();
    return "Delete a transaction";
  }
  if (kind === "expense") return `Add group expense ${title} ${rupees(body.amount)}`.replace(/\s+/g, " ").trim();
  return `Record a ${rupees(body.amount) || ""} payment`.replace(/\s+/g, " ").trim();
}

export type Outcome = "done" | "conflict" | "auth" | "retry";

/** Reads the server's answer to a replayed item. */
export function interpret(item: Pick<QueueItem, "kind" | "op">, status: number): Outcome {
  if (status >= 200 && status < 300) return "done";
  if (status === 401) return "auth";
  // The id is already there: an earlier attempt succeeded and its answer was lost.
  if (status === 409 && item.kind === "transaction" && item.op === "create") return "done";
  // Already gone: the delete has nothing left to do.
  if (status === 404 && item.op === "delete") return "done";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
  return "conflict";
}

export interface SyncDeps {
  /** The signed-in user's pending items. */
  load(): Promise<QueueItem[]>;
  save(item: QueueItem): Promise<void>;
  remove(id: string): Promise<void>;
  /** Sends one item. Throws when the network is down. */
  send(item: QueueItem): Promise<{ status: number; error?: string }>;
}

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
  authRequired: boolean;
  offline: boolean;
}

/**
 * Replays the queue in order, once. Does nothing when it is empty, so a device
 * with no changes never makes a request. Stops at the first sign the network
 * or session is the problem (a thrown error, a 5xx, a 401) and leaves the rest
 * queued; a request the server rejects as invalid is marked failed and the
 * rest carry on, except changes to a transaction that itself failed to create.
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const items = (await deps.load()).filter((item) => item.status === "pending").sort((a, b) => a.order - b.order);
  const result: SyncResult = { synced: 0, failed: 0, remaining: items.length, authRequired: false, offline: false };
  if (!items.length) return result;

  const brokenTargets = new Set<string>();

  for (const item of items) {
    if (item.targetId && item.op !== "create" && brokenTargets.has(item.targetId)) {
      await deps.save({
        ...item,
        status: "failed",
        error: "It depended on a change that couldn't be saved.",
      });
      result.failed += 1;
      result.remaining -= 1;
      continue;
    }

    let response: { status: number; error?: string };
    try {
      response = await deps.send(item);
    } catch {
      result.offline = true;
      break;
    }

    const outcome = interpret(item, response.status);
    if (outcome === "done") {
      await deps.remove(item.id);
      result.synced += 1;
      result.remaining -= 1;
    } else if (outcome === "conflict") {
      if (item.targetId && item.op === "create") brokenTargets.add(item.targetId);
      await deps.save({
        ...item,
        status: "failed",
        attempts: item.attempts + 1,
        error: response.error ?? `The server rejected it (${response.status}).`,
      });
      result.failed += 1;
      result.remaining -= 1;
    } else {
      await deps.save({ ...item, attempts: item.attempts + 1 });
      if (outcome === "auth") result.authRequired = true;
      else result.offline = true;
      break;
    }
  }

  return result;
}

/* ── Showing pending changes before they have synced ───────────────────── */

export interface OverlayTransaction {
  _id: string;
  type: "income" | "expense";
  title: string;
  notes?: string;
  amount: number;
  transactionDate: string;
  categoryId?: string;
  currency: "INR";
  recurring?: { enabled: boolean; frequency?: "monthly" | "yearly" };
  /** Not on the server yet. */
  pending?: boolean;
}

function parse(bodyText: string | null): Record<string, unknown> {
  try {
    return bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Lays the user's pending transaction changes over a transaction list, so an
 * entry made offline shows up straight away, marked as waiting. Pure: returns
 * a new list.
 */
export function overlayTransactions(
  list: OverlayTransaction[],
  items: QueueItem[],
  range: { startDate?: string | null; endDate?: string | null } = {},
): OverlayTransaction[] {
  const start = range.startDate ? Date.parse(range.startDate) : null;
  const end = range.endDate ? Date.parse(range.endDate) : null;
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return (start === null || t >= start) && (end === null || t <= end);
  };

  let next = list.map((t) => ({ ...t }));

  for (const item of items.filter((i) => i.kind === "transaction" && i.status === "pending").sort((a, b) => a.order - b.order)) {
    const body = parse(item.body);

    if (item.op === "create") {
      const date = typeof body.transactionDate === "string" ? body.transactionDate : new Date().toISOString();
      if (!inRange(date) || next.some((t) => t._id === item.targetId)) continue;
      const recurring = body.recurring as OverlayTransaction["recurring"];
      next = [
        {
          _id: item.targetId ?? item.id,
          type: body.type === "income" ? "income" : "expense",
          title: String(body.title ?? ""),
          notes: typeof body.notes === "string" ? body.notes : undefined,
          amount: Number(body.amount) || 0,
          transactionDate: date,
          categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
          currency: "INR",
          recurring: recurring?.enabled ? recurring : undefined,
          pending: true,
        },
        ...next,
      ];
    } else if (item.op === "delete") {
      next = next.filter((t) => t._id !== item.targetId);
    } else {
      next = next.map((t) => {
        if (t._id !== item.targetId) return t;
        const merged: OverlayTransaction = { ...t, pending: true };
        if (body.type === "income" || body.type === "expense") merged.type = body.type;
        if (typeof body.title === "string") merged.title = body.title;
        if (typeof body.notes === "string") merged.notes = body.notes;
        if (typeof body.amount === "number") merged.amount = body.amount;
        if (typeof body.transactionDate === "string") merged.transactionDate = body.transactionDate;
        if ("categoryId" in body) merged.categoryId = typeof body.categoryId === "string" ? body.categoryId : undefined;
        if (body.recurring && typeof body.recurring === "object") {
          const r = body.recurring as { enabled?: boolean; frequency?: "monthly" | "yearly" };
          merged.recurring = r.enabled ? { enabled: true, frequency: r.frequency } : undefined;
        }
        return merged;
      });
    }
  }

  return next.sort((a, b) => Date.parse(b.transactionDate) - Date.parse(a.transactionDate));
}
