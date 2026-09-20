"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  HandCoins,
  Handshake,
  Plus,
  Receipt,
  RotateCw,
} from "lucide-react";

import { useQuery } from "@/lib/use-query";
import { downloadCsv } from "@/lib/csv";
import { formatCurrency, formatDate, formatRelative, initials } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";
import { toast } from "@/components/ui/toaster";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseDialog } from "./expense-dialog";
import { SettlementDialog, type SettlementPrefill } from "./settlement-dialog";
import type {
  Group,
  GroupExpense,
  MemberBalance,
  PairwiseSettlement,
  Settlement,
} from "./types";

/* ── Invite code ───────────────────────────────────────────────────────── */

function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Invite code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually.");
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="font-mono tracking-wider">
      {code}
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span className="sr-only">
        {copied ? "Invite code copied" : "Copy invite code"}
      </span>
    </Button>
  );
}

/* ── Balances ──────────────────────────────────────────────────────────── */

function BalancesTab({
  balances,
  pairwise,
  nameOf,
  onSettle,
}: {
  balances: MemberBalance[];
  pairwise: PairwiseSettlement[];
  nameOf: (id: string) => string;
  onSettle: (prefill: SettlementPrefill) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Who owes whom</CardTitle>
          <CardDescription>
            The shortest set of payments that clears every balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {pairwise.length ? (
            <ul className="space-y-2">
              {pairwise.map((item, index) => (
                <li
                  key={`${item.fromUserId}-${item.toUserId}-${index}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className="truncate font-medium">
                      {nameOf(item.fromUserId)}
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="pays"
                    />
                    <span className="truncate font-medium">
                      {nameOf(item.toUserId)}
                    </span>
                  </div>
                  <span className="tabular shrink-0 font-semibold">
                    {formatCurrency(item.amount)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onSettle({
                        fromUserId: item.fromUserId,
                        toUserId: item.toUserId,
                        amount: item.amount,
                      })
                    }
                  >
                    Settle
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Handshake}
              title="All settled"
              description="Nobody owes anybody in this group right now."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Net position per member</CardTitle>
          <CardDescription>
            Positive means the group owes them; negative means they owe the group.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {balances.length ? (
            <ul className="space-y-1">
              {balances.map((entry) => {
                const settled = Math.abs(entry.netAmount) < 0.01;
                const positive = entry.netAmount > 0;
                const name = nameOf(entry.memberId);

                return (
                  <li
                    key={entry.memberId}
                    className="flex items-center gap-3 border-b border-border py-3 last:border-0"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold text-secondary-foreground"
                    >
                      {initials(name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {name}
                    </span>
                    {/* Worded badge — the sign is never colour-only. */}
                    <Badge variant={settled ? "outline" : positive ? "success" : "destructive"}>
                      {settled
                        ? "Settled"
                        : `${positive ? "Gets" : "Owes"} ${formatCurrency(Math.abs(entry.netAmount))}`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="No balances yet"
              description="Add an expense and balances will appear here."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Expenses ──────────────────────────────────────────────────────────── */

const SPLIT_LABEL: Record<string, string> = {
  equal: "Equal",
  custom: "Exact",
  percentage: "Percentage",
  itemized: "By item",
};

function ExpensesTab({
  expenses,
  onCreate,
  onExport,
}: {
  expenses: GroupExpense[];
  onCreate: () => void;
  onExport: () => void;
}) {
  if (!expenses.length) {
    return (
      <EmptyState
        icon={Receipt}
        title="No expenses yet"
        description="Log the first shared cost and Fee-Nance will work out who owes what."
        action={
          <Button size="sm" onClick={onCreate}>
            Add expense
          </Button>
        }
      />
    );
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {expenses.length} expense{expenses.length === 1 ? "" : "s"} ·{" "}
          <span className="tabular font-medium text-foreground">
            {formatCurrency(total)}
          </span>{" "}
          total
        </p>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>

      <Card className="overflow-hidden">
        <ul>
          {expenses.map((expense) => (
            <li
              key={expense._id}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{expense.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(expense.incurredAt, "short")}
                  {expense.notes ? ` · ${expense.notes}` : ""}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {SPLIT_LABEL[expense.splitType] ?? expense.splitType}
              </Badge>
              <span className="tabular shrink-0 font-semibold">
                {formatCurrency(expense.amount)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ── Settlements ───────────────────────────────────────────────────────── */

function SettlementsTab({
  settlements,
  nameOf,
  onCreate,
}: {
  settlements: Settlement[];
  nameOf: (id: string) => string;
  onCreate: () => void;
}) {
  if (!settlements.length) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No settlements recorded"
        description="When someone pays another member back, record it here so balances stay accurate."
        action={
          <Button size="sm" onClick={onCreate}>
            Record settlement
          </Button>
        }
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul>
        {settlements.map((settlement) => (
          <li
            key={settlement._id}
            className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{nameOf(settlement.fromUserId)}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" aria-label="paid" />
                <span className="font-medium">{nameOf(settlement.toUserId)}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Tooltip content={formatDate(settlement.settledAt, "long")}>
                  <span>{formatRelative(settlement.settledAt)}</span>
                </Tooltip>
                {settlement.note ? ` · ${settlement.note}` : ""}
              </p>
            </div>
            <span className="tabular shrink-0 font-semibold text-success">
              {formatCurrency(settlement.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function GroupDetail({ groupId }: { groupId: string }) {
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<SettlementPrefill | null>(null);

  const groupQuery = useQuery<{ group: Group }>(`/api/private/groups/${groupId}`);
  const expensesQuery = useQuery<{ expenses: GroupExpense[] }>(
    `/api/private/groups/${groupId}/expenses`,
  );
  const balancesQuery = useQuery<{
    balances: MemberBalance[];
    pairwiseSettlements: PairwiseSettlement[];
  }>(`/api/private/groups/${groupId}/balances`);
  const settlementsQuery = useQuery<{ settlements: Settlement[] }>(
    `/api/private/groups/${groupId}/settlements`,
  );

  const members = React.useMemo(
    () => groupQuery.data?.group.members ?? [],
    [groupQuery.data],
  );

  const nameMap = React.useMemo(
    () => new Map(members.map((m) => [m.userId._id, m.userId.name])),
    [members],
  );
  const nameOf = React.useCallback(
    (id: string) => nameMap.get(id) ?? "Former member",
    [nameMap],
  );

  const handleExportExpenses = React.useCallback(() => {
    const expenses = expensesQuery.data?.expenses ?? [];
    const ordered = [...expenses].sort(
      (a, b) => new Date(a.incurredAt).getTime() - new Date(b.incurredAt).getTime(),
    );

    downloadCsv(
      `${groupQuery.data?.group.name ?? "group"}-expenses.csv`,
      ["Date", "Title", "Split type", "Amount", "Notes"],
      ordered.map((expense) => [
        new Date(expense.incurredAt).toISOString().slice(0, 10),
        expense.title,
        expense.splitType,
        expense.amount,
        expense.notes ?? "",
      ]),
    );
  }, [expensesQuery.data, groupQuery.data]);

  const refreshAll = React.useCallback(() => {
    groupQuery.reload();
    expensesQuery.reload();
    balancesQuery.reload();
    settlementsQuery.reload();
  }, [groupQuery, expensesQuery, balancesQuery, settlementsQuery]);

  const openSettle = (next: SettlementPrefill | null) => {
    setPrefill(next);
    setSettleOpen(true);
  };

  if (groupQuery.isLoading) {
    return (
      <LoadingRegion label="Loading group" className="space-y-6">
        <Skeleton className="h-20 w-full max-w-md" />
        <Skeleton className="h-11 w-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </LoadingRegion>
    );
  }

  if (groupQuery.error || !groupQuery.data) {
    return (
      <ErrorState
        title="Couldn't load this group"
        description="It may have been deleted, or you may no longer be a member."
        onRetry={groupQuery.reload}
      />
    );
  }

  const group = groupQuery.data.group;
  const expenses = expensesQuery.data?.expenses ?? [];
  const balances = balancesQuery.data?.balances ?? [];
  const pairwise = balancesQuery.data?.pairwiseSettlements ?? [];
  const settlements = settlementsQuery.data?.settlements ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={group.name}
        description={
          members.length
            ? `${members.length} member${members.length === 1 ? "" : "s"}: ${members.map((m) => m.userId.name).join(", ")}`
            : undefined
        }
        action={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              aria-label="Refresh group data"
              className="text-muted-foreground"
            >
              <RotateCw className="size-4" />
            </Button>
            <InviteCode code={group.inviteCode} />
            <Button onClick={() => setExpenseOpen(true)}>
              <Plus className="size-4" />
              Add expense
            </Button>
          </>
        }
      />

      <Tabs defaultValue="balances">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="expenses">
              Expenses
              <span className="tabular ml-1 text-xs text-muted-foreground">
                {expenses.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settlements">
              Settlements
              <span className="tabular ml-1 text-xs text-muted-foreground">
                {settlements.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <Button variant="outline" onClick={() => openSettle(null)}>
            <HandCoins className="size-4" />
            Record settlement
          </Button>
        </div>

        <TabsContent value="balances">
          {balancesQuery.isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <BalancesTab
              balances={balances}
              pairwise={pairwise}
              nameOf={nameOf}
              onSettle={openSettle}
            />
          )}
        </TabsContent>

        <TabsContent value="expenses">
          {expensesQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ExpensesTab
              expenses={expenses}
              onCreate={() => setExpenseOpen(true)}
              onExport={handleExportExpenses}
            />
          )}
        </TabsContent>

        <TabsContent value="settlements">
          {settlementsQuery.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <SettlementsTab
              settlements={settlements}
              nameOf={nameOf}
              onCreate={() => openSettle(null)}
            />
          )}
        </TabsContent>
      </Tabs>

      <ExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        groupId={groupId}
        members={members}
        onSaved={refreshAll}
      />
      <SettlementDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        groupId={groupId}
        members={members}
        prefill={prefill}
        onSaved={refreshAll}
      />
    </div>
  );
}
