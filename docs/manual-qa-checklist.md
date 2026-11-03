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
- [ ] Create a recurring rule, generate due entries, and confirm each date
- [ ] CSV export opens correctly in a spreadsheet

## 3. Groups

- [ ] Create a group; the invite code is shown
- [ ] Join with that code from a second account; a wrong code returns "Invalid invite code"
- [ ] Add expenses with each split type: equal, custom, percentage, itemized
- [ ] Itemized: a proportional tax line follows each person's subtotal; the shares sum exactly to the total
- [ ] Several payers on one expense are accepted when they sum to the total and rejected otherwise
- [ ] Balances sum to zero across members
- [ ] Recording a settlement updates balances; repeating the request with the same idempotency key does not create a second one
- [ ] A non-member opening the group URL gets "Group not found"
- [ ] Member leaves: the group remains for others. Owner deletes: the group disappears for everyone

## 4. Insights and planning

- [ ] Insights shows the seeded duplicate charge and at least one outlier
- [ ] The forecast renders 90 days with a widening band
- [ ] The tax planner pre-fills deductions and recommends a regime
- [ ] Goal projections change with the what-if slider
- [ ] The monthly report prints on one page

## 5. Copilot

- [ ] Without `GEMINI_API_KEY`, the page says the copilot is unavailable
- [ ] With it, a broad question lists tool steps and quotes real figures
- [ ] Asking it to add a transaction gets a refusal that names the right page

## 6. Security

- [ ] Another user's transaction, budget, goal or group id returns `404`
- [ ] A malformed id returns `404`, not `500`
- [ ] Invalid payloads return `422` with a readable message
- [ ] No secret appears in the browser bundle (search the built JS for `SERVICE_ROLE` and `GEMINI`)

## 7. UI

- [ ] Every page works at 360px width with no horizontal scroll
- [ ] Light and dark themes are both readable, including selects and charts
- [ ] Ctrl/⌘+K opens the command palette
- [ ] Error boundaries show a retry action
