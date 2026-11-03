/**
 * Bank-statement CSV import: parsing, column guessing and row normalisation.
 * Pure, so it runs in the browser for the preview and in verify-calculations.
 *
 * Statements disagree on everything: date formats, one signed amount column
 * or separate debit and credit columns, ₹ and thousands separators, "Dr"/"Cr"
 * suffixes. Each of those is handled explicitly below, and anything that
 * can't be read is reported per row instead of being guessed at.
 */

/** RFC 4180-style parsing: quoted fields, escaped quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  // Statements are comma, semicolon or tab separated; pick the one the header line uses most.
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ([",", ";", "\t"] as const).reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

export interface ColumnMapping {
  date: number;
  title: number;
  /** One signed amount column… */
  amount: number | null;
  /** …or separate money-out and money-in columns. */
  debit: number | null;
  credit: number | null;
}

const MATCHERS: Record<keyof ColumnMapping, RegExp> = {
  date: /^(txn |transaction |value |posting )?date$|^date\b/i,
  title: /narration|description|particulars|details|remarks|merchant|payee|transaction remarks/i,
  amount: /^amount$|^(txn |transaction )?amount( \(inr\))?$/i,
  debit: /withdrawal|debit|paid out|money out|dr\.?$/i,
  credit: /deposit|credit|paid in|money in|cr\.?$/i,
};

/** Best guess at which column is which, from the header row. */
export function guessMapping(headers: string[]): ColumnMapping {
  const find = (key: keyof ColumnMapping, taken: number[] = []) => {
    const index = headers.findIndex((h, i) => !taken.includes(i) && MATCHERS[key].test(h.trim()));
    return index === -1 ? null : index;
  };
  const date = find("date");
  const debit = find("debit", date === null ? [] : [date]);
  const credit = find("credit", [...(date === null ? [] : [date]), ...(debit === null ? [] : [debit])]);
  const taken = [date, debit, credit].filter((i): i is number => i !== null);
  const title = find("title", taken);
  const amount = debit !== null || credit !== null ? find("amount", taken) : find("amount", taken);

  return { date: date ?? 0, title: title ?? Math.min(1, headers.length - 1), amount, debit, credit };
}

/** Parses "1,23,456.78", "₹ 450", "(450.00)", "450 Dr"; null when it isn't a number. */
export function parseAmount(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(text)) {
    negative = true;
    text = text.replace(/\s*dr\.?$/i, "");
  } else if (/\bcr\.?$/i.test(text)) {
    text = text.replace(/\s*cr\.?$/i, "");
  }
  text = text.replace(/[₹$,\s]|rs\.?|inr/gi, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Math.round(Number(text) * 100) / 100;
  return negative ? -value : value;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parses a statement date to "YYYY-MM-DD". Indian statements are day-first, so
 * 03/04/2026 is 3 April. Two-digit years are read as 20xx.
 */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  let year: number, month: number, day: number;

  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (year < 100) year += 2000;
  } else if ((m = text.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]*(\d{2}|\d{4})$/))) {
    day = Number(m[1]);
    month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    year = Number(m[3]);
    if (year < 100) year += 2000;
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export interface ImportRow {
  /** 1-based line in the file, header included, for error messages. */
  line: number;
  date: string;
  title: string;
  amount: number;
  type: "income" | "expense";
}

export interface RowProblem {
  line: number;
  message: string;
}

/** Turns CSV rows into transactions, reporting each row that can't be read. */
export function normaliseRows(rows: string[][], mapping: ColumnMapping) {
  const good: ImportRow[] = [];
  const problems: RowProblem[] = [];

  rows.forEach((cells, index) => {
    const line = index + 2; // header is line 1
    const date = parseStatementDate(cells[mapping.date] ?? "");
    if (!date) return void problems.push({ line, message: `Couldn't read the date "${cells[mapping.date] ?? ""}"` });

    const title = (cells[mapping.title] ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (title.length < 2) return void problems.push({ line, message: "Missing description" });

    let signed: number | null = null;
    if (mapping.debit !== null || mapping.credit !== null) {
      const out = parseAmount(cells[mapping.debit ?? -1] ?? "");
      const into = parseAmount(cells[mapping.credit ?? -1] ?? "");
      if (out && out !== 0) signed = -Math.abs(out);
      else if (into && into !== 0) signed = Math.abs(into);
    } else if (mapping.amount !== null) {
      signed = parseAmount(cells[mapping.amount] ?? "");
    }
    if (signed === null || signed === 0) {
      return void problems.push({ line, message: "No amount on this row" });
    }

    good.push({ line, date, title, amount: Math.abs(signed), type: signed < 0 ? "expense" : "income" });
  });

  return { rows: good, problems };
}

/** Two entries are the same charge when day, amount, type and description match. */
export function duplicateKey(row: { date: string; amount: number; type: string; title: string }) {
  return `${row.date}|${row.type}|${row.amount.toFixed(2)}|${row.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
}
