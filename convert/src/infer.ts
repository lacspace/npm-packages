/**
 * Conservative type inference for text-sourced rows.
 *
 * A column is converted only when EVERY non-blank cell in it is a string that
 * agrees on the same type (all numbers, all booleans or all dates). Blank cells
 * in a converted column become `null`. Leading-zero numbers ("007"), very long
 * digit runs (IDs) and mixed columns stay strings.
 */
import type { Row, ColumnSchema, ColumnType } from "./types";
import { columnsOf, isDate, isPlainObject, safeSet } from "./util";

const NUMBER_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/;
const DMY_DATE_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Parse a numeric-looking string, or return `undefined` if it isn't one. */
export function parseNumber(s: string): number | undefined {
  const t = s.trim();
  if (!NUMBER_RE.test(t)) return undefined;
  if (/^[-+]?0\d/.test(t)) return undefined; // "007" — keep as text
  if (/^[-+]?\d{16,}$/.test(t)) return undefined; // long IDs lose precision
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse "true"/"false" (any case), or return `undefined`. */
export function parseBoolean(s: string): boolean | undefined {
  const t = s.trim().toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return undefined;
}

/** Parse an ISO (`2024-01-05`, `2024-01-05T10:30:00Z`) or `dd-mm-yyyy` date, or return `undefined`. */
export function parseDate(s: string): Date | undefined {
  const t = s.trim();
  let m = ISO_DATE_RE.exec(t);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    if (m[4] === undefined) return checkDate(new Date(Date.UTC(y, mo - 1, d)), y, mo, d);
    if (m[8] === undefined) {
      // No zone → treat as UTC so round trips are stable across machines.
      const dt = new Date(Date.UTC(y, mo - 1, d, Number(m[4]), Number(m[5]), Number(m[6] ?? 0), Number((m[7] ?? "0").padEnd(3, "0"))));
      return checkDate(dt, y, mo, d);
    }
    const dt = new Date(t.replace(" ", "T"));
    return Number.isNaN(dt.getTime()) ? undefined : dt;
  }
  m = DMY_DATE_RE.exec(t);
  if (m) {
    let d = Number(m[1]), mo = Number(m[2]);
    const y = Number(m[3]);
    if (d <= 12 && mo > 12) [d, mo] = [mo, d]; // unmistakably mm-dd-yyyy
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    return checkDate(new Date(Date.UTC(y, mo - 1, d)), y, mo, d);
  }
  return undefined;
}

function checkDate(dt: Date, y: number, mo: number, d: number): Date | undefined {
  if (Number.isNaN(dt.getTime())) return undefined;
  // reject overflow like 2024-02-31
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : undefined;
}

/** Best-effort single-cell coercion (used by the streaming iterator). */
export function inferCell(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const n = parseNumber(v);
  if (n !== undefined) return n;
  const b = parseBoolean(v);
  if (b !== undefined) return b;
  const d = parseDate(v);
  if (d !== undefined) return d;
  return v;
}

/**
 * Convert numeric / boolean / date strings to typed values, per column, only
 * when the whole column agrees. Returns new rows; the input is untouched.
 *
 * @example
 * inferTypes([{ n: "1", ok: "true", at: "2024-01-05" }]);
 * // [{ n: 1, ok: true, at: Date(2024-01-05T00:00:00Z) }]
 */
export function inferTypes(rows: Row[]): Row[] {
  if (rows.length === 0) return [];
  const cols = columnsOf(rows);
  const plan = new Map<string, (s: string) => unknown>();
  for (const c of cols) {
    let kind: "number" | "boolean" | "date" | "none" | undefined;
    let allStrings = true;
    let sawValue = false;
    for (const r of rows) {
      const v = r[c];
      if (isBlank(v)) continue;
      if (typeof v !== "string") { allStrings = false; break; }
      sawValue = true;
      const k: "number" | "boolean" | "date" | "none" =
        parseNumber(v) !== undefined ? "number" : parseBoolean(v) !== undefined ? "boolean" : parseDate(v) !== undefined ? "date" : "none";
      if (kind === undefined) kind = k;
      else if (kind !== k) { kind = "none"; }
      if (kind === "none") break;
    }
    if (!allStrings || !sawValue || kind === undefined || kind === "none") continue;
    plan.set(c, kind === "number" ? (s) => parseNumber(s) : kind === "boolean" ? (s) => parseBoolean(s) : (s) => parseDate(s));
  }
  return rows.map((r) => {
    const out: Row = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      const fn = plan.get(k);
      if (fn && isBlank(v)) safeSet(out, k, null);
      else if (fn && typeof v === "string") safeSet(out, k, fn(v));
      else safeSet(out, k, v);
    }
    return out;
  });
}

function typeOfValue(v: unknown): ColumnType {
  if (v === null || v === undefined) return "null";
  if (isDate(v)) return "date";
  if (typeof v === "number" || typeof v === "bigint") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  if (Array.isArray(v) || isPlainObject(v) || typeof v === "object") return "object";
  return "string";
}

/**
 * Describe the columns of a row set: dominant type, nullability and a few
 * sample values. Mixed columns report `"string"`.
 *
 * @example
 * inferSchema([{ id: 1, name: "Ada" }, { id: 2, name: null }]);
 * // [{ name: "id", type: "number", nullable: false, samples: [1, 2] },
 * //  { name: "name", type: "string", nullable: true, samples: ["Ada"] }]
 */
export function inferSchema(rows: Row[], opts: { samples?: number } = {}): ColumnSchema[] {
  const max = opts.samples ?? 3;
  return columnsOf(rows).map((name) => {
    const counts = new Map<ColumnType, number>();
    let nullable = false;
    const samples: unknown[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const v = r[name];
      const t = typeOfValue(v);
      if (t === "null") { nullable = true; continue; }
      counts.set(t, (counts.get(t) ?? 0) + 1);
      if (samples.length < max) {
        const key = isDate(v) ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
        if (!seen.has(key)) { seen.add(key); samples.push(v); }
      }
    }
    let type: ColumnType = "null";
    if (counts.size === 1) type = [...counts.keys()][0]!;
    else if (counts.size > 1) type = "string";
    return { name, type, nullable, samples };
  });
}
