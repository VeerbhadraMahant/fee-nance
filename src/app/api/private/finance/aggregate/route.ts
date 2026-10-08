import { requireUser } from "@/lib/api-auth";
import {
  toBudget,
  toCategory,
  toTransaction,
  type BudgetRow,
  type CategoryRow,
  type TransactionRow,
} from "@/lib/data/mappers";
import { parseDate } from "@/lib/http";
import { handleRouteError, must, selectAll } from "@/lib/route";

/** Everything the Transactions page needs, in one round trip from the browser. */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const { searchParams } = new URL(request.url);
    const startDate = parseDate(searchParams.get("startDate"));
    const endDate = parseDate(searchParams.get("endDate"));

    const transactions = selectAll<TransactionRow>((from, to) => {
      let query = supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .order("id");
      if (startDate) query = query.gte("transaction_date", startDate.toISOString());
      if (endDate) query = query.lte("transaction_date", endDate.toISOString());
      return query.range(from, to);
    });

    // A budget is relevant to the window if its period overlaps it at all.
    let budgets = supabase.from("budgets").select("*").order("period_start", { ascending: false });
    if (endDate) budgets = budgets.lte("period_start", endDate.toISOString());
    if (startDate) budgets = budgets.gte("period_end", startDate.toISOString());

    const [categoryRows, transactionRows, budgetRows] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true })
        .then(must),
      transactions,
      budgets.then(must),
    ]);

    return Response.json({
      categories: (categoryRows as CategoryRow[]).map(toCategory),
      transactions: (transactionRows as TransactionRow[]).map(toTransaction),
      budgets: (budgetRows as BudgetRow[]).map(toBudget),
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load finance workspace");
  }
}
