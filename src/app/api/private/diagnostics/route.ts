import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { approxEqual, roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Group } from "@/models/Group";
import { GroupExpense } from "@/models/GroupExpense";

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
    const userId = await requireUserId();
    await connectToDatabase();

    const groups = await Group.find({ "members.userId": toObjectId(userId) })
      .select("_id name")
      .lean();

    const issues: Issue[] = [];
    let expensesChecked = 0;
    let groupsChecked = 0;

    for (const group of groups) {
      groupsChecked += 1;
      const expenses = await GroupExpense.find({ groupId: group._id }).lean();

      const netByMember = new Map<string, number>();

      for (const expense of expenses) {
        expensesChecked += 1;

        const splitTotal = roundCurrency(
          expense.splits.reduce((sum: number, s: { shareAmount: number }) => sum + s.shareAmount, 0),
        );
        if (!approxEqual(splitTotal, expense.amount)) {
          issues.push({
            severity: "error",
            scope: group.name,
            message: `"${expense.title}": splits total ${splitTotal} but the expense is ${expense.amount}`,
          });
        }

        const paidTotal = roundCurrency(
          expense.paidBy.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0),
        );
        if (!approxEqual(paidTotal, expense.amount)) {
          issues.push({
            severity: "error",
            scope: group.name,
            message: `"${expense.title}": payments total ${paidTotal} but the expense is ${expense.amount}`,
          });
        }

        for (const split of expense.splits as Array<{ userId: { toString(): string }; shareAmount: number }>) {
          const id = split.userId.toString();
          netByMember.set(id, roundCurrency((netByMember.get(id) ?? 0) - split.shareAmount));
        }
        for (const payer of expense.paidBy as Array<{ userId: { toString(): string }; amount: number }>) {
          const id = payer.userId.toString();
          netByMember.set(id, roundCurrency((netByMember.get(id) ?? 0) + payer.amount));
        }
      }

      const groupNet = roundCurrency(
        Array.from(netByMember.values()).reduce((sum, v) => sum + v, 0),
      );
      if (!approxEqual(groupNet, 0)) {
        issues.push({
          severity: "error",
          scope: group.name,
          message: `Net balance across all members is ${groupNet}, expected 0`,
        });
      }
    }

    return Response.json({
      groupsChecked,
      expensesChecked,
      issues,
      ok: issues.length === 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to run diagnostics", 500);
  }
}
