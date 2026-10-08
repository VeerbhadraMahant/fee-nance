/**
 * Recurring charges the ledger shows but no recurring rule covers.
 *
 * Kept apart from the main insights route: that one is a set of MongoDB
 * window pipelines, while this needs the payee normalisation and frequency
 * bucketing in `lib/recurring-detect.ts`, which don't translate cleanly into
 * aggregation stages.
 */

import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { detectRecurring, normalizePayee } from "@/lib/recurring-detect";
import { Category } from "@/models/Category";
import { Transaction } from "@/models/Transaction";

/** Long enough to see three quarterly charges; yearly ones need history. */
const LOOKBACK_DAYS = 400;

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const userObjectId = toObjectId(userId);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    const [expenses, rules] = await Promise.all([
      Transaction.find({
        userId: userObjectId,
        type: "expense",
        transactionDate: { $gte: since },
      })
        .select("_id title amount categoryId transactionDate")
        .lean(),
      Transaction.find({ userId: userObjectId, type: "expense", "recurring.enabled": true })
        .select("title")
        .lean(),
    ]);

    const categoryIds = [...new Set(expenses.map((e) => e.categoryId?.toString()).filter(Boolean))];
    const categories = await Category.find({ _id: { $in: categoryIds } })
      .select("_id name")
      .lean();
    const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name as string]));

    // A payee that already has a rule is accounted for in the forecast.
    const covered = new Set(rules.map((rule) => normalizePayee(rule.title as string)));

    const detected = detectRecurring(
      expenses.map((e) => ({
        id: e._id.toString(),
        title: e.title as string,
        amount: e.amount as number,
        date: new Date(e.transactionDate as Date),
        categoryName: categoryName.get(e.categoryId?.toString() ?? "") ?? "Uncategorized",
      })),
    ).filter((item) => !covered.has(item.key));

    return Response.json({
      items: detected,
      monthlyTotal: roundCurrency(detected.reduce((sum, item) => sum + item.monthlyCost, 0)),
      overlapCount: detected.filter((item) => item.overlapGroup).length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Recurring detection API error", error);
    return jsonError("Failed to detect recurring charges", 500);
  }
}
