import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { ensureDefaultCategories } from "@/lib/default-categories";
import { parseDate, jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { Transaction } from "@/models/Transaction";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    await connectToDatabase();
    await ensureDefaultCategories();

    const userObjectId = toObjectId(userId);
    const { searchParams } = new URL(request.url);

    const startDate = parseDate(searchParams.get("startDate"));
    const endDate = parseDate(searchParams.get("endDate"));

    const transactionQuery: {
      userId: ReturnType<typeof toObjectId>;
      transactionDate?: { $gte?: Date; $lte?: Date };
    } = {
      userId: userObjectId,
    };

    if (startDate || endDate) {
      transactionQuery.transactionDate = {};
      if (startDate) {
        transactionQuery.transactionDate.$gte = startDate;
      }
      if (endDate) {
        transactionQuery.transactionDate.$lte = endDate;
      }
    }

    const budgetQuery: {
      userId: ReturnType<typeof toObjectId>;
      periodStart?: { $lte: Date };
      periodEnd?: { $gte: Date };
    } = {
      userId: userObjectId,
    };

    // A budget is relevant to the selected window if its period overlaps it
    // at all — not just when it happens to start inside the window.
    if (endDate) {
      budgetQuery.periodStart = { $lte: endDate };
    }
    if (startDate) {
      budgetQuery.periodEnd = { $gte: startDate };
    }

    const [categories, transactions, budgets] = await Promise.all([
      Category.find({
        $or: [{ isSystem: true }, { userId: userObjectId }],
      })
        .sort({ isSystem: -1, name: 1 })
        .lean(),
      Transaction.find(transactionQuery).sort({ transactionDate: -1 }).lean(),
      Budget.find(budgetQuery).sort({ periodStart: -1 }).lean(),
    ]);

    return Response.json({
      categories,
      transactions,
      budgets,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to load finance workspace", 500);
  }
}
