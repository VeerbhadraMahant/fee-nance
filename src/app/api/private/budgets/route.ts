import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { parseDate, jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Budget } from "@/models/Budget";

const budgetSchema = z.object({
  name: z.string().trim().min(2).max(100),
  amount: z.number().positive(),
  cycle: z.enum(["monthly", "quarterly", "yearly"]),
  categoryId: z.string().optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const startDate = parseDate(searchParams.get("startDate"));
    const endDate = parseDate(searchParams.get("endDate"));

    const query: {
      userId: ReturnType<typeof toObjectId>;
      periodStart?: { $gte?: Date; $lte?: Date };
    } = {
      userId: toObjectId(userId),
    };

    if (startDate || endDate) {
      query.periodStart = {};
      if (startDate) {
        query.periodStart.$gte = startDate;
      }
      if (endDate) {
        query.periodStart.$lte = endDate;
      }
    }

    const budgets = await Budget.find(query).sort({ periodStart: -1 }).lean();

    return Response.json({ budgets });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load budgets", 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = budgetSchema.parse(await request.json());

    const periodStart = new Date(payload.periodStart);
    const periodEnd = new Date(payload.periodEnd);

    if (periodEnd <= periodStart) {
      return jsonError("Budget period end must be after period start", 422);
    }

    await connectToDatabase();

    const budget = await Budget.create({
      userId: toObjectId(userId),
      name: payload.name,
      amount: payload.amount,
      currency: "INR",
      cycle: payload.cycle,
      categoryId: payload.categoryId ? toObjectId(payload.categoryId) : undefined,
      periodStart,
      periodEnd,
    });

    return Response.json({ budget }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid budget input", 422);
    }

    console.error(error);
    return jsonError("Failed to create budget", 500);
  }
}
