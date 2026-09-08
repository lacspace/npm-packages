/**
 * @lacspace/hooks — pure, framework-agnostic core (React-free).
 *
 * This module holds the plain logic behind several of the package's newer
 * hooks: pagination math, wizard/stepper math, an undo/redo history buffer,
 * immutable array (list) operations and CSS media-query string builders.
 *
 * It imports **no React and touches no DOM**, so every function here can be
 * unit-tested directly under a Node environment. The hooks in `index.ts` are
 * thin state/effect wrappers around these functions.
 *
 * @packageDocumentation
 */

/* -------------------------------------------------------------------------- */
/*  Small numeric helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Clamp `n` into the inclusive range `[min, max]`. `min`/`max` may be swapped. */
export function clamp(n: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/* -------------------------------------------------------------------------- */
/*  Pagination                                                                  */
/* -------------------------------------------------------------------------- */

/** Immutable, fully-derived pagination snapshot. */
export interface PaginationState {
  /** 1-based current page (clamped into `[1, pageCount]`). */
  page: number;
  /** Items per page (at least 1). */
  pageSize: number;
  /** Total number of pages (at least 1, even when there are 0 items). */
  pageCount: number;
  /** Total number of items across all pages. */
  totalItems: number;
  /** 0-based index of the first item on the current page. */
  startIndex: number;
  /** 0-based index of the last item on the current page (`-1` when empty). */
  endIndex: number;
  /** Number of items actually shown on the current page. */
  itemCountOnPage: number;
  /** `true` when a previous page exists. */
  hasPrev: boolean;
  /** `true` when a next page exists. */
  hasNext: boolean;
  /** `true` when on the first page. */
  isFirst: boolean;
  /** `true` when on the last page. */
  isLast: boolean;
}

/**
 * Derive a complete, clamped pagination snapshot from a total item count, a
 * (possibly out-of-range) page and a page size. Pure — no side effects.
 *
 * @example
 * getPaginationState({ totalItems: 95, page: 3, pageSize: 10 }).startIndex; // 20
 */
export function getPaginationState(input: {
  totalItems: number;
  page: number;
  pageSize: number;
}): PaginationState {
  const totalItems = Math.max(0, Math.floor(input.totalItems || 0));
  const pageSize = Math.max(1, Math.floor(input.pageSize || 1));
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clamp(Math.floor(input.page || 1), 1, pageCount);

  const startIndex = (page - 1) * pageSize;
  const itemCountOnPage =
    totalItems === 0 ? 0 : Math.min(pageSize, totalItems - startIndex);
  const endIndex = itemCountOnPage === 0 ? -1 : startIndex + itemCountOnPage - 1;

  return {
    page,
    pageSize,
    pageCount,
    totalItems,
    startIndex,
    endIndex,
    itemCountOnPage,
    hasPrev: page > 1,
    hasNext: page < pageCount,
    isFirst: page === 1,
    isLast: page === pageCount,
  };
}

/** A pagination control token: a 1-based page number, or an ellipsis gap. */
export type PaginationToken = number | "…";

/**
 * Build a compact pagination control range with ellipsis gaps — e.g.
 * `[1, "…", 4, 5, 6, "…", 20]`. `siblings` is the number of pages shown on
 * each side of the current page; `boundaries` is how many pages are pinned at
 * each end. Pure and DOM-free.
 *
 * @example
 * getPaginationRange(6, 20); // [1, "…", 5, 6, 7, "…", 20]
 */
export function getPaginationRange(
  page: number,
  pageCount: number,
  options: { siblings?: number; boundaries?: number } = {},
): PaginationToken[] {
  const total = Math.max(1, Math.floor(pageCount || 1));
  const current = clamp(Math.floor(page || 1), 1, total);
  const siblings = Math.max(0, Math.floor(options.siblings ?? 1));
  const boundaries = Math.max(1, Math.floor(options.boundaries ?? 1));

  // If every page fits, list them all.
  const totalShown = boundaries * 2 + siblings * 2 + 3;
  if (total <= totalShown) {
    return range(1, total);
  }

  const leftSibling = Math.max(current - siblings, boundaries + 2);
  const rightSibling = Math.min(current + siblings, total - boundaries - 1);

  const showLeftGap = leftSibling > boundaries + 2;
  const showRightGap = rightSibling < total - boundaries - 1;

  const tokens: PaginationToken[] = [];
  tokens.push(...range(1, boundaries));
  if (showLeftGap) tokens.push("…");
  else tokens.push(...range(boundaries + 1, leftSibling - 1));
  tokens.push(...range(leftSibling, rightSibling));
  if (showRightGap) tokens.push("…");
  else tokens.push(...range(rightSibling + 1, total - boundaries));
  tokens.push(...range(total - boundaries + 1, total));

  return tokens;
}

/** Inclusive integer range `[from, to]`; empty when `from > to`. */
function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Stepper / wizard math                                                        */
/* -------------------------------------------------------------------------- */

/** Clamp a 0-based step index into `[0, count - 1]` (or `0` when `count <= 0`). */
export function clampStep(step: number, count: number): number {
  if (count <= 0) return 0;
  return clamp(Math.floor(step || 0), 0, count - 1);
}

/**
 * Advance a step. With `loop`, wraps past the ends; otherwise saturates.
 *
 * @example
 * moveStep(2, 3, +1, true); // 0 (wrapped)
 */
export function moveStep(step: number, count: number, delta: number, loop = false): number {
  if (count <= 0) return 0;
  const raw = Math.floor(step || 0) + Math.floor(delta || 0);
  if (loop) return ((raw % count) + count) % count;
  return clamp(raw, 0, count - 1);
}

/**
 * Progress through a stepper as a `0..1` fraction. A single-step (or empty)
 * flow is always fully complete (`1`).
 *
 * @example
 * stepProgress(1, 5); // 0.25
 */
export function stepProgress(step: number, count: number): number {
  if (count <= 1) return 1;
  return clamp(Math.floor(step || 0), 0, count - 1) / (count - 1);
}

/* -------------------------------------------------------------------------- */
/*  Undo / redo history buffer                                                  */
/* -------------------------------------------------------------------------- */

/** An immutable undo/redo history: `past` (oldest→newest), `present`, `future`. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Max number of entries kept in `past` (`0` = unbounded). */
  limit: number;
}

/** Create a fresh history rooted at `present`. `limit` of `0` is unbounded. */
export function createHistory<T>(present: T, limit = 0): History<T> {
  return { past: [], present, future: [], limit: Math.max(0, Math.floor(limit || 0)) };
}

/** `true` when there is at least one past entry to undo to. */
export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

/** `true` when there is at least one future entry to redo to. */
export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

/**
 * Push a new present, moving the old present into `past` and clearing `future`.
 * Honours `limit` by dropping the oldest past entries. Returns the same object
 * when `next` equals the current present (referential/`Object.is` equality).
 */
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h;
  let past = [...h.past, h.present];
  if (h.limit > 0 && past.length > h.limit) {
    past = past.slice(past.length - h.limit);
  }
  return { past, present: next, future: [], limit: h.limit };
}

/** Step one entry back into the past (no-op when there is nothing to undo). */
export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1] as T;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
    limit: h.limit,
  };
}

/** Step one entry forward into the future (no-op when there is nothing to redo). */
export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0] as T;
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
    limit: h.limit,
  };
}

/** Reset the history to a single present, discarding past and future. */
export function resetHistory<T>(h: History<T>, present: T): History<T> {
  return { past: [], present, future: [], limit: h.limit };
}

/* -------------------------------------------------------------------------- */
/*  Immutable list operations                                                   */
/* -------------------------------------------------------------------------- */

/** Clamp an insertion index into `[0, length]`; negatives count from the end. */
function normalizeInsertIndex(index: number, length: number): number {
  let i = Math.floor(index || 0);
  if (i < 0) i += length;
  return clamp(i, 0, length);
}

/** Clamp an access index into `[0, length - 1]`; negatives count from the end. */
function normalizeAccessIndex(index: number, length: number): number {
  let i = Math.floor(index || 0);
  if (i < 0) i += length;
  return clamp(i, 0, Math.max(0, length - 1));
}

/** Return a copy of `arr` with `items` inserted at `index`. */
export function listInsert<T>(arr: readonly T[], index: number, ...items: T[]): T[] {
  const i = normalizeInsertIndex(index, arr.length);
  return [...arr.slice(0, i), ...items, ...arr.slice(i)];
}

/** Return a copy of `arr` with the element at `index` removed. */
export function listRemoveAt<T>(arr: readonly T[], index: number): T[] {
  if (arr.length === 0) return [...arr];
  const i = normalizeAccessIndex(index, arr.length);
  return [...arr.slice(0, i), ...arr.slice(i + 1)];
}

/** Return a copy of `arr` with the element at `index` replaced or updated. */
export function listUpdateAt<T>(
  arr: readonly T[],
  index: number,
  value: T | ((prev: T) => T),
): T[] {
  if (arr.length === 0) return [...arr];
  const i = normalizeAccessIndex(index, arr.length);
  const prev = arr[i] as T;
  const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
  const out = [...arr];
  out[i] = next;
  return out;
}

/** Return a copy of `arr` with the element at `from` moved to `to`. */
export function listMove<T>(arr: readonly T[], from: number, to: number): T[] {
  if (arr.length < 2) return [...arr];
  const src = normalizeAccessIndex(from, arr.length);
  const dst = normalizeAccessIndex(to, arr.length);
  if (src === dst) return [...arr];
  const out = [...arr];
  const [moved] = out.splice(src, 1);
  out.splice(dst, 0, moved as T);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  CSS media-query string builders                                             */
/* -------------------------------------------------------------------------- */

/** Options accepted by {@link buildMediaQuery}. Numeric sizes are treated as px. */
export interface MediaQueryOptions {
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  orientation?: "portrait" | "landscape";
  prefersDark?: boolean;
  prefersLight?: boolean;
  prefersReducedMotion?: boolean;
  type?: "screen" | "print" | "all";
}

function toLength(v: number | string): string {
  return typeof v === "number" ? `${v}px` : v;
}

/**
 * Compose a CSS media-query string from structured options. Feature clauses are
 * joined with `and`; an optional media `type` is prefixed. Returns `"all"` when
 * no clause is given. Pure string building — never touches `matchMedia`.
 *
 * @example
 * buildMediaQuery({ minWidth: 768, maxWidth: 1024 });
 * // "(min-width: 768px) and (max-width: 1024px)"
 */
export function buildMediaQuery(options: MediaQueryOptions): string {
  const clauses: string[] = [];
  if (options.minWidth != null) clauses.push(`(min-width: ${toLength(options.minWidth)})`);
  if (options.maxWidth != null) clauses.push(`(max-width: ${toLength(options.maxWidth)})`);
  if (options.minHeight != null) clauses.push(`(min-height: ${toLength(options.minHeight)})`);
  if (options.maxHeight != null) clauses.push(`(max-height: ${toLength(options.maxHeight)})`);
  if (options.orientation) clauses.push(`(orientation: ${options.orientation})`);
  if (options.prefersDark) clauses.push(`(prefers-color-scheme: dark)`);
  if (options.prefersLight) clauses.push(`(prefers-color-scheme: light)`);
  if (options.prefersReducedMotion) clauses.push(`(prefers-reduced-motion: reduce)`);

  const type = options.type && options.type !== "all" ? options.type : "";
  if (clauses.length === 0) return type || "all";
  return type ? `${type} and ${clauses.join(" and ")}` : clauses.join(" and ");
}

/** `(min-width: …)` query. */
export function minWidthQuery(width: number | string): string {
  return `(min-width: ${toLength(width)})`;
}

/** `(max-width: …)` query. */
export function maxWidthQuery(width: number | string): string {
  return `(max-width: ${toLength(width)})`;
}

/** `(min-width: …) and (max-width: …)` query for an inclusive width band. */
export function betweenWidthQuery(min: number | string, max: number | string): string {
  return `(min-width: ${toLength(min)}) and (max-width: ${toLength(max)})`;
}
