import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { duplicateKey } from "@/lib/csv-import";
import { type TransactionRow } from "@/lib/data/mappers";
import { handleRouteError, must, selectAll } from "@/lib/route";

const MAX_ROWS = 500;

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: z.string().trim().min(2).max(100),
        amount: z.number().positive(),
        type: z.enum(["income", "expense"]),
      }),
    )
    .min(1)
    .max(MAX_ROWS),
  // Preview: report which rows are already in the ledger, write nothing.
  dryRun: z.boolean().optional(),
});

/**
 * Imports statement rows as transactions, skipping any already in the ledger.
 *
 * A row is a duplicate when an existing transaction has the same day, type,
 * amount and description. Matching is by count, not by "seen before": if the
 * ledger holds one ₹40 chai on the 3rd and the file has two, one is imported;
 * importing the same file twice therefore adds nothing the second time, and
 * two real identical purchases in one file still both arrive the first time.
 */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const { rows, dryRun } = importSchema.parse(await request.json());

    const dates = rows.map((row) => row.date).sort();
    const from = `${dates[0]}T00:00:00.000Z`;
    const to = `${new Date(Date.parse(`${dates[dates.length - 1]}T00:00:00.000Z`) + 86_400_000).toISOString()}`;

    const existing = await selectAll<TransactionRow>((start, end) =>
      supabase
        .from("transactions")
        .select("*")
        .gte("transaction_date", from)
        .lt("transaction_date", to)
        .order("transaction_date")
        .order("id")
        .range(start, end),
    );

    const available = new Map<string, number>();
    for (const txn of existing) {
      const key = duplicateKey({
        date: txn.transaction_date.slice(0, 10),
        type: txn.type,
        amount: Number(txn.amount),
        title: txn.title,
      });
      available.set(key, (available.get(key) ?? 0) + 1);
    }

    const duplicates: number[] = [];
    const fresh: typeof rows = [];
    rows.forEach((row, index) => {
      const key = duplicateKey(row);
      const left = available.get(key) ?? 0;
      if (left > 0) {
        available.set(key, left - 1);
        duplicates.push(index);
      } else {
        fresh.push(row);
      }
    });

    if (dryRun) return Response.json({ duplicates, toImport: fresh.length });

    if (fresh.length) {
      must(
        await supabase.from("transactions").insert(
          fresh.map((row) => ({
            user_id: userId,
            type: row.type,
            title: row.title,
            amount: row.amount,
            transaction_date: `${row.date}T00:00:00.000Z`,
          })),
        ),
      );
      await invalidateUsers([userId]);
    }

    return Response.json({ imported: fresh.length, skippedDuplicates: duplicates.length });
  } catch (error) {
    return handleRouteError(error, "Failed to import transactions");
  }
}
