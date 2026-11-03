import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { jsonError } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";
import { buildSampleData } from "@/lib/sample-data";

/**
 * Sample data for the first-run tour. Everything here is scoped to the signed-in
 * user by row-level security; sample rows carry `is_demo` so they can be removed
 * without touching anything the person entered.
 */

async function count(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  table: "transactions" | "budgets" | "goals",
  demoOnly: boolean,
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (demoOnly) query = query.eq("is_demo", true);
  const { count: n, error } = await query;
  return must({ data: n ?? 0, error });
}

/** Whether the account has any data at all, and whether any of it is sample data. */
export async function GET() {
  try {
    const { supabase } = await requireUser();
    const [transactions, demo] = await Promise.all([
      count(supabase, "transactions", false),
      count(supabase, "transactions", true),
    ]);
    return Response.json({ hasData: transactions > 0, hasSampleData: demo > 0 });
  } catch (error) {
    return handleRouteError(error, "Failed to check sample data");
  }
}

/** Adds sample data. Refused when the account already has transactions. */
export async function POST() {
  try {
    const { supabase, userId } = await requireUser();

    if ((await count(supabase, "transactions", false)) > 0) {
      return jsonError("Sample data is only added to an empty account, so it never mixes with your own entries.", 409);
    }

    const system = must(
      await supabase.from("categories").select("id, name").eq("is_system", true),
    ) as Array<{ id: string; name: string }>;
    const categoryId = (name: string | null) => (name ? (system.find((c) => c.name === name)?.id ?? null) : null);

    const sample = buildSampleData(new Date());

    must(
      await supabase.from("transactions").insert(
        sample.transactions.map(({ category, ...t }) => ({
          ...t,
          user_id: userId,
          category_id: categoryId(category),
          is_demo: true,
        })),
      ),
    );
    must(
      await supabase.from("budgets").insert(
        sample.budgets.map(({ category, ...b }) => ({
          ...b,
          user_id: userId,
          cycle: "monthly",
          category_id: categoryId(category),
          is_demo: true,
        })),
      ),
    );
    must(
      await supabase.from("goals").insert(
        sample.goals.map((g) => ({ ...g, user_id: userId, is_demo: true })),
      ),
    );

    await invalidateUsers([userId]);
    return Response.json(
      { added: { transactions: sample.transactions.length, budgets: sample.budgets.length, goals: sample.goals.length } },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error, "Failed to add sample data");
  }
}

/** Removes sample data, and only sample data. */
export async function DELETE() {
  try {
    const { supabase, userId } = await requireUser();
    for (const table of ["transactions", "budgets", "goals"] as const) {
      must(await supabase.from(table).delete().eq("is_demo", true));
    }
    await invalidateUsers([userId]);
    return Response.json({ removed: true });
  } catch (error) {
    return handleRouteError(error, "Failed to remove sample data");
  }
}
