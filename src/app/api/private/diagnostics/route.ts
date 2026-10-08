import { requireUser } from "@/lib/api-auth";
import { loadGroupExpenses } from "@/lib/data/groups";
import { approxEqual, roundCurrency } from "@/lib/money";
import { handleRouteError, must } from "@/lib/route";

interface Issue {
  severity: "error" | "warning";
  scope: string;
  message: string;
}

/**
 * Read-only correctness check, scoped to the groups the caller belongs to.
 * Verifies the invariants the split/settlement logic is supposed to hold:
 * each expense's shares sum to its total, each expense's payments sum to
 * its total, and each group's net balances sum to zero (money can't leave
 * or enter a group through splitting alone).
 */
export async function GET() {
  try {
    const { supabase } = await requireUser();

    const groups = must(await supabase.from("groups").select("id, name")) as Array<{
      id: string;
      name: string;
    }>;
    const expenses = await loadGroupExpenses(supabase, groups.map((g) => g.id));

    const issues: Issue[] = [];

    for (const group of groups) {
      const netByMember = new Map<string, number>();

      for (const expense of expenses.filter((e) => e.groupId === group.id)) {
        const splitTotal = roundCurrency(expense.splits.reduce((sum, s) => sum + s.shareAmount, 0));
        if (!approxEqual(splitTotal, expense.amount)) {
          issues.push({
            severity: "error",
            scope: group.name,
            message: `"${expense.title}": splits total ${splitTotal} but the expense is ${expense.amount}`,
          });
        }

        const paidTotal = roundCurrency(expense.paidBy.reduce((sum, p) => sum + p.amount, 0));
        if (!approxEqual(paidTotal, expense.amount)) {
          issues.push({
            severity: "error",
            scope: group.name,
            message: `"${expense.title}": payments total ${paidTotal} but the expense is ${expense.amount}`,
          });
        }

        for (const split of expense.splits) {
          netByMember.set(split.userId, roundCurrency((netByMember.get(split.userId) ?? 0) - split.shareAmount));
        }
        for (const payer of expense.paidBy) {
          netByMember.set(payer.userId, roundCurrency((netByMember.get(payer.userId) ?? 0) + payer.amount));
        }
      }

      const groupNet = roundCurrency([...netByMember.values()].reduce((sum, v) => sum + v, 0));
      if (!approxEqual(groupNet, 0)) {
        issues.push({
          severity: "error",
          scope: group.name,
          message: `Net balance across all members is ${groupNet}, expected 0`,
        });
      }
    }

    return Response.json({
      groupsChecked: groups.length,
      expensesChecked: expenses.length,
      issues,
      ok: issues.length === 0,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to run diagnostics");
  }
}
