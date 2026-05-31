/**
 * Dependency-free CSV serialisation (RFC 4180). Kept pure so the Node test suite
 * can exercise escaping directly; the DOM download wrapper lives separately.
 *
 * Fields containing a comma, double-quote, or newline are wrapped in double
 * quotes, and embedded quotes are doubled. A UTF-8 BOM can be prepended so
 * Excel opens accented text and the separator correctly.
 */
export interface CsvColumn<T> {
  /** Column header shown in the first row. */
  header: string;
  /** Extract the cell value for a row (formatted to a string by `toCsv`). */
  value: (row: T) => string | number | boolean | null | undefined;
}

/** Quote a single field if it contains a delimiter, quote, or newline (RFC 4180). */
export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface ToCsvOptions {
  /** Prepend a UTF-8 BOM so Excel detects encoding (default true). */
  bom?: boolean;
  /** Line terminator (default CRLF, per RFC 4180 / Excel). */
  eol?: string;
}

/** Serialise `rows` to a CSV string using the given column spec. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[], options: ToCsvOptions = {}): string {
  const eol = options.eol ?? '\r\n';
  const bom = options.bom ?? true;
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCsvField(c.header)).join(','));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvField(c.value(row))).join(','));
  }
  return (bom ? '﻿' : '') + lines.join(eol) + eol;
}

/** Slugify a label into a safe filename stem (e.g. "Carbon inventory" → "carbon-inventory"). */
export function csvFilename(stem: string, date: Date = new Date()): string {
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'export';
  const stamp = date.toISOString().slice(0, 10);
  return `${slug}-${stamp}.csv`;
}
