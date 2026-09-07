/**
 * The json-server-style query engine for db-backed list endpoints. Given a
 * collection (array of records) and a parsed query object, it applies, in
 * order: field filters + operators + full-text `q`, then sorting, then
 * pagination — and reports the total match count for `X-Total-Count`.
 *
 * Supported query params:
 *   ?field=value            exact match (repeatable → any-of)
 *   ?field_ne=value         not equal
 *   ?field_gt / _gte        greater (or equal)
 *   ?field_lt / _lte        less (or equal)
 *   ?field_like=foo         case-insensitive regex/substring match
 *   ?q=text                 full-text search across all string fields
 *   ?_sort=a,b&_order=asc,desc  multi-key sort
 *   ?_page=2&_limit=10      pagination (1-based page)
 *   ?_start=10&_end=20      slice (alternative to _page)
 *   ?_start=10&_limit=5     slice by offset+count
 */

/** A single record in a collection. */
export type Record_ = Record<string, unknown>;

/** Query params for a list request. Repeated keys arrive as arrays. */
export type Query = Record<string, string | string[]>;

/** Outcome of running the engine over a collection. */
export interface QueryResult {
  data: Record_[];
  /** Total matches *before* pagination — for the `X-Total-Count` header. */
  total: number;
}

const RESERVED = new Set(["_sort", "_order", "_page", "_limit", "_start", "_end", "q", "callback"]);

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}
function all(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Coerce a query string to the type of the sample field value for comparison. */
function coerce(raw: string, sample: unknown): string | number | boolean {
  if (typeof sample === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (typeof sample === "boolean") return raw === "true";
  return raw;
}

function numify(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
}

function fieldValue(record: Record_, field: string): unknown {
  // Support nested dotted fields for filtering (a.b.c).
  if (!field.includes(".")) return record[field];
  let cur: unknown = record;
  for (const key of field.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function textOf(record: Record_): string {
  return JSON.stringify(record).toLowerCase();
}

function matchesFilter(record: Record_, key: string, raw: string): boolean {
  // Operator suffixes.
  for (const [suffix, op] of [
    ["_gte", "gte"], ["_lte", "lte"], ["_gt", "gt"], ["_lt", "lt"],
    ["_ne", "ne"], ["_like", "like"],
  ] as const) {
    if (key.endsWith(suffix)) {
      const field = key.slice(0, -suffix.length);
      const val = fieldValue(record, field);
      if (op === "like") {
        const s = val == null ? "" : String(val);
        try {
          return new RegExp(raw, "i").test(s);
        } catch {
          return s.toLowerCase().includes(raw.toLowerCase());
        }
      }
      if (op === "ne") return String(val) !== String(coerce(raw, val));
      const a = numify(val);
      const b = Number(raw);
      const numeric = !Number.isNaN(a) && !Number.isNaN(b);
      if (op === "gt") return numeric ? a > b : String(val) > raw;
      if (op === "gte") return numeric ? a >= b : String(val) >= raw;
      if (op === "lt") return numeric ? a < b : String(val) < raw;
      if (op === "lte") return numeric ? a <= b : String(val) <= raw;
    }
  }
  // Plain equality.
  const val = fieldValue(record, key);
  return String(val) === String(coerce(raw, val));
}

function compare(a: unknown, b: unknown): number {
  const na = numify(a);
  const nb = numify(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const sa = a == null ? "" : String(a);
  const sb = b == null ? "" : String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Run filters, sort and pagination over a collection. */
export function runQuery(collection: readonly Record_[], query: Query): QueryResult {
  let rows = collection.slice();

  // 1. Full-text search.
  const q = first(query["q"]);
  if (q && q.length) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => textOf(r).includes(needle));
  }

  // 2. Field filters + operators. Repeated same-key values = OR (any-of).
  for (const [key, rawVal] of Object.entries(query)) {
    if (RESERVED.has(key)) continue;
    const values = all(rawVal);
    if (values.length === 0) continue;
    rows = rows.filter((r) => values.some((v) => matchesFilter(r, key, v)));
  }

  const total = rows.length;

  // 3. Sort (multi-key).
  const sortKeys = first(query["_sort"]);
  if (sortKeys) {
    const keys = sortKeys.split(",").map((s) => s.trim()).filter(Boolean);
    const orders = (first(query["_order"]) ?? "").split(",").map((s) => s.trim().toLowerCase());
    rows.sort((a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        const dir = (orders[i] ?? orders[0] ?? "asc") === "desc" ? -1 : 1;
        const cmp = compare(fieldValue(a, k), fieldValue(b, k));
        if (cmp !== 0) return cmp * dir;
      }
      return 0;
    });
  }

  // 4. Pagination / slice.
  const page = toInt(first(query["_page"]));
  const limit = toInt(first(query["_limit"]));
  const start = toInt(first(query["_start"]));
  const end = toInt(first(query["_end"]));

  let data = rows;
  if (page !== undefined) {
    const lim = limit ?? 10;
    const from = (Math.max(1, page) - 1) * lim;
    data = rows.slice(from, from + lim);
  } else if (start !== undefined) {
    if (end !== undefined) data = rows.slice(start, end);
    else if (limit !== undefined) data = rows.slice(start, start + limit);
    else data = rows.slice(start);
  } else if (limit !== undefined) {
    data = rows.slice(0, limit);
  }

  return { data, total };
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Parse a raw query string into a {@link Query} (repeated keys → arrays). */
export function parseQueryString(search: string): Query {
  const out: Query = {};
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of params) {
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing, v];
  }
  return out;
}
