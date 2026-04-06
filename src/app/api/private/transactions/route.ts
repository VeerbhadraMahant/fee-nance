import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { parseDate, jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Transaction } from "@/models/Transaction";

const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  title: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(500).optional(),
  amount: z.number().positive(),
  categoryId: z.string().optional(),
  transactionDate: z.string().datetime(),
  recurring: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(["monthly", "yearly"]).optional(),
      nextRunAt: z.string().datetime().optional(),
    })
    .optional(),
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const startDate = parseDate(searchParams.get("startDate"));
    const endDate = parseDate(searchParams.get("endDate"));
    const type = searchParams.get("type");

    const query: {
      userId: ReturnType<typeof toObjectId>;
      transactionDate?: { $gte?: Date; $lte?: Date };
      type?: "income" | "expense";
    } = {
      userId: toObjectId(userId),
    };

    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) {
        query.transactionDate.$gte = startDate;
      }
      if (endDate) {
        query.transactionDate.$lte = endDate;
      }
    }

    if (type === "income" || type === "expense") {
      query.type = type;
    }

    const transactions = await Transaction.find(query).sort({ transactionDate: -1 }).lean();

    const summary = transactions.reduce(
      (acc, txn) => {
        if (txn.type === "income") {
          acc.totalIncome += txn.amount;
        } else {
          acc.totalExpense += txn.amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0 },
    );

    return Response.json({
      transactions,
      summary: {
        ...summary,
        balance: summary.totalIncome - summary.totalExpense,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load transactions", 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = transactionSchema.parse(await request.json());

    if (payload.recurring?.enabled && !payload.recurring.frequency) {
      return jsonError("Recurring frequency is required", 422);
    }

    await connectToDatabase();

    const transaction = await Transaction.create({
      userId: toObjectId(userId),
      type: payload.type,
      title: payload.title,
      notes: payload.notes,
      amount: payload.amount,
      currency: "INR",
      categoryId: payload.categoryId ? toObjectId(payload.categoryId) : undefined,
      transactionDate: new Date(payload.transactionDate),
      recurring: payload.recurring
        ? {
            enabled: payload.recurring.enabled,
            frequency: payload.recurring.frequency,
            nextRunAt: payload.recurring.nextRunAt
              ? new Date(payload.recurring.nextRunAt)
              : undefined,
          }
        : {
            enabled: false,
          },
    });

    return Response.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid transaction input", 422);
    }

    console.error(error);
    return jsonError("Failed to create transaction", 500);
  }
}
