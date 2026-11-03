# Offline mode

Fee-Nance installs to a phone's home screen and keeps working with no connection. Pages you have opened open again, your last-seen data is shown, and the most common changes (logging a purchase, adding a group bill, recording a payment) are saved on the device and sent when the connection returns.

## Installing it

- **Laptop (Chrome or Edge):** open the site and click the install icon at the right of the address bar, or choose **Install app** in the account menu. It then opens in its own window and works offline. Needs the deployed site over HTTPS, or a local production build (`npm run build`, `npm start`) on `localhost`. The offline worker is deliberately off under `npm run dev`.
- **Android (Chrome):** the same, from the menu or the install banner.
- **iPhone and iPad (Safari):** Share, then Add to Home Screen. Safari has no install prompt.
- **Firefox on desktop** cannot install web apps.

## What works with no connection

| | Offline |
|---|---|
| Open the app from the home screen | Yes, on any page you have opened before |
| Read your transactions, budgets, goals, dashboard, groups, balances | Yes, as of the last time each page loaded |
| Add, edit or delete a transaction | **Yes**, saved on the device, shown straight away marked "Waiting to sync" |
| Add a group expense | **Yes**, queued. It does not appear in the group's expense list or balances until it syncs |
| Record a settlement ("Mark paid") | **Yes**, queued |
| Edit or delete a group expense or settlement | No: needs the current version from the server |
| Leave or delete a group | No: leaving needs a settled balance, which only the server can check |
| Budgets, goals, categories, profile changes, CSV import | No: need a connection |
| Copilot, receipt scanning, the tax planner's saved profile | No: need a connection |
| Pay via UPI | Depends on your UPI app, not on Fee-Nance |

An action that needs a connection fails with its normal error message. It is never quietly queued and then rejected later.

The first visit to the app, and the first visit to any page, must be online. The app saves the main pages in the background after sign-in (at most once every 12 hours, skipped when the browser has Data Saver on), but data for a page is only saved once the page has loaded it.

## How a change travels

1. You save a transaction with no connection. The app notices (the browser reports offline, or the request cannot reach the server) and stores the change in the device's IndexedDB queue instead of sending it. The form behaves as though it saved, and a small pill appears: "Offline · 1 waiting to sync".
2. The Transactions list shows the entry immediately, tagged "Waiting to sync", and totals include it. This is a view laid over the saved list; nothing is on the server yet.
3. When the connection returns (the browser's `online` event, the app coming back to the foreground, or a retry timer with backoff up to five minutes) the queue is replayed **in the order the changes were made**.
4. A change that succeeds leaves the queue. Screens refetch, and the tag disappears.

**Nothing is sent when nothing changed.** With an empty queue, a sync makes no request at all.

### Safe to repeat

A replay can reach the server twice: the first answer was lost, or the request timed out after succeeding. So every queueable write carries something the server can recognise:

| Change | How a repeat is harmless |
|---|---|
| New transaction | The app picks the transaction's id. A repeat hits the primary key, and the server's 409 is read as "already saved". |
| New group expense | The app sends a `clientKey`, unique per group and author. `create_group_expense` returns the expense it already wrote. |
| New settlement | The existing idempotency key header; the server returns the original. |
| Edit or delete a transaction | Naturally repeatable. A delete that finds nothing (404) counts as done. |

### When the server says no

A change can be valid when you make it and invalid by the time it syncs: the category was deleted, a group member left, the expense was edited by someone else first. Such a change is **not discarded and not retried in a loop**. It is marked "Couldn't save" in the sync panel with the server's reason, and you can retry or discard it. Later changes to a transaction whose creation failed are marked failed too, rather than sent against something that does not exist.

Network failures, server errors (5xx) and rate limits (429) are different: the change stays waiting and is tried again.

### Signing out and other accounts

- Saved pages and data belong to the signed-in account. Signing out deletes them, and the queue.
- If changes are still waiting, signing out warns that they will be lost.
- If a different account signs in on the same device without signing out first, the previous account's saved copies are cleared, but its waiting changes are kept. They are only ever sent while that account is signed in.
- If the session expires while changes are waiting, they are kept and the pill says "Sign in to sync changes".

## How it is built

| Piece | File | Role |
|---|---|---|
| Service worker | `public/sw.js` | Saves the app's code, pages and last-seen data; serves them with no connection |
| Offline page | `public/offline.html` | Shown for a page never opened on this device |
| Rules | `src/lib/offline/rules.ts` | Which requests may be queued, making them repeatable, reading the server's answer, the sync loop, the list overlay. Pure code |
| Device storage | `src/lib/offline/store.ts` | The IndexedDB queue |
| Client | `src/lib/offline/client.ts` | Intercepts the app's writes, queues, syncs, owns the state the UI reads |
| UI | `src/components/offline/offline-status.tsx` | The pill and the sync panel |

The client intercepts `window.fetch` for same-origin `/api/private` requests. That is one place instead of about 25 call sites, and it guarantees every queueable write is made repeatable the same way, online or off. Reads, and writes that are not on the queueable list, pass through untouched.

### What the service worker does

| Request | Strategy |
|---|---|
| `/_next/static/*` (code, fonts, styles) | Saved copy first. Hashed filenames never change |
| Pages (`/dashboard`, `/finance`, …) | Live page first. If the network fails, or takes more than 4 seconds when a saved copy exists, the saved copy; otherwise the offline page |
| `/api/private/*` GET | Live first (6 seconds when a saved copy exists), else the saved copy. If the exact URL was never saved, the latest copy of that route (so a new day's date range still shows data); otherwise a `503` saying it has not been opened on this device |
| Anything not a GET, `/auth/*`, Next's client-side navigation payloads, other origins | Not handled |

Redirects are never saved (a signed-out visit is bounced to `/login`, which must not become the saved copy of `/dashboard`), and neither are error responses. Cache writes are wrapped in `waitUntil` so the browser cannot stop the worker mid-write.

## Limits to know about

- **Saved data is a snapshot.** Offline you see each page as of when it last loaded, with your own pending transaction changes laid over the Transactions list only. Budgets, the dashboard, analytics and group balances do not include pending changes until they sync.
- **Group expenses made offline are invisible until synced** (they appear in the sync panel). Balances are computed by the server.
- **Safari on iOS** may delete a website's saved data after about a week without use, unless the app is installed to the home screen. Installed apps are exempt. Anything waiting in the queue is at the same risk if the app is left unopened that long without a connection.
- **No background sync.** Replay happens when the app is open (or comes to the foreground) with a connection. The Background Sync API is not used because iOS does not support it. Closing the app with changes waiting leaves them waiting until the next time it is opened.
- **One device.** Changes are on the device that made them until they sync. Two devices editing the same transaction offline is resolved by whichever syncs last.
- **Storage is private to the browser.** Private windows may refuse to store the queue; in that case writes are attempted normally and fail visibly rather than being promised.
- **Data on the device.** Saved pages and data sit in the browser's storage, unencrypted, until sign-out. Do not stay signed in on a shared device.

## How it was checked

| Command | What it covers |
|---|---|
| `npm run verify:calc` | The queue rules and sync loop against a fake server (failures mid-run, rejected changes, lost responses, expired sessions) and the list overlay |
| `npm run verify:sw` | `public/sw.js` run in a sandbox with fake caches and a switchable network: each caching rule, redirects, slow connections, sign-out, version changes |
| `npm run verify:offline` | The client with a stubbed browser, fake IndexedDB and switchable network: queueing, replay order, repeatability, rejected changes, account switching |
| `npm run verify:db` | The server side: replaying an expense or transaction twice writes it once |

**Not tested in a real browser.** These checks prove the logic, not that Chrome or Safari honour it: service worker registration and lifecycle, the install prompt, IndexedDB persistence, iOS eviction. Run the checklist in `manual-qa-checklist.md` ("Offline and installed") on a phone, with the app installed, before relying on it.
