"use client";

import * as React from "react";
import { AlertCircle, FileUp } from "lucide-react";

import {
  guessMapping,
  normaliseRows,
  parseCsv,
  type ColumnMapping,
  type ImportRow,
} from "@/lib/csv-import";
import { formatCurrency } from "@/lib/format";
import { readApiError } from "@/lib/use-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NONE = "none";
const MAX_ROWS = 500;
const PREVIEW_ROWS = 8;

type Column = keyof ColumnMapping;

function ColumnSelect({
  label,
  htmlFor,
  headers,
  value,
  optional,
  onChange,
}: {
  label: string;
  htmlFor: string;
  headers: string[];
  value: number | null;
  optional?: boolean;
  onChange: (index: number | null) => void;
}) {
  return (
    <Field label={label} htmlFor={htmlFor}>
      <Select
        value={value === null ? NONE : String(value)}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger id={htmlFor}>
          <SelectValue placeholder="Choose a column" />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>Not used</SelectItem>}
          {headers.map((header, index) => (
            <SelectItem key={index} value={String(index)}>
              {header || `Column ${index + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [body, setBody] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [duplicates, setDuplicates] = React.useState<Set<number>>(new Set());
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setFileName("");
    setHeaders([]);
    setBody([]);
    setMapping(null);
    setDuplicates(new Set());
    setError("");
  }, [open]);

  const parsed = React.useMemo(
    () => (mapping && body.length ? normaliseRows(body, mapping) : null),
    [body, mapping],
  );
  const rows: ImportRow[] = React.useMemo(() => parsed?.rows ?? [], [parsed]);

  // Ask the server which rows are already in the ledger, so the preview is honest.
  React.useEffect(() => {
    if (!rows.length || rows.length > MAX_ROWS) {
      setDuplicates(new Set());
      return;
    }
    let active = true;
    setChecking(true);
    fetch("/api/private/transactions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rows.map(({ date, title, amount, type }) => ({ date, title, amount, type })), dryRun: true }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { duplicates?: number[] } | null) => {
        if (active) setDuplicates(new Set(result?.duplicates ?? []));
      })
      .catch(() => {
        if (active) setDuplicates(new Set());
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [rows]);

  const handleFile = async (file: File) => {
    setError("");
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      setError("That file has no rows. Export the statement as CSV and try again.");
      return;
    }
    setFileName(file.name);
    setHeaders(table[0]);
    setBody(table.slice(1));
    setMapping(guessMapping(table[0]));
  };

  const set = (column: Column, index: number | null) =>
    setMapping((current) => (current ? { ...current, [column]: index } : current));

  const newCount = rows.length - duplicates.size;
  const tooMany = rows.length > MAX_ROWS;
  const income = rows.filter((r) => r.type === "income").length;

  const handleImport = async () => {
    setSaving(true);
    const response = await fetch("/api/private/transactions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rows.map(({ date, title, amount, type }) => ({ date, title, amount, type })) }),
    });
    setSaving(false);

    if (!response.ok) {
      setError(await readApiError(response, "Couldn't import those rows"));
      return;
    }
    const result = (await response.json()) as { imported: number; skippedDuplicates: number };
    toast.success(
      `Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}` +
        (result.skippedDuplicates ? `, skipped ${result.skippedDuplicates} already there` : ""),
    );
    onOpenChange(false);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a bank statement</DialogTitle>
          <DialogDescription>
            Upload a CSV from your bank or card. Rows already in your ledger are skipped. The file is read in your
            browser; only the rows you confirm are sent.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5 py-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-4" />
              {fileName ? "Choose another file" : "Choose a CSV file"}
            </Button>
            {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {mapping && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColumnSelect label="Date" htmlFor="imp-date" headers={headers} value={mapping.date} onChange={(i) => set("date", i ?? 0)} />
                <ColumnSelect label="Description" htmlFor="imp-title" headers={headers} value={mapping.title} onChange={(i) => set("title", i ?? 0)} />
                <ColumnSelect label="Amount (one signed column)" htmlFor="imp-amount" headers={headers} value={mapping.amount} optional onChange={(i) => set("amount", i)} />
                <div className="hidden sm:block" />
                <ColumnSelect label="Money out (debit)" htmlFor="imp-debit" headers={headers} value={mapping.debit} optional onChange={(i) => set("debit", i)} />
                <ColumnSelect label="Money in (credit)" htmlFor="imp-credit" headers={headers} value={mapping.credit} optional onChange={(i) => set("credit", i)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Use either one amount column (negative = money out) or separate debit and credit columns. Dates are read
                day first, so 03/04/2026 is 3 April.
              </p>

              {tooMany && (
                <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {rows.length} rows is more than the {MAX_ROWS} we import at once. Split the file by month.
                </p>
              )}

              {rows.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm" aria-live="polite">
                    <strong>{rows.length}</strong> row{rows.length === 1 ? "" : "s"} read ({income} income,{" "}
                    {rows.length - income} expense).{" "}
                    {checking ? (
                      "Checking for duplicates…"
                    ) : (
                      <>
                        <strong>{newCount}</strong> new
                        {duplicates.size > 0 && <>, {duplicates.size} already in your ledger</>}.
                      </>
                    )}
                  </p>
                  <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-foreground/15 text-sm">
                    {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                      <li key={row.line} className="flex items-center gap-3 px-4 py-2">
                        <span className="tabular w-24 shrink-0 text-xs text-muted-foreground">{row.date}</span>
                        <span className="min-w-0 flex-1 truncate">{row.title}</span>
                        {duplicates.has(index) && <Badge variant="outline">Already there</Badge>}
                        <span className={row.type === "income" ? "tabular shrink-0 text-success" : "tabular shrink-0"}>
                          {row.type === "income" ? "+" : "−"}
                          {formatCurrency(row.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {rows.length > PREVIEW_ROWS && (
                    <p className="text-xs text-muted-foreground">…and {rows.length - PREVIEW_ROWS} more.</p>
                  )}
                </div>
              )}

              {parsed && parsed.problems.length > 0 && (
                <details className="rounded-3xl bg-muted px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    {parsed.problems.length} row{parsed.problems.length === 1 ? "" : "s"} couldn&rsquo;t be read and will be skipped
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {parsed.problems.slice(0, 20).map((problem) => (
                      <li key={problem.line}>
                        Line {problem.line}: {problem.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={saving} disabled={!rows.length || tooMany || checking || newCount === 0} onClick={handleImport}>
            {newCount > 0 ? `Import ${newCount} transaction${newCount === 1 ? "" : "s"}` : "Nothing new to import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
