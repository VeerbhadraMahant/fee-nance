import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { getNextDate } from "@/lib/recurrence";
import { Transaction } from "@/models/Transaction";

export async function POST() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const now = new Date();
    const userObjectId = toObjectId(userId);

    const recurringTransactions = await Transaction.find({
      userId: userObjectId,
      "recurring.enabled": true,
      "recurring.nextRunAt": { $lte: now },
      "recurring.frequency": { $in: ["monthly", "yearly"] },
    });

    const generated: Array<{ sourceId: string; newTransactionId: string }> = [];

    // A rule can be overdue by more than one period (e.g. the user hasn't
    // opened the app in months), so catch up every due occurrence here rather
    // than just the next one — matches projectOccurrences' cap so a malformed
    // rule can't spin forever.
    const MAX_OCCURRENCES_PER_RULE = 240;

    for (const source of recurringTransactions) {
      const frequency = source.recurring.frequency as "monthly" | "yearly";
      let runAt = source.recurring.nextRunAt ?? now;
      let occurrences = 0;

      while (runAt.getTime() <= now.getTime() && occurrences < MAX_OCCURRENCES_PER_RULE) {
        const clone = await Transaction.create({
          userId: source.userId,
          type: source.type,
          title: source.title,
          notes: source.notes,
          amount: source.amount,
          currency: source.currency,
          categoryId: source.categoryId,
          transactionDate: runAt,
          recurring: {
            enabled: false,
          },
        });

        generated.push({
          sourceId: source._id.toString(),
          newTransactionId: clone._id.toString(),
        });

        runAt = getNextDate(runAt, frequency);
        occurrences += 1;
      }

      source.recurring.nextRunAt = runAt;
      await source.save();
    }

    return Response.json({
      generatedCount: generated.length,
      generated,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to generate recurring transactions", 500);
  }
}
