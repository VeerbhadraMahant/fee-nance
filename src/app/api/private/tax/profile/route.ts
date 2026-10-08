/**
 * Pre-fill for the tax planner: trailing-year income and deduction hints read
 * from the ledger. The regime calculation itself runs client-side (pure
 * `lib/tax.ts`) so the what-if inputs respond without a round trip.
 */

import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { detectDeductionHints } from "@/lib/tax";
import { Category } from "@/models/Category";
import { Transaction } from "@/models/Transaction";

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const userObjectId = toObjectId(userId);
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    const window = { userId: userObjectId, transactionDate: { $gt: yearAgo, $lte: now } };

    const [incomeRows, expenses, firstTxn] = await Promise.all([
      Transaction.aggregate<{ total: number }>([
        { $match: { ...window, type: "income" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.find({ ...window, type: "expense" })
        .select("title amount categoryId")
        .lean(),
      Transaction.findOne({ userId: userObjectId })
        .sort({ transactionDate: 1 })
        .select("transactionDate")
        .lean(),
    ]);

    const categoryIds = [...new Set(expenses.map((e) => e.categoryId?.toString()).filter(Boolean))];
    const categories = await Category.find({ _id: { $in: categoryIds } })
      .select("_id name")
      .lean();
    const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name as string]));

    const hints = detectDeductionHints(
      expenses.map((e) => ({
        title: e.title as string,
        amount: e.amount as number,
        categoryName: categoryName.get(e.categoryId?.toString() ?? "") ?? null,
      })),
    );

    // With less than a year of history, annualise what is there instead of
    // reporting a part-year as the annual figure.
    const observedIncome = incomeRows[0]?.total ?? 0;
    const firstDate = firstTxn?.transactionDate ? new Date(firstTxn.transactionDate as Date) : null;
    const observedDays = firstDate
      ? Math.min(365, Math.max(1, (now.getTime() - Math.max(firstDate.getTime(), yearAgo.getTime())) / 86_400_000))
      : 365;
    const annualised = observedDays < 330;
    const annualIncome = roundCurrency(annualised ? (observedIncome / observedDays) * 365 : observedIncome);

    return Response.json({
      annualIncome,
      observedIncome: roundCurrency(observedIncome),
      annualised,
      observedDays: Math.round(observedDays),
      hints,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Tax profile API error", error);
    return jsonError("Failed to load tax profile", 500);
  }
}
