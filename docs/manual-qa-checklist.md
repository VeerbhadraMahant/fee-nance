# Manual QA checklist

Run before a release or a demo, after:

```bash
npm run lint && npx tsc --noEmit && npm run verify:calc && npm run verify:db
npm run dev
npm run seed:demo -- you@gmail.com --reset
```

## 1. Auth

- [ ] Signed out, `/dashboard` redirects to `/login?next=/dashboard`
- [ ] Google sign-in returns to the page in `next`
- [ ] First sign-in creates a profile with the Google name and avatar
- [ ] A cancelled or failed Google sign-in shows a readable error on `/login`
- [ ] Sign out ends the session; the back button does not show private data
- [ ] `/api/private/me` without a session returns `401`

## 2. Personal finance

- [ ] Create, edit and delete an income and an expense
- [ ] Date range filter changes both the list and the totals
- [ ] Create, edit and delete a custom category; deleting one leaves its transactions uncategorised
- [ ] System categories cannot be edited or deleted
- [ ] Create a monthly budget for one category and an overall budget; spend matches the ledger
- [ ] Create a recurring rule dated the 31st; after it falls due, entries land on month-end (28/29 Feb, 30 Apr), not the 3rd
- [ ] Open the app in two tabs at once after a rule falls due: each occurrence exists once
- [ ] Budgets show "x% of the period gone" and warn when on pace to overspend
- [ ] Import a bank CSV: the preview flags rows already in the ledger; importing the same file again adds nothing
- [ ] A CSV with debit/credit columns, one with a signed amount column, and one with `Dr`/`Cr` suffixes all import with the right income/expense
- [ ] CSV export opens correctly in a spreadsheet

## 3. Groups

- [ ] Create a group; the invite code is shown
- [ ] Join with that code from a second account; a wrong code returns "Invalid invite code"
- [ ] Add expenses with each split type: equal (with only some members ticked), custom, percentage, itemized
- [ ] Give an expense a category; each member's share appears in their own budget for that category, and turning off "Count my share of group expenses" in Profile removes it
- [ ] Edit an expense as its author and as the group owner; a third member sees no edit button, and the API refuses them
- [ ] Delete an expense and a settlement; balances come back as before
- [ ] Itemized: a proportional tax line follows each person's subtotal; the shares sum exactly to the total
- [ ] Several payers on one expense are accepted when they sum to the total and rejected otherwise
- [ ] Balances sum to zero across members
- [ ] Recording a settlement updates balances; repeating the request with the same idempotency key does not create a second one
- [ ] A non-member opening the group URL gets "Group not found"
- [ ] A member who owes or is owed is refused when leaving, with the amount in the message; after settling they can leave
- [ ] The owner leaving hands the group to another member; "Delete group" removes it for everyone
- [ ] With a UPI ID saved in Profile, the person who owes you sees "Pay via UPI" (on a phone, it opens their UPI app with the amount)
- [ ] A member who is neither payer nor payee can't record a settlement between two others

## 4. Insights and planning

- [ ] Insights shows the seeded duplicate charge and at least one outlier
- [ ] The forecast renders 90 days with a widening band
- [ ] The tax planner pre-fills deductions and recommends a regime
- [ ] Goal projections change with the what-if slider
- [ ] The monthly report prints on one page

## 5. Copilot

- [ ] Without `GEMINI_API_KEY`, the page says the copilot is unavailable
- [ ] With it, a broad question lists tool steps and quotes real figures
- [ ] "Add ₹450 for groceries yesterday" produces a draft card; nothing is saved until "Add it" is pressed, and discarding it saves nothing
- [ ] "Who owes me money?" quotes real group balances
- [ ] Asking more than 30 questions in an hour returns a polite rate-limit message

## 6. Security

- [ ] Another user's transaction, budget, goal or group id returns `404`
- [ ] A malformed id returns `404`, not `500`
- [ ] Invalid payloads return `422` with a readable message
- [ ] No secret appears in the browser bundle (search the built JS for `SERVICE_ROLE` and `GEMINI`)

## 7. Offline and installed

Do these on a phone with the app installed to the home screen (Add to Home Screen / Install), after signing in and opening each main page once while online.

- [ ] The installed app opens full-screen, with the F icon, and the status bar and notch don't cover the header or the bottom nav
- [ ] Long-press the icon: shortcuts for Add expense, Groups and Copilot appear and work
- [ ] Switch to airplane mode and reopen the app: Dashboard, Transactions, Groups open with their last data
- [ ] A page you never opened shows the "You're offline" page, not a browser error
- [ ] Offline, add a transaction: it appears at the top of the list marked "Waiting to sync", totals include it, and the pill reads "Offline · 1 waiting to sync"
- [ ] Offline, edit that entry and delete another: both show correctly
- [ ] Offline, add a group expense and record a payment: the pill counts them; the sync panel lists them
- [ ] Offline, try to leave a group or change a budget: it fails with a clear message and nothing is queued
- [ ] Turn the connection back on: the pill shows "Syncing…", then everything is saved, the tags disappear and a "Synced N changes" message appears
- [ ] Check the server (Supabase table editor): each change exists exactly once, even if you toggled airplane mode on and off during the sync
- [ ] With nothing waiting, going online and offline makes no write requests (watch the network tab or the Supabase logs)
- [ ] Make an offline change that will be rejected (add a group expense, then have someone else remove you from the group, or edit a deleted transaction): it shows "Couldn't save" with a reason, and Retry/Discard work
- [ ] Offline with changes waiting, choose Sign out: it warns that changes will be lost
- [ ] After signing out, airplane mode and reopening shows no previous account's pages or data
- [ ] On iOS, close the installed app for a few days with changes waiting and no connection: note whether they survive (see the Safari limit in `offline.md`)

## 8. Mobile layout

- [ ] Every page at 360px wide: no horizontal scroll, nothing under the bottom nav
- [ ] Tapping a text field does not zoom the page on iOS
- [ ] Icon buttons (edit, delete, menus) are comfortable to hit with a thumb
- [ ] Dialogs and the keyboard: the focused field stays visible and the Save button is reachable
- [ ] Landscape on a notched phone: content isn't hidden behind the notch

## 9. UI

- [ ] Every page works at 360px width with no horizontal scroll
- [ ] Light and dark themes are both readable, including selects and charts
- [ ] Ctrl/⌘+K opens the command palette
- [ ] Error boundaries show a retry action
