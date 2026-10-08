import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { type TransactionRow } from "@/lib/data/mappers";
import { getNextDate, type RecurringFrequency } from "@/lib/recurrence";
import { handleRouteError, must } from "@/lib/route";

/** Matches projectOccurrences' cap so a malformed rule can't spin forever. */
const MAX_OCCURRENCES_PER_RULE = 240;

/**
 * Materialises every due occurrence of the caller's recurring rules.
 *
 * Dates are stepped with the same getNextDate the forecast uses, so a
 * projected occurrence always lands on the date the runner creates. A rule
 * overdue by several periods catches up all of them. Each rule's occurrences
 * are inserted in one statement before its nextRunAt advances, so a failure
 * part-way leaves the rule due and a re-run creates what's missing.
 */
export async function POST() {
  try {
    const { supabase, userId } = await requireUser();
    const now = new Date();

    const rules = must(
      await supabase
        .from("transactions")
        .select("*")
        .eq("recurring_enabled", true)
        .lte("recurring_next_run_at", now.toISOString())
        .in("recurring_frequency", ["monthly", "yearly"]),
    ) as TransactionRow[];

    const generated: Array<{ sourceId: string; newTransactionId: string }> = [];

    for (const rule of rules) {
      const frequency = rule.recurring_frequency as RecurringFrequency;
      let runAt = new Date(rule.recurring_next_run_at ?? now);
      const dates: Date[] = [];
      while (runAt.getTime() <= now.getTime() && dates.length < MAX_OCCURRENCES_PER_RULE) {
        dates.push(runAt);
        runAt = getNextDate(runAt, frequency);
      }
      if (!dates.length) continue;

      const inserted = must(
        await supabase
          .from("transactions")
          .insert(
            dates.map((date) => ({
              user_id: userId,
              type: rule.type,
              title: rule.title,
              notes: rule.notes,
              amount: rule.amount,
              category_id: rule.category_id,
              transaction_date: date.toISOString(),
              recurring_enabled: false,
            })),
          )
          .select("id"),
      ) as Array<{ id: string }>;

      must(
        await supabase
          .from("transactions")
          .update({ recurring_next_run_at: runAt.toISOString() })
          .eq("id", rule.id),
      );

      for (const row of inserted) {
        generated.push({ sourceId: rule.id, newTransactionId: row.id });
      }
    }

    if (generated.length) await invalidateUsers([userId]);
    return Response.json({ generatedCount: generated.length, generated });
  } catch (error) {
    return handleRouteError(error, "Failed to generate recurring transactions");
  }
}
