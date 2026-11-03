/**
 * Made-up activity for the first-run tour: three months of a salaried person's
 * ledger, two budgets and two goals. Pure, so it can be checked without a
 * database. Every row is tagged `is_demo` by the caller so it can be removed
 * again without touching anything the person entered.
 *
 * Deliberately includes the things the Insights page looks for: a double
 * charge, a few subscriptions with no recurring rule, and one large purchase.
 */

export interface SampleTransaction {
  type: "income" | "expense";
  title: string;
  amount: number;
  /** Name of a system category, or null for uncategorised. */
  category: string | null;
  transaction_date: string;
}

export interface SampleBudget {
  name: string;
  amount: number;
  category: string | null;
  period_start: string;
  period_end: string;
}

export interface SampleGoal {
  name: string;
  theme: "emergency" | "travel" | "gadget";
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
}

export function buildSampleData(now: Date) {
  const at = (monthOffset: number, day: number, hour = 12) =>
    new Date(now.getFullYear(), now.getMonth() + monthOffset, day, hour).toISOString();
  const daysAgo = (days: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 13).toISOString();

  const transactions: SampleTransaction[] = [];
  const add = (t: SampleTransaction) => {
    // Nothing dated in the future: it would be waiting for a date that hasn't happened.
    if (new Date(t.transaction_date).getTime() <= now.getTime()) transactions.push(t);
  };

  for (let m = -3; m <= 0; m += 1) {
    const i = m + 3;
    add({ type: "income", title: "Monthly salary", amount: 85000, category: "Salary", transaction_date: at(m, 1) });
    add({ type: "expense", title: "Apartment rent", amount: 22000, category: "Rent", transaction_date: at(m, 3) });
    add({ type: "expense", title: "Electricity and internet", amount: 2400 + (i % 3) * 190, category: "Utilities", transaction_date: at(m, 8) });
    add({ type: "expense", title: "ELSS SIP", amount: 5000, category: null, transaction_date: at(m, 5) });
    add({ type: "expense", title: "Netflix", amount: 649, category: null, transaction_date: at(m, 12) });
    add({ type: "expense", title: "Prime Video", amount: 299, category: null, transaction_date: at(m, 13) });
    add({ type: "expense", title: "Spotify", amount: 119, category: null, transaction_date: at(m, 16) });
    for (let w = 0; w < 4; w += 1) {
      add({ type: "expense", title: "Groceries - BigBasket", amount: 1500 + ((i + w) % 5) * 130, category: "Food", transaction_date: at(m, 4 + w * 7, 18) });
    }
    add({ type: "expense", title: "Dinner out", amount: 1200 + (i % 3) * 350, category: "Food", transaction_date: at(m, 20, 21) });
    add({ type: "expense", title: "Metro and cabs", amount: 1500 + (i % 2) * 300, category: "Travel", transaction_date: at(m, 22) });
    if (i % 2 === 0) {
      add({ type: "expense", title: "Clothes", amount: 2800 + (i % 4) * 500, category: "Shopping", transaction_date: at(m, 25) });
    }
  }

  add({ type: "income", title: "Freelance design project", amount: 15000, category: "Freelance", transaction_date: at(-2, 18) });
  add({ type: "income", title: "Freelance logo work", amount: 9000, category: "Freelance", transaction_date: daysAgo(9) });
  add({ type: "expense", title: "New phone", amount: 38000, category: "Shopping", transaction_date: daysAgo(45) });
  // A double charge, for the duplicate detector.
  add({ type: "expense", title: "Swiggy order", amount: 486, category: "Food", transaction_date: daysAgo(3) });
  add({ type: "expense", title: "Swiggy order", amount: 486, category: "Food", transaction_date: daysAgo(3) });

  const period_start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const period_end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  const budgets: SampleBudget[] = [
    { name: "Food", amount: 9000, category: "Food", period_start, period_end },
    { name: "Shopping", amount: 5000, category: "Shopping", period_start, period_end },
    { name: "Monthly total", amount: 60000, category: null, period_start, period_end },
  ];

  const goals: SampleGoal[] = [
    { name: "Six-month safety net", theme: "emergency", target_amount: 300000, saved_amount: 120000, target_date: at(14, 1) },
    { name: "Goa trip", theme: "travel", target_amount: 60000, saved_amount: 21000, target_date: null },
  ];

  return { transactions, budgets, goals };
}
