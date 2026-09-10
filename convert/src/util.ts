/**
 * Shared helpers: JSON value types, prototype-pollution-safe object building,
 * type classification, text decoding and Excel date-serial maths.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Error thrown for unparseable input, unknown formats and unsupported shapes. */
export class ConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvertError";
  }
}

/** Keys that must never be assigned from untrusted input. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** True if `key` is unsafe to set on a plain object built from external input. */
export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

/** Assign `key = value` on a plain object, silently ignoring prototype-pollution keys. */
export function safeSet(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (isForbiddenKey(key)) return;
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

/** True for a plain object literal (not an array, Date, typed array, class instance …). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export function isDate(v: unknown): v is Date {
  return v instanceof Date;
}

/** Bytes → string (UTF-8), stripping a leading BOM. */
export function decodeText(input: string | Uint8Array): string {
  const text = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/* ------------------------------ dates ------------------------------ */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** JS Date → Excel serial day number (1900 date system). */
export function dateToExcelSerial(d: Date): number {
  return (d.getTime() - EXCEL_EPOCH_MS) / DAY_MS;
}

/** Excel serial day number → JS Date (UTC). */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round(EXCEL_EPOCH_MS + serial * DAY_MS));
}

/** Date → ISO string; date-only values (UTC midnight) print as `YYYY-MM-DD`. */
export function dateToIso(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

export type DateFormat = "iso" | "excel" | "keep";

/**
 * Normalise a cell value for text output: Dates → ISO / Excel serial, nested
 * objects → JSON text (unless `nested` is `"keep"`), `undefined` → `null`.
 */
export function plainValue(v: unknown, dateFormat: DateFormat = "iso", nested: "json" | "keep" = "keep"): JsonValue {
  if (v === undefined || v === null) return null;
  if (isDate(v)) {
    if (dateFormat === "excel") return dateToExcelSerial(v);
    return dateToIso(v);
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) {
    const arr = v.map((x) => plainValue(x, dateFormat, nested));
    return nested === "json" ? JSON.stringify(arr) : arr;
  }
  if (typeof v === "object") {
    const out: JsonObject = {};
    for (const k of Object.keys(v as Record<string, unknown>)) safeSet(out, k, plainValue((v as Record<string, unknown>)[k], dateFormat, nested));
    return nested === "json" ? JSON.stringify(out) : out;
  }
  return String(v);
}

/** Cell → string for CSV / Markdown / HTML output. */
export function cellText(v: unknown, dateFormat: DateFormat = "iso"): string {
  const p = plainValue(v, dateFormat, "json");
  if (p === null) return "";
  if (typeof p === "string") return p;
  if (typeof p === "object") return JSON.stringify(p);
  return String(p);
}

/** Union of keys across rows, in first-seen order. */
export function columnsOf(rows: ReadonlyArray<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function unescapeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[ent] ?? m;
  });
}
