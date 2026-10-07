/**
 * Gmail-style search box parser. Turns
 *   invoice from:anita has:attachment is:unread after:2026-09-01 -label:done
 * into a neutral AST that any backend (Mongo, SQL, IMAP SEARCH, an in-memory
 * array) can compile. Never throws.
 */

export type SearchOp = "eq" | "contains" | "before" | "after" | "gt" | "lt" | "has" | "is" | "in";

export type SearchField =
  | "text"
  | "from"
  | "to"
  | "cc"
  | "subject"
  | "filename"
  | "label"
  | "category"
  | "in"
  | "has"
  | "is"
  | "date"
  | "size";

export interface SearchClause {
  /** What to compare. Built-in fields are listed in `SearchField`; your own ASTs may use any string. */
  field: string;
  op: SearchOp;
  value: string | number | boolean | Date;
  negated: boolean;
  /** The operator the user typed, lowercased ("from", "older_than", "until" …). Absent for free text. */
  operator?: string;
  /** The value as typed, for date and size operators. `toQueryString` prefers it; delete it if you change `value`. */
  raw?: string;
  /** True for a "quoted phrase" free-text term. */
  phrase?: boolean;
}

export interface SearchAst {
  /** The positive, top-level free-text terms joined by spaces (a convenience; each term is also a `text` clause). */
  text: string;
  /** Clauses that must ALL match. */
  clauses: SearchClause[];
  /** Each group is an OR of clauses; every group must match (AND between groups and `clauses`). */
  orGroups: SearchClause[][];
  /** Problems found while parsing (bad dates, sizes, dangling OR …). Bad operator values also fall back to text. */
  errors: string[];
}

export interface ParseOptions {
  /** Reference time for newer_than:, older_than:, today, yesterday and relative dates. Default: now. */
  now?: Date | number;
}

const DAY = 86_400_000;

/** Canonical `is:` values and their accepted synonyms. */
export const IS_VALUES: Readonly<Record<string, string>> = Object.freeze({
  unread: "unread",
  read: "read",
  seen: "read",
  starred: "starred",
  flagged: "starred",
  replied: "replied",
  answered: "replied",
  suspicious: "suspicious",
  risky: "suspicious",
  phishing: "suspicious",
  verified: "verified",
  list: "list",
  newsletter: "list",
  bulk: "list",
  important: "important",
  priority: "important",
});

/** Canonical `has:` values and their accepted synonyms. */
export const HAS_VALUES: Readonly<Record<string, string>> = Object.freeze({
  attachment: "attachment",
  attachments: "attachment",
  file: "attachment",
  files: "attachment",
});

interface Token {
  neg: boolean;
  key?: string;
  value: string;
  quoted: boolean;
  /** The token as written, minus a leading "-" */
  text: string;
}

function tokenize(q: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = q.length;
  const isWs = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
  while (i < n) {
    while (i < n && isWs(q[i])) i++;
    if (i >= n) break;
    let neg = false;
    if (q[i] === "-" && i + 1 < n && !isWs(q[i + 1]) && q[i + 1] !== "-") {
      neg = true;
      i++;
    }
    const start = i;
    if (q[i] === '"') {
      const end = q.indexOf('"', i + 1);
      const stop = end === -1 ? n : end;
      const value = q.slice(i + 1, stop);
      i = end === -1 ? n : end + 1;
      out.push({ neg, value, quoted: true, text: q.slice(start, i) });
      continue;
    }
    const km = /^(\w+):/.exec(q.slice(i));
    if (km && km[1]) {
      const key = km[1];
      i += key.length + 1;
      if (q[i] === '"') {
        const end = q.indexOf('"', i + 1);
        const stop = end === -1 ? n : end;
        const value = q.slice(i + 1, stop);
        i = end === -1 ? n : end + 1;
        out.push({ neg, key, value, quoted: true, text: q.slice(start, i) });
        continue;
      }
      const vs = i;
      while (i < n && !isWs(q[i])) i++;
      out.push({ neg, key, value: q.slice(vs, i), quoted: false, text: q.slice(start, i) });
      continue;
    }
    while (i < n && !isWs(q[i])) i++;
    out.push({ neg, value: q.slice(start, i), quoted: false, text: q.slice(start, i) });
  }
  return out;
}

function toTime(now: Date | number | undefined): number {
  if (now instanceof Date) return Number.isNaN(now.getTime()) ? Date.now() : now.getTime();
  if (typeof now === "number" && Number.isFinite(now)) return now;
  return Date.now();
}

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** Subtract `n` units (d/w/m/y) from a timestamp, using UTC calendar months/years. */
export function subtractPeriod(ms: number, n: number, unit: string): number {
  const d = new Date(ms);
  if (unit === "d") return ms - n * DAY;
  if (unit === "w") return ms - 7 * n * DAY;
  if (unit === "m") {
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.getTime();
  }
  if (unit === "y") {
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.getTime();
  }
  return NaN;
}

/**
 * Parse a day for before:/after:. Accepts YYYY-MM-DD, YYYY/MM/DD (one- or two-digit
 * month and day), `today`, `yesterday`, and relative `7d` / `2w` / `3m` / `1y` (counted
 * back from the start of today). Returns midnight UTC, or null when invalid.
 */
export function parseDay(value: string, now?: Date | number): Date | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const today = startOfUtcDay(toTime(now));
  if (v === "today") return new Date(today);
  if (v === "yesterday") return new Date(today - DAY);
  const rel = /^(\d{1,5})([dwmy])$/.exec(v);
  if (rel && rel[1] && rel[2]) {
    const t = subtractPeriod(today, Number(rel[1]), rel[2]);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null; // e.g. 2026-02-31
  return check;
}

/** Parse "5mb", "500K", "1.5G", "2048" into bytes (1K = 1024). Returns null when invalid. */
export function parseSize(value: string): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|k|mb|m|gb|g)?$/.exec(value.trim().toLowerCase());
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  const u = m[2] ?? "b";
  const mult = u.startsWith("k") ? 1024 : u.startsWith("m") ? 1024 ** 2 : u.startsWith("g") ? 1024 ** 3 : 1;
  const bytes = Math.round(n * mult);
  return Number.isFinite(bytes) ? bytes : null;
}

/** Every operator parseSearch understands. Anything else is free text. */
export const OPERATORS: ReadonlySet<string> = new Set([
  "from", "to", "cc", "subject", "filename", "label", "category", "in", "has", "is",
  "before", "after", "since", "until", "newer_than", "older_than", "larger", "smaller",
]);

const CONTAINS_FIELDS = new Set(["from", "to", "cc", "subject", "filename"]);

/** Parse a search box string into a neutral AST. Never throws. */
export function parseSearch(q: string, options: ParseOptions = {}): SearchAst {
  const ast: SearchAst = { text: "", clauses: [], orGroups: [], errors: [] };
  if (typeof q !== "string") {
    if (q != null) ast.errors.push("query is not a string");
    return ast;
  }
  const nowMs = toTime(options && typeof options === "object" ? options.now : undefined);
  const groups: SearchClause[][] = [];
  let pendingOr = false;

  const push = (c: SearchClause) => {
    const last = groups[groups.length - 1];
    if (pendingOr && last) last.push(c);
    else groups.push([c]);
    pendingOr = false;
  };
  const asText = (tok: Token, value?: string) => {
    const v = value ?? (tok.key ? `${tok.key}:${tok.value}` : tok.value);
    if (!v.trim()) return;
    const c: SearchClause = { field: "text", op: "contains", value: v, negated: tok.neg };
    if (tok.quoted && !tok.key) c.phrase = true;
    push(c);
  };

  for (const tok of tokenize(q)) {
    if (!tok.key && !tok.quoted && !tok.neg && tok.value === "OR") {
      if (!groups.length) ast.errors.push("OR needs a term on its left");
      else pendingOr = true;
      continue;
    }
    if (!tok.key) {
      asText(tok);
      continue;
    }
    const key = tok.key.toLowerCase();
    const val = tok.value.trim();
    if (!OPERATORS.has(key)) {
      asText(tok);
      continue;
    }
    if (!val) {
      ast.errors.push(`${key}: needs a value`);
      continue;
    }
    const base = { negated: tok.neg, operator: key };
    if (CONTAINS_FIELDS.has(key)) {
      push({ field: key, op: "contains", value: val, ...base });
    } else if (key === "label") {
      push({ field: "label", op: "eq", value: val, ...base });
    } else if (key === "category") {
      push({ field: "category", op: "eq", value: val.toLowerCase(), ...base });
    } else if (key === "in") {
      push({ field: "in", op: "in", value: val, ...base });
    } else if (key === "has") {
      const v = HAS_VALUES[val.toLowerCase()];
      if (v) push({ field: "has", op: "has", value: v, ...base });
      else asText(tok);
    } else if (key === "is") {
      const v = IS_VALUES[val.toLowerCase()];
      if (v) push({ field: "is", op: "is", value: v, ...base });
      else asText(tok);
    } else if (key === "before" || key === "after" || key === "since" || key === "until") {
      const d = parseDay(val, nowMs);
      if (!d) {
        ast.errors.push(`${key}: "${val}" is not a date (use YYYY-MM-DD or YYYY/MM/DD)`);
        asText(tok);
        continue;
      }
      // until: is inclusive of the named day, as in the original app
      if (key === "until") push({ field: "date", op: "before", value: new Date(d.getTime() + DAY), raw: val, ...base });
      else push({ field: "date", op: key === "before" ? "before" : "after", value: d, raw: val, ...base });
    } else if (key === "newer_than" || key === "older_than") {
      const m = /^(\d{1,5})([dwmy])$/i.exec(val);
      const t = m && m[1] && m[2] ? subtractPeriod(nowMs, Number(m[1]), m[2].toLowerCase()) : NaN;
      if (!Number.isFinite(t)) {
        ast.errors.push(`${key}: "${val}" is not a period (use e.g. 7d, 2w, 3m, 1y)`);
        asText(tok);
        continue;
      }
      push({ field: "date", op: key === "newer_than" ? "after" : "before", value: new Date(t), raw: val.toLowerCase(), ...base });
    } else {
      // larger / smaller
      const bytes = parseSize(val);
      if (bytes === null) {
        ast.errors.push(`${key}: "${val}" is not a size (use e.g. 500K or 5M)`);
        asText(tok);
        continue;
      }
      push({ field: "size", op: key === "larger" ? "gt" : "lt", value: bytes, raw: val, ...base });
    }
  }
  if (pendingOr) ast.errors.push("OR needs a term on its right");

  for (const g of groups) {
    if (g.length === 1 && g[0]) ast.clauses.push(g[0]);
    else ast.orGroups.push(g);
  }
  ast.text = ast.clauses
    .filter((c) => c.field === "text" && !c.negated)
    .map((c) => String(c.value))
    .join(" ")
    .trim();
  return ast;
}
