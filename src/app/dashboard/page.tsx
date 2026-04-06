import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { toObjectId } from "@/lib/object-id";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Budget } from "@/models/Budget";
import { Group } from "@/models/Group";
import { Transaction } from "@/models/Transaction";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const userObjectId = toObjectId(session.user.id);

  const [transactionStats, budgetCount, groupCount] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]),
    Budget.countDocuments({ userId: userObjectId }),
    Group.countDocuments({ "members.userId": userObjectId }),
  ]);

  const totalIncome = transactionStats.find((entry) => entry._id === "income")?.total ?? 0;
  const totalExpense = transactionStats.find((entry) => entry._id === "expense")?.total ?? 0;
  const balance = totalIncome - totalExpense;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-5 py-8 text-[var(--color-text)] md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Fee-Nance</p>
            <h1 className="text-3xl leading-tight text-[var(--color-text)]">Dashboard</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Welcome, {session.user.name ?? session.user.email}
            </p>
          </div>
          <SignOutButton />
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Total Income</p>
            <p className="mt-3 text-3xl text-[var(--color-accent)]">Rs {totalIncome.toFixed(2)}</p>
          </article>

          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Total Expense</p>
            <p className="mt-3 text-3xl text-[var(--color-accent)]">Rs {totalExpense.toFixed(2)}</p>
          </article>

          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Current Balance</p>
            <p className="mt-3 text-3xl text-[var(--color-accent)]">Rs {balance.toFixed(2)}</p>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Budgets Active</p>
            <p className="mt-3 text-4xl text-[var(--color-text)]">{budgetCount}</p>
          </article>

          <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Groups Joined</p>
            <p className="mt-3 text-4xl text-[var(--color-text)]">{groupCount}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h2 className="text-xl text-[var(--color-text)]">Next Steps</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Use private API endpoints to create categories, transactions, budgets, groups, expenses, and settlements.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link className="rounded-md border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-accent)]" href="/api/private/transactions">
              Transactions API
            </Link>
            <Link className="rounded-md border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-accent)]" href="/api/private/groups">
              Groups API
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
