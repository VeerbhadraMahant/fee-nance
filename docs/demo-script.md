# Demo script

A walkthrough of about 15 minutes for a demo or viva.

## Before the demo

The quickest way to fill an account is in the app: sign in, choose "Add sample data, then tour" in the welcome dialog (or Profile → Getting started). The script below seeds a richer year, including a group, from the command line.

```bash
npm install
npm run dev                              # http://localhost:3000
```

1. Sign in once with your Google account so the profile exists.
2. Fill it with a year of demo data:

   ```bash
   npm run seed:demo -- you@gmail.com            # add --reset to wipe and reseed
   ```

   This creates salary, rent, groceries, subscriptions, a deliberate duplicate Swiggy charge, three budgets, three goals, and a "Hostel Squad" group shared with two demo friends (`aditi.rao@feenance.demo`, `karan.verma@feenance.demo`, who cannot sign in).
3. Set `GEMINI_API_KEY` in `.env.local` if you will show the copilot.

## 1. Sign-in and protection (1 min)

1. Open `/dashboard` while signed out: you are sent to `/login`.
2. Sign in with Google. A `profiles` row is created by a database trigger on first sign-in.

## 2. Personal finance (3 min)

1. `/dashboard`: balance, trends, category breakdown, health score.
2. `/finance`: add an expense ("Coffee", ₹180), edit it, delete it.
3. Budgets tab: show spend against the Food and Shopping budgets.
4. Point out the recurring rules (salary, rent) and generate due entries.

## 3. Groups and splits (4 min)

1. `/groups` → Hostel Squad: members, expenses, balances, suggested settlements.
2. Add an **itemized** expense: a pizza shared by two, a dessert for one, and an 18% GST line marked proportional. Show how GST follows what each person ordered.
3. Try a custom split whose amounts do not add up: the form, the route and the SQL function all reject it.
4. Record a settlement and watch the balances update.

## 4. Insights and planning (3 min)

1. `/insights`: the duplicate Swiggy charge, outliers such as the new phone, category drift and the 90-day forecast.
2. `/tax`: old versus new regime, with deductions (ELSS SIP, health insurance) pre-filled from transaction titles.
3. `/goals`: projections against the real monthly surplus, and the what-if slider.
4. `/report`: the monthly statement, and print to PDF.

## 5. Copilot (2 min)

Ask "How am I doing this month?" and "Which subscriptions overlap?" Point out the tool steps it lists: every answer comes from read-only queries scoped by row-level security.

## 6. Engineering (2 min)

1. Row-level security: `supabase/migrations/20261008000001_schema.sql`, and the three-layer model in [`architecture.md`](architecture.md).
2. Atomic group writes: `create_group_expense` in the functions migration.
3. Run the checks:

   ```bash
   npm run verify:calc
   npm run verify:db
   ```

4. Schema and ER diagram: [`database.md`](database.md). DBMS coursework from the MongoDB period: [`dbms/`](dbms/).
