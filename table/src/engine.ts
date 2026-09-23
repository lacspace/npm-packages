/**
 * The table engine — every decision a table makes, as pure functions.
 *
 * Nothing in this file imports React or touches the DOM (the single exception,
 * `downloadCsv`, only reaches for `document` *inside* the call). That is on
 * purpose: sorting, filtering, paging, selection and export are the parts that
 * actually contain bugs, so they live where they can be unit-tested, reused on
 * a server, or driven by your own markup through `useTable`.
 */
import { clamp } from "./util.js";

/* ==========================================================================
   Values
   ========================================================================== */

/**
 * True for the values a table should treat as "no value at all".
 *
 * `NaN` counts: it arrives from `Number(someEmptyCell)` far more often than
 * anyone intends, and sorting it as a number puts it in a random place.
 */
export function isBlank(value: unknown): value is null | undefined {
  return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));
}

/**
 * Best-effort number for a cell value. Strings keep their meaning through
 * thousands separators and spaces ("1,250" → 1250), booleans become 0/1 and
 * dates become epoch milliseconds. Anything else is `null`, never `NaN`.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A cell value as plain searchable/exportable text. Blanks become `""`. */
export function toText(value: unknown): string {
  if (isBlank(value)) return "";
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return "";
    }
  }
  return String(value);
}

/* ==========================================================================
   Sorting
   ========================================================================== */

export type SortDirection = "asc" | "desc";

/** One sort key. Several of them, in priority order, make a multi-column sort. */
export interface SortRule {
  /** Column id. */
  readonly id: string;
  readonly direction: SortDirection;
}

export type SortState = readonly SortRule[];

/** How the engine reads and compares one column while sorting. */
export interface SortField<Row> {
  getValue: (row: Row) => unknown;
  /** Custom comparator. Return <0, 0 or >0 as with `Array#sort`. */
  compare?: (a: unknown, b: unknown, rowA: Row, rowB: Row) => number;
}

/**
 * The comparator used when a column does not bring its own.
 *
 * Numbers compare numerically, dates by instant, booleans false-before-true and
 * everything else with `localeCompare` — which is the difference between
 * "Ångström" landing next to "Anderson" and landing after "Zulu". `numeric`
 * also makes "item 2" sort before "item 10".
 */
export function defaultCompare(a: unknown, b: unknown, locale?: string | string[]): number {
  if (a instanceof Date || b instanceof Date) {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na !== null && nb !== null) return na - nb;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return toText(a).localeCompare(toText(b), locale, { numeric: true, sensitivity: "base" });
}

/**
 * Sort rows by any number of keys.
 *
 * Two rules that are not negotiable here:
 * 1. **Blanks always sort last**, ascending *or* descending. Flipping the
 *    direction should surface the largest values, not a wall of empty cells.
 * 2. **The sort is stable** — equal rows keep their original order, so a second
 *    sort refines the first instead of shuffling it.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  sort: SortState,
  fields: Readonly<Record<string, SortField<Row>>>,
  locale?: string | string[],
): Row[] {
  if (sort.length === 0) return rows.slice();

  const decorated = rows.map((row, index) => ({ row, index }));

  decorated.sort((left, right) => {
    for (const rule of sort) {
      const field = fields[rule.id];
      if (!field) continue;

      const a = field.getValue(left.row);
      const b = field.getValue(right.row);
      const aBlank = isBlank(a);
      const bBlank = isBlank(b);
      if (aBlank && bBlank) continue;
      if (aBlank) return 1;
      if (bBlank) return -1;

      const result = field.compare
        ? field.compare(a, b, left.row, right.row)
        : defaultCompare(a, b, locale);
      if (result !== 0) return rule.direction === "desc" ? -result : result;
    }
    return left.index - right.index;
  });

  return decorated.map((entry) => entry.row);
}

/** The direction a column is currently sorted in, or `false` when it is not. */
export function sortDirectionOf(sort: SortState, id: string): SortDirection | false {
  return sort.find((rule) => rule.id === id)?.direction ?? false;
}

/** 1-based position of a column in a multi-sort, or 0 when it is not sorted. */
export function sortIndexOf(sort: SortState, id: string): number {
  const index = sort.findIndex((rule) => rule.id === id);
  return index < 0 ? 0 : index + 1;
}

/**
 * The header-click state machine: ascending → descending → unsorted.
 *
 * `additive` (shift-click) appends the column to the existing sort instead of
 * replacing it, which is how you get "by team, then by score".
 */
export function cycleSort(
  sort: SortState,
  id: string,
  options: { additive?: boolean; allowUnsorted?: boolean } = {},
): SortRule[] {
  const { additive = false, allowUnsorted = true } = options;
  const current = sort.find((rule) => rule.id === id);
  const others = additive ? sort.filter((rule) => rule.id !== id) : [];

  if (!current) return [...others, { id, direction: "asc" }];
  if (current.direction === "asc") return [...others, { id, direction: "desc" }];
  return allowUnsorted ? [...others] : [...others, { id, direction: "asc" }];
}

/* ==========================================================================
   Filtering
   ========================================================================== */

/** An inclusive numeric range. Either end may be left open. */
export interface NumberRange {
  readonly min?: number | null;
  readonly max?: number | null;
}

/** Everything a column filter is allowed to be. */
export type FilterValue =
  | string
  | number
  | boolean
  | NumberRange
  | readonly (string | number)[]
  | null
  | undefined;

export function isNumberRange(value: unknown): value is NumberRange {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value) || value instanceof Date) return false;
  return "min" in value || "max" in value;
}

/** A filter that should not narrow anything: unset, empty string, empty list. */
export function isEmptyFilter(filter: FilterValue): boolean {
  if (filter === undefined || filter === null || filter === "") return true;
  if (Array.isArray(filter)) return filter.length === 0;
  if (isNumberRange(filter)) return isBlank(filter.min) && isBlank(filter.max);
  return false;
}

/**
 * Does one cell value pass one filter?
 *
 * The filter's *shape* picks the operator, so callers never name one: a string
 * means case-insensitive "contains", a number means equals, a boolean means
 * truthiness, a `{min,max}` object means a numeric range and an array means
 * "one of". An empty filter passes everything.
 */
export function matchesFilter(value: unknown, filter: FilterValue): boolean {
  if (filter === null || filter === undefined) return true;
  if (isEmptyFilter(filter)) return true;

  if (typeof filter === "boolean") return Boolean(value) === filter;

  if (isNumberRange(filter)) {
    const numeric = toNumber(value);
    if (numeric === null) return false;
    const { min, max } = filter;
    if (!isBlank(min) && numeric < min) return false;
    if (!isBlank(max) && numeric > max) return false;
    return true;
  }

  if (typeof filter === "string") return toText(value).toLowerCase().includes(filter.toLowerCase());

  if (typeof filter === "number") return toNumber(value) === filter;

  const text = toText(value).toLowerCase();
  return filter.some((option) => toText(option).toLowerCase() === text);
}

/** How the engine reads one column while filtering and searching. */
export interface FilterField<Row> {
  getValue: (row: Row) => unknown;
  /** Replace the shape-based matcher for this column. */
  filterFn?: (value: unknown, filter: FilterValue, row: Row) => boolean;
  /** Text this column contributes to the global search. Defaults to its value. */
  getSearchText?: (row: Row) => string;
  /** `false` keeps the column out of the global search. Default `true`. */
  searchable?: boolean;
}

export interface FilterOptions {
  /** Per-column filters, keyed by column id. */
  readonly filters?: Readonly<Record<string, FilterValue>>;
  /** The global search box. */
  readonly query?: string;
  /** Columns the global search looks at. Defaults to every searchable column. */
  readonly searchIds?: readonly string[];
}

/** Columns the global search covers when the caller does not name any. */
export function searchableIds<Row>(fields: Readonly<Record<string, FilterField<Row>>>): string[] {
  return Object.keys(fields).filter((id) => fields[id]?.searchable !== false);
}

/**
 * Does a row survive the global search?
 *
 * The query is split on whitespace and **every** term must appear somewhere in
 * the searched columns — "ana 2024" finds Ana's 2024 rows rather than every row
 * mentioning either. Matching is case-insensitive.
 */
export function matchesQuery<Row>(
  row: Row,
  query: string,
  fields: Readonly<Record<string, FilterField<Row>>>,
  searchIds?: readonly string[],
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const ids = searchIds ?? searchableIds(fields);
  let haystack = "";
  for (const id of ids) {
    const field = fields[id];
    if (!field) continue;
    const text = field.getSearchText ? field.getSearchText(row) : toText(field.getValue(row));
    if (text) haystack += `${text.toLowerCase()} `;
  }

  return terms.every((term) => haystack.includes(term));
}

/** Apply the per-column filters and the global search, in that order. */
export function filterRows<Row>(
  rows: readonly Row[],
  fields: Readonly<Record<string, FilterField<Row>>>,
  options: FilterOptions = {},
): Row[] {
  const { filters, query, searchIds } = options;
  const active = filters
    ? Object.entries(filters).filter(([, value]) => !isEmptyFilter(value))
    : [];
  const hasQuery = Boolean(query && query.trim());
  if (active.length === 0 && !hasQuery) return rows.slice();

  return rows.filter((row) => {
    for (const [id, filter] of active) {
      const field = fields[id];
      if (!field) continue;
      const value = field.getValue(row);
      const ok = field.filterFn
        ? field.filterFn(value, filter, row)
        : matchesFilter(value, filter);
      if (!ok) return false;
    }
    if (hasQuery && !matchesQuery(row, query as string, fields, searchIds)) return false;
    return true;
  });
}

/* ==========================================================================
   Pagination
   ========================================================================== */

/** How many pages `total` rows make at `pageSize`. Never less than 1. */
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/**
 * Keep a page index inside the table.
 *
 * This is the fix for the classic "I filtered and the table went blank" bug:
 * when the row count shrinks under a reader who is on page 9, they belong on
 * the last page that still has rows, not on an empty one.
 */
export function clampPage(pageIndex: number, total: number, pageSize: number): number {
  return clamp(Math.trunc(pageIndex), 0, pageCount(total, pageSize) - 1);
}

/** The rows on one page. */
export function pageSlice<T>(rows: readonly T[], pageIndex: number, pageSize: number): T[] {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return rows.slice();
  const safe = clampPage(pageIndex, rows.length, pageSize);
  const start = safe * pageSize;
  return rows.slice(start, start + pageSize);
}

/** 1-based "showing 21–40 of 173" numbers. `from` is 0 when there are no rows. */
export function pageRange(
  pageIndex: number,
  pageSize: number,
  total: number,
): { from: number; to: number; total: number } {
  if (total <= 0) return { from: 0, to: 0, total: 0 };
  const safe = clampPage(pageIndex, total, pageSize);
  const from = safe * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return { from, to, total };
}

/**
 * The page to land on after a page-size change, keeping the row the reader is
 * already looking at on screen. Going 10 → 25 per page on page 4 (rows 31-40)
 * lands on page 2 (rows 26-50), not back at the top.
 */
export function pageForSizeChange(pageIndex: number, oldSize: number, newSize: number): number {
  if (!Number.isFinite(newSize) || newSize <= 0) return 0;
  const firstRow = Math.max(0, Math.trunc(pageIndex)) * Math.max(1, oldSize);
  return Math.floor(firstRow / newSize);
}

/** A slot in the pager: a page index, or a gap to render as an ellipsis. */
export type PageToken = number | "ellipsis";

/**
 * Page buttons with ellipses, always showing the first, last and current page.
 * `max` is the number of *page numbers* shown, gaps excluded.
 */
export function pageTokens(pageIndex: number, count: number, max = 7): PageToken[] {
  const total = Math.max(1, Math.trunc(count));
  const window = Math.max(3, Math.trunc(max));
  const current = clamp(Math.trunc(pageIndex), 0, total - 1);
  if (total <= window) return Array.from({ length: total }, (_, i) => i);

  const side = Math.floor((window - 3) / 2);
  let start = current - side;
  let end = current + side;
  if (start < 1) {
    start = 1;
    end = window - 2;
  }
  if (end > total - 2) {
    end = total - 2;
    start = total - 1 - (window - 2);
  }
  start = Math.max(1, start);

  const tokens: PageToken[] = [0];
  if (start > 1) tokens.push("ellipsis");
  for (let page = start; page <= end; page += 1) tokens.push(page);
  if (end < total - 2) tokens.push("ellipsis");
  tokens.push(total - 1);
  return tokens;
}

/* ==========================================================================
   Selection
   ========================================================================== */

/** Selected row ids, in the order they were picked. */
export type SelectionState = readonly string[];

/** Where a "select all" checkbox stands for a given set of rows. */
export type SelectionMode = "none" | "some" | "all";

/** Add or remove one row. Omit `on` to flip it. */
export function toggleSelected(selected: SelectionState, id: string, on?: boolean): string[] {
  const has = selected.includes(id);
  const next = on ?? !has;
  if (next === has) return selected.slice();
  return next ? [...selected, id] : selected.filter((entry) => entry !== id);
}

/**
 * Select or clear a group of rows — the header checkbox, which acts on the
 * current page only. Ids outside the group are untouched, so a selection
 * survives paging, sorting and filtering.
 */
export function setSelection(selected: SelectionState, ids: readonly string[], on: boolean): string[] {
  if (!on) {
    const drop = new Set(ids);
    return selected.filter((id) => !drop.has(id));
  }
  const have = new Set(selected);
  const next = selected.slice();
  for (const id of ids) {
    if (!have.has(id)) {
      have.add(id);
      next.push(id);
    }
  }
  return next;
}

/** `none`, `some` (→ indeterminate) or `all` for the given rows. */
export function selectionMode(selected: SelectionState, ids: readonly string[]): SelectionMode {
  if (ids.length === 0) return "none";
  const chosen = new Set(selected);
  let hits = 0;
  for (const id of ids) if (chosen.has(id)) hits += 1;
  if (hits === 0) return "none";
  return hits === ids.length ? "all" : "some";
}

/** The header checkbox's third state — neither checked nor unchecked. */
export function isIndeterminate(selected: SelectionState, ids: readonly string[]): boolean {
  return selectionMode(selected, ids) === "some";
}

/**
 * Drop ids that no longer exist in the data. Call it when rows are deleted;
 * skip it when rows are merely filtered out, since a filtered-away selection
 * is meant to come back.
 */
export function pruneSelection(selected: SelectionState, knownIds: readonly string[]): string[] {
  const known = new Set(knownIds);
  return selected.filter((id) => known.has(id));
}

/* ==========================================================================
   Column sizing
   ========================================================================== */

/** Floor for a resized column — below this a header is unreadable. */
export const MIN_COLUMN_WIDTH = 64;
/** Ceiling for a resized column. */
export const MAX_COLUMN_WIDTH = 960;

/** Clamp a width to the column's bounds. Nonsense values fall back to `min`. */
export function clampColumnWidth(
  width: number,
  min: number = MIN_COLUMN_WIDTH,
  max: number = MAX_COLUMN_WIDTH,
): number {
  return Math.round(clamp(width, min, max));
}

/** Where a drag that started at `startWidth` and moved `delta` px ends up. */
export function resizeColumn(
  startWidth: number,
  delta: number,
  min: number = MIN_COLUMN_WIDTH,
  max: number = MAX_COLUMN_WIDTH,
): number {
  return clampColumnWidth(startWidth + delta, min, max);
}

/**
 * Left/right offsets for pinned columns, so each sticks just past the one
 * before it. Index `i` of the result is the offset for column `i`.
 */
export function pinnedOffsets(widths: readonly number[], side: "left" | "right"): number[] {
  const offsets = new Array<number>(widths.length).fill(0);
  if (side === "left") {
    let run = 0;
    for (let i = 0; i < widths.length; i += 1) {
      offsets[i] = run;
      run += widths[i] ?? 0;
    }
  } else {
    let run = 0;
    for (let i = widths.length - 1; i >= 0; i -= 1) {
      offsets[i] = run;
      run += widths[i] ?? 0;
    }
  }
  return offsets;
}

/* ==========================================================================
   Aggregates
   ========================================================================== */

export type AggregateFn = "sum" | "avg" | "min" | "max" | "count";

/** The numeric values in a column, blanks and non-numbers dropped. */
export function numericValues(values: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (isBlank(value)) continue;
    const numeric = toNumber(value);
    if (numeric !== null) out.push(numeric);
  }
  return out;
}

/**
 * A footer total.
 *
 * Blanks are ignored rather than counted as zero — an average over "3, blank,
 * 5" is 4, which is what a reader expects and what a spreadsheet does.
 * `count` counts non-blank values of any type; `sum` of nothing is 0, while
 * `avg`, `min` and `max` of nothing are `null` (there is no honest number).
 */
export function aggregate(values: readonly unknown[], fn: AggregateFn): number | null {
  if (fn === "count") return values.reduce<number>((n, value) => (isBlank(value) ? n : n + 1), 0);

  const numbers = numericValues(values);
  if (fn === "sum") return numbers.reduce((total, n) => total + n, 0);
  if (numbers.length === 0) return null;
  if (fn === "avg") return numbers.reduce((total, n) => total + n, 0) / numbers.length;
  if (fn === "min") return Math.min(...numbers);
  return Math.max(...numbers);
}

/* ==========================================================================
   Export
   ========================================================================== */

/** Characters that make a spreadsheet treat a cell as a formula. */
export const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const;

const NUMERIC_LITERAL = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Defuse spreadsheet formula injection (CSV injection).
 *
 * A cell of `=HYPERLINK("http://evil","click")` is a live formula the moment
 * someone opens the export in Excel or Sheets. Prefixing with an apostrophe
 * makes it text again. Plain numbers — including negatives like `-12.5` — are
 * left alone, because a number can never be a formula.
 */
export function neutraliseFormula(text: string): string {
  if (text === "") return text;
  const first = text.charAt(0);
  if (!FORMULA_PREFIXES.includes(first as (typeof FORMULA_PREFIXES)[number])) return text;
  if (NUMERIC_LITERAL.test(text)) return text;
  return `'${text}`;
}

/**
 * One cell, escaped for a delimited file: doubled quotes, and quoting whenever
 * the text holds the delimiter, a quote or a line break (RFC 4180).
 */
export function escapeCell(value: unknown, delimiter = ","): string {
  const text = neutraliseFormula(toText(value));
  const needsQuotes =
    text.includes(delimiter) || text.includes('"') || text.includes("\n") || text.includes("\r");
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface DelimitedOptions {
  /** `,` for CSV, `\t` for TSV. */
  delimiter?: string;
  /** Line ending. CRLF by default — the one Excel never argues with. */
  eol?: string;
}

/** A matrix of values as delimited text. */
export function toDelimited(
  matrix: ReadonlyArray<readonly unknown[]>,
  options: DelimitedOptions = {},
): string {
  const { delimiter = ",", eol = "\r\n" } = options;
  return matrix
    .map((row) => row.map((cell) => escapeCell(cell, delimiter)).join(delimiter))
    .join(eol);
}

/** A matrix as CSV. */
export function toCsv(matrix: ReadonlyArray<readonly unknown[]>): string {
  return toDelimited(matrix, { delimiter: "," });
}

/** A matrix as TSV — what a spreadsheet accepts straight from the clipboard. */
export function toTsv(matrix: ReadonlyArray<readonly unknown[]>): string {
  return toDelimited(matrix, { delimiter: "\t" });
}

/** One exported column: a header and how to read the value out of a row. */
export interface ExportColumn<Row> {
  header: string;
  value: (row: Row) => unknown;
}

export interface ExportOptions extends DelimitedOptions {
  /** Write the header row. Default `true`. */
  header?: boolean;
}

/**
 * Rows → delimited text. Pass `{ delimiter: "\t" }` for TSV.
 *
 * Returns a string and writes nothing anywhere: hand it to `downloadCsv`, a
 * file write, an email attachment or a test.
 */
export function exportRows<Row>(
  rows: readonly Row[],
  columns: ReadonlyArray<ExportColumn<Row>>,
  options: ExportOptions = {},
): string {
  const { header = true, ...rest } = options;
  const matrix: unknown[][] = [];
  if (header) matrix.push(columns.map((column) => column.header));
  for (const row of rows) matrix.push(columns.map((column) => column.value(row)));
  return toDelimited(matrix, rest);
}

/**
 * Save text to the reader's disk.
 *
 * The DOM is touched only inside this call — importing this module on a server
 * is safe, and calling it there simply returns `false` instead of throwing.
 * The BOM is what makes Excel read UTF-8 accents correctly.
 */
export function downloadCsv(
  filename: string,
  content: string,
  options: { mimeType?: string; bom?: boolean } = {},
): boolean {
  const { mimeType = "text/csv;charset=utf-8", bom = true } = options;
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return false;
  }
  const body = bom && !content.startsWith("﻿") ? `﻿${content}` : content;
  const url = URL.createObjectURL(new Blob([body], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the click a tick to start before the blob url stops resolving.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
