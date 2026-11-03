"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  MoreHorizontal,
  Pencil,
  Receipt,
  Repeat,
  Search,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { Tooltip } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortHead,
  type SortDirection,
} from "@/components/ui/table";
import type { Category, Transaction } from "./types";

type SortKey = "date" | "title" | "amount";

/** Row actions, shared by the desktop table and the mobile card list. */
function RowActions({
  onEdit,
  onDelete,
  label,
}: {
  onEdit: () => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground"
          aria-label={`Actions for ${label}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Amount with a directional icon — sign is never carried by colour alone. */
function Amount({
  transaction,
  className,
}: {
  transaction: Transaction;
  className?: string;
}) {
  const income = transaction.type === "income";
  const Icon = income ? ArrowDownLeft : ArrowUpRight;

  return (
    <span
      className={cn(
        "tabular inline-flex items-center justify-end gap-1 font-medium",
        income ? "text-income" : "text-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{income ? "Income" : "Expense"}: </span>
      {formatCurrency(transaction.amount)}
    </span>
  );
}

export function TransactionsTab({
  transactions,
  categories,
  runningBalance,
  onCreate,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  categories: Category[];
  runningBalance: Map<string, number>;
  onCreate: () => void;
  onEdit: (txn: Transaction) => void;
  onDelete: (txn: Transaction) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("date");
  const [sortDir, setSortDir] = React.useState<SortDirection>("desc");

  const categoryMap = React.useMemo(
    () => new Map(categories.map((c) => [c._id, c])),
    [categories],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  const visible = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = transactions.filter((txn) => {
      if (typeFilter !== "all" && txn.type !== typeFilter) return false;
      if (categoryFilter === "none" && txn.categoryId) return false;
      if (
        categoryFilter !== "all" &&
        categoryFilter !== "none" &&
        txn.categoryId !== categoryFilter
      ) {
        return false;
      }
      if (!query) return true;
      return (
        txn.title.toLowerCase().includes(query) ||
        (txn.notes ?? "").toLowerCase().includes(query)
      );
    });

    const direction = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortKey === "amount") return (a.amount - b.amount) * direction;
      if (sortKey === "title") return a.title.localeCompare(b.title) * direction;
      return (
        (new Date(a.transactionDate).getTime() -
          new Date(b.transactionDate).getTime()) *
        direction
      );
    });
  }, [transactions, search, typeFilter, categoryFilter, sortKey, sortDir]);

  const isFiltered =
    Boolean(search.trim()) || typeFilter !== "all" || categoryFilter !== "all";

  return (
    <div className="space-y-4">
      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions"
            aria-label="Search transactions"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
          >
            <SelectTrigger aria-label="Filter by type" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger aria-label="Filter by category" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="none">Uncategorised</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category._id} value={category._id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Empty ───────────────────────────────────────────────────── */}
      {!visible.length ? (
        <EmptyState
          icon={Receipt}
          title={isFiltered ? "No matching transactions" : "No transactions yet"}
          description={
            isFiltered
              ? "Try widening the date range or clearing a filter."
              : "Add your first transaction to start seeing balances and breakdowns."
          }
          action={
            isFiltered ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                  setCategoryFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={onCreate}>
                Add transaction
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* ── Desktop: table ───────────────────────────────────────── */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableSortHead
                    label="Date"
                    direction={sortKey === "date" ? sortDir : null}
                    onToggle={() => toggleSort("date")}
                    className="w-32"
                  />
                  <TableSortHead
                    label="Description"
                    direction={sortKey === "title" ? sortDir : null}
                    onToggle={() => toggleSort("title")}
                  />
                  <TableHead className="w-40">Category</TableHead>
                  <TableSortHead
                    label="Amount"
                    direction={sortKey === "amount" ? sortDir : null}
                    onToggle={() => toggleSort("amount")}
                    align="right"
                    className="w-36"
                  />
                  <TableHead className="w-36 text-right">Balance</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((txn) => {
                  const category = txn.categoryId
                    ? categoryMap.get(txn.categoryId)
                    : undefined;
                  return (
                    <TableRow key={txn._id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(txn.transactionDate, "short")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{txn.title}</span>
                          {txn.pending && <Badge variant="outline">Waiting to sync</Badge>}
                          {txn.recurring?.enabled && (
                            <Tooltip
                              content={`Repeats ${txn.recurring.frequency ?? "monthly"}`}
                            >
                              <span className="text-muted-foreground">
                                <Repeat className="size-3.5" />
                                <span className="sr-only">
                                  Recurring {txn.recurring.frequency ?? "monthly"}
                                </span>
                              </span>
                            </Tooltip>
                          )}
                        </div>
                        {txn.notes && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {txn.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {category ? (
                          <Badge variant="outline" className="gap-1.5">
                            {category.color && (
                              <span
                                aria-hidden="true"
                                className="size-2 rounded-full"
                                style={{ background: category.color }}
                              />
                            )}
                            {category.name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount transaction={txn} />
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {formatCurrency(runningBalance.get(txn._id) ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          label={txn.title}
                          onEdit={() => onEdit(txn)}
                          onDelete={() => onDelete(txn)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* ── Mobile: card list ────────────────────────────────────── */}
          <ul className="space-y-2 md:hidden">
            {visible.map((txn) => {
              const category = txn.categoryId
                ? categoryMap.get(txn.categoryId)
                : undefined;
              return (
                <li key={txn._id}>
                  <Card className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{txn.title}</p>
                        {txn.pending && <Badge variant="outline" className="shrink-0">Waiting to sync</Badge>}
                        {txn.recurring?.enabled && (
                          <Repeat
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Recurring"
                          />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(txn.transactionDate, "short")}
                        {category ? ` · ${category.name}` : ""}
                      </p>
                      <Amount transaction={txn} className="mt-2 text-base" />
                    </div>
                    <RowActions
                      label={txn.title}
                      onEdit={() => onEdit(txn)}
                      onDelete={() => onDelete(txn)}
                    />
                  </Card>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            Showing {visible.length} of {transactions.length} transactions in range.
          </p>
        </>
      )}
    </div>
  );
}
