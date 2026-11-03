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
 * Dates are stepped with the same getNextDate the forecast uses, anchored to
 * the rule's own day of month, so a projected occurrence always lands on the
 * date the runner creates and a rule on the 31st stays at month-end.
 *
 * Safe to run repeatedly and concurrently: each occurrence carries
 * `recurring_source_id`, and the unique index on (source, date) turns a
 * second insert of the same occurrence into a no-op. The app shell calls
 * this once per session, so nobody has to remember to.
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
      const ruleDate = new Date(rule.transaction_date);
      const anchorDay = ruleDate.getUTCDate();
      let runAt = new Date(rule.recurring_next_run_at ?? now);
      const dates: Date[] = [];
      while (runAt.getTime() <= now.getTime() && dates.length < MAX_OCCURRENCES_PER_RULE) {
        // The rule row is itself the occurrence on its own date.
        if (runAt.getTime() !== ruleDate.getTime()) dates.push(runAt);
        runAt = getNextDate(runAt, frequency, anchorDay);
      }

      if (dates.length) {
        const inserted = must(
          await supabase
            .from("transactions")
            .upsert(
              dates.map((date) => ({
                user_id: userId,
                type: rule.type,
                title: rule.title,
                notes: rule.notes,
                amount: rule.amount,
                category_id: rule.category_id,
                transaction_date: date.toISOString(),
                recurring_enabled: false,
                recurring_source_id: rule.id,
              })),
              { onConflict: "recurring_source_id,transaction_date", ignoreDuplicates: true },
            )
            .select("id"),
        ) as Array<{ id: string }>;

        for (const row of inserted) {
          generated.push({ sourceId: rule.id, newTransactionId: row.id });
        }
      }

      must(
        await supabase
          .from("transactions")
          .update({ recurring_next_run_at: runAt.toISOString() })
          .eq("id", rule.id),
      );
    }

    if (generated.length) await invalidateUsers([userId]);
    return Response.json({ generatedCount: generated.length, generated });
  } catch (error) {
    return handleRouteError(error, "Failed to generate recurring transactions");
  }
}
