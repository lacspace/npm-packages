/**
 * @lacspace/formula
 *
 * A small, safe spreadsheet formula language: a hand-written tokeniser and
 * recursive-descent parser over a fixed function whitelist. Deliberately no
 * dynamic code execution of any kind — a formula is user input that runs in
 * other people's browsers, so the parser is a security boundary, and a test
 * scans this file for the two dangerous JS forms and fails the build if either
 * ever appears.
 *
 * Scope model (row-scoped): bare names read the current row's field
 * (`price * 2`), aggregates read a whole column (`SUM(price)`), and
 * `[Bracketed Name]` lets a column label contain spaces.
 *
 * Grammar:
 *   expr    := compare
 *   compare := sum (("="|"<>"|"<"|"<="|">"|">=") sum)*
 *   sum     := product (("+"|"-"|"&") product)*
 *   product := unary (("*"|"/"|"^") unary)*
 *   unary   := "-"? primary ("%")?
 *   primary := number | string | ref | func "(" args ")" | "(" expr ")"
 *
 * @example
 * import { compile, run, computeColumn } from "@lacspace/formula";
 *
 * const margin = compile("=IF(price=0, 0, (price - cost) / price * 100)");
 * margin({ field: (n) => row[n], column: (n) => rows.map((r) => r[n]) });
 *
 * // Or evaluate a formula down a whole table in one call:
 * computeColumn("=price * qty", rows); // one value per row
 */

/* ------------------------------ scope ------------------------------ */

/** Where a formula reads its data from. */
export interface Scope {
  /** A column's value on the current row: `price`, or `[Sale Price]`. */
  field: (name: string) => unknown;
  /** Every value in a column, for aggregates and lookups: `SUM(price)`. */
  column: (name: string) => unknown[];
}

export class FormulaError extends Error {
  readonly code = "formula";
  readonly position: number | undefined;
  constructor(message: string, position?: number) {
    super(message);
    this.name = "FormulaError";
    this.position = position;
  }
}

/* ------------------------------ tokens ------------------------------ */

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "str"; value: string; pos: number }
  | { kind: "name"; value: string; pos: number }
  | { kind: "op"; value: string; pos: number }
  | { kind: "punc"; value: string; pos: number };

function tokenise(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i += 1; continue; }

    if ((c >= "0" && c <= "9") || (c === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j += 1;
      // 1e3 / 2.5E-2 scientific notation.
      if ((input[j] === "e" || input[j] === "E") && /[0-9+-]/.test(input[j + 1] ?? "")) {
        j += 2;
        while (j < input.length && /[0-9]/.test(input[j]!)) j += 1;
      }
      const value = Number(input.slice(i, j));
      if (!Number.isFinite(value)) throw new FormulaError(`Bad number near "${input.slice(i, j)}"`, i);
      tokens.push({ kind: "num", value, pos: i });
      i = j;
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      let text = "";
      let closed = false;
      while (j < input.length) {
        if (input[j] === '"') {
          if (input[j + 1] === '"') { text += '"'; j += 2; continue; } // "" escapes a quote
          closed = true;
          break;
        }
        text += input[j];
        j += 1;
      }
      if (!closed) throw new FormulaError("Unclosed text value", i);
      tokens.push({ kind: "str", value: text, pos: i });
      i = j + 1;
      continue;
    }

    if (c === "[") {
      const end = input.indexOf("]", i);
      if (end === -1) throw new FormulaError("Unclosed [ in a column name", i);
      tokens.push({ kind: "name", value: input.slice(i + 1, end).trim(), pos: i });
      i = end + 1;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_.]/.test(input[j]!)) j += 1;
      tokens.push({ kind: "name", value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { tokens.push({ kind: "op", value: two, pos: i }); i += 2; continue; }
    if ("+-*/^&=<>%".includes(c)) { tokens.push({ kind: "op", value: c, pos: i }); i += 1; continue; }
    if ("(),;".includes(c)) { tokens.push({ kind: "punc", value: c === ";" ? "," : c, pos: i }); i += 1; continue; }

    throw new FormulaError(`Unexpected character "${c}"`, i);
  }
  return tokens;
}

/* ------------------------------ ast ------------------------------ */

type Node =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ref"; name: string }
  | { type: "call"; name: string; args: Node[]; pos: number }
  | { type: "unary"; op: string; operand: Node }
  | { type: "binary"; op: string; left: Node; right: Node };

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];
  const isOp = (...values: string[]) => { const t = peek(); return Boolean(t && t.kind === "op" && values.includes(t.value)); };
  const isPunc = (value: string) => { const t = peek(); return Boolean(t && t.kind === "punc" && t.value === value); };
  const expect = (value: string) => {
    const t = eat();
    if (!t || t.value !== value) throw new FormulaError(`Expected "${value}"`, t?.pos);
  };

  function primary(): Node {
    const t = eat();
    if (!t) throw new FormulaError("Formula ended unexpectedly");
    if (t.kind === "num") return { type: "num", value: t.value };
    if (t.kind === "str") return { type: "str", value: t.value };
    if (t.kind === "punc" && t.value === "(") { const inner = expr(); expect(")"); return inner; }
    if (t.kind === "op" && t.value === "-") return { type: "unary", op: "-", operand: primary() };
    if (t.kind === "name") {
      if (isPunc("(")) {
        eat();
        const args: Node[] = [];
        if (!isPunc(")")) {
          args.push(expr());
          while (isPunc(",")) { eat(); args.push(expr()); }
        }
        expect(")");
        return { type: "call", name: t.value.toUpperCase(), args, pos: t.pos };
      }
      return { type: "ref", name: t.value };
    }
    throw new FormulaError(`Unexpected "${t.value}"`, t.pos);
  }

  function unary(): Node {
    if (isOp("-")) { eat(); return { type: "unary", op: "-", operand: unary() }; }
    let node = primary();
    while (isOp("%")) { eat(); node = { type: "unary", op: "%", operand: node }; }
    return node;
  }
  function product(): Node {
    let left = unary();
    while (isOp("*", "/", "^")) { const op = String(eat()!.value); left = { type: "binary", op, left, right: unary() }; }
    return left;
  }
  function sum(): Node {
    let left = product();
    while (isOp("+", "-", "&")) { const op = String(eat()!.value); left = { type: "binary", op, left, right: product() }; }
    return left;
  }
  function expr(): Node {
    let left = sum();
    while (isOp("=", "<>", "<", "<=", ">", ">=")) { const op = String(eat()!.value); left = { type: "binary", op, left, right: sum() }; }
    return left;
  }

  if (tokens.length === 0) throw new FormulaError("Empty formula");
  const tree = expr();
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${tokens[pos]!.value}"`, tokens[pos]!.pos);
  return tree;
}

/* ------------------------------ helpers ------------------------------ */

/** Coerce anything to a number the way a spreadsheet does (blank → 0, "1,200" → 1200). */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  const cleaned = String(value).replace(/[^0-9.eE+-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
const num = toNumber;

/** Coerce anything to text (dates → ISO yyyy-mm-dd, null → ""). */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}
const text = toText;

/** Spreadsheet truthiness: 0, "", null, "false", "no" are false. */
export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null || value === undefined || value === "") return false;
  const t = String(value).trim().toLowerCase();
  return !(t === "false" || t === "no" || t === "0");
}
const truthy = toBoolean;

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return new Date(value);
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/** Flatten one level, so SUM(price) and SUM(1,2,3) both work. */
function flat(values: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const v of values) { if (Array.isArray(v)) out.push(...v); else out.push(v); }
  return out;
}
const numbers = (values: unknown[]) => flat(values).filter((v) => !isBlank(v)).map(num);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);

/** Compare a value against a criterion like 10, ">10", "<=5", "<>x", "Foods" or "a*" (wildcards). */
export function matches(value: unknown, criterion: unknown): boolean {
  const c = text(criterion).trim();
  const op = /^(<=|>=|<>|<|>|=)/.exec(c);
  if (op) {
    const rest = c.slice(op[0].length).trim();
    const a = num(value);
    const b = num(rest);
    switch (op[0]) {
      case ">": return a > b;
      case ">=": return a >= b;
      case "<": return a < b;
      case "<=": return a <= b;
      case "<>": return text(value).toLowerCase() !== rest.toLowerCase();
      default: return text(value).toLowerCase() === rest.toLowerCase();
    }
  }
  if (/[*?]/.test(c)) {
    const re = new RegExp("^" + c.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    return re.test(text(value));
  }
  return text(value).trim().toLowerCase() === c.toLowerCase();
}

/** Evaluate `range1, crit1, range2, crit2, …` pairs → the row indexes that satisfy all. */
function multiMatch(pairs: unknown[]): number[] {
  const ranges: unknown[][] = [];
  const crits: unknown[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) { ranges.push(list(pairs[i])); crits.push(pairs[i + 1]); }
  const len = Math.max(0, ...ranges.map((r) => r.length));
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) {
    if (ranges.every((r, k) => matches(r[i], crits[k]))) out.push(i);
  }
  return out;
}

const sortedNums = (a: unknown[]) => numbers(a).sort((x, y) => x - y);
const roundTo = (v: number, places: number, mode: "round" | "up" | "down") => {
  const factor = 10 ** places;
  const scaled = v * factor;
  // Nudge past binary noise so 2.675 rounds the way people expect.
  const eps = Math.abs(scaled) * Number.EPSILON * 4;
  const r = mode === "round" ? Math.round(Math.abs(scaled) + eps) * Math.sign(scaled)
    : mode === "up" ? Math.ceil(Math.abs(scaled) - eps) * Math.sign(scaled)
    : Math.trunc(Math.abs(scaled) + eps) * Math.sign(scaled);
  return r / factor;
};
const addMonths = (d: Date, months: number) => {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
};

/* ------------------------------ functions ------------------------------ */

export type FormulaFunction = (args: unknown[]) => unknown;

/** Every built-in function, by upper-case name. Extend with {@link registerFunction}. */
export const FUNCTIONS: Record<string, FormulaFunction> = {
  // -- maths
  SUM: (a) => numbers(a).reduce((x, y) => x + y, 0),
  AVERAGE: (a) => { const n = numbers(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : 0; },
  MIN: (a) => { const n = numbers(a); return n.length ? Math.min(...n) : 0; },
  MAX: (a) => { const n = numbers(a); return n.length ? Math.max(...n) : 0; },
  COUNT: (a) => flat(a).filter((v) => !isBlank(v) && (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))))).length,
  COUNTA: (a) => flat(a).filter((v) => !isBlank(v)).length,
  COUNTBLANK: (a) => flat(a).filter(isBlank).length,
  ROUND: ([v, d]) => roundTo(num(v), d === undefined ? 0 : num(d), "round"),
  ROUNDUP: ([v, d]) => roundTo(num(v), d === undefined ? 0 : num(d), "up"),
  ROUNDDOWN: ([v, d]) => roundTo(num(v), d === undefined ? 0 : num(d), "down"),
  FLOOR: ([v]) => Math.floor(num(v)),
  CEILING: ([v]) => Math.ceil(num(v)),
  INT: ([v]) => Math.floor(num(v)),
  TRUNC: ([v, d]) => roundTo(num(v), d === undefined ? 0 : num(d), "down"),
  ABS: ([v]) => Math.abs(num(v)),
  SIGN: ([v]) => Math.sign(num(v)),
  EVEN: ([v]) => { const n = num(v); const r = Math.ceil(Math.abs(n) / 2) * 2; return n < 0 ? -r : r; },
  ODD: ([v]) => { const n = num(v); let r = Math.ceil(Math.abs(n)); if (r % 2 === 0) r += 1; return n < 0 ? -r : r; },
  POWER: ([v, p]) => num(v) ** num(p),
  SQRT: ([v]) => Math.sqrt(num(v)),
  EXP: ([v]) => Math.exp(num(v)),
  LN: ([v]) => Math.log(num(v)),
  LOG: ([v, b]) => Math.log(num(v)) / Math.log(b === undefined ? 10 : num(b)),
  LOG10: ([v]) => Math.log10(num(v)),
  PI: () => Math.PI,
  MOD: ([v, d]) => (num(d) === 0 ? 0 : ((num(v) % num(d)) + num(d)) % num(d)),
  PRODUCT: (a) => numbers(a).reduce((x, y) => x * y, 1),
  MEDIAN: (a) => { const n = sortedNums(a); if (!n.length) return 0; const mid = Math.floor(n.length / 2); return n.length % 2 ? n[mid]! : (n[mid - 1]! + n[mid]!) / 2; },
  STDEV: (a) => { const n = numbers(a); if (n.length < 2) return 0; const m = n.reduce((x, y) => x + y, 0) / n.length; return Math.sqrt(n.reduce((s, v) => s + (v - m) ** 2, 0) / (n.length - 1)); },
  VAR: (a) => { const n = numbers(a); if (n.length < 2) return 0; const m = n.reduce((x, y) => x + y, 0) / n.length; return n.reduce((s, v) => s + (v - m) ** 2, 0) / (n.length - 1); },
  LARGE: ([range, k]) => { const n = sortedNums([range]).reverse(); return n[Math.max(0, num(k) - 1)] ?? 0; },
  SMALL: ([range, k]) => { const n = sortedNums([range]); return n[Math.max(0, num(k) - 1)] ?? 0; },
  RANK: ([v, range, order]) => {
    const n = numbers([range]);
    const x = num(v);
    const asc = truthy(order ?? false);
    return 1 + n.filter((y) => (asc ? y < x : y > x)).length;
  },
  SUMPRODUCT: (a) => {
    const cols = a.map(list);
    const len = Math.max(0, ...cols.map((c) => c.length));
    let total = 0;
    for (let i = 0; i < len; i += 1) total += cols.reduce((p, c) => p * num(c[i]), 1);
    return total;
  },

  // -- conditional aggregates
  SUMIF: ([range, criterion, sumRange]) => {
    const values = list(range); const targets = sumRange === undefined ? values : list(sumRange);
    let total = 0; values.forEach((v, i) => { if (matches(v, criterion)) total += num(targets[i]); }); return total;
  },
  COUNTIF: ([range, criterion]) => list(range).filter((v) => matches(v, criterion)).length,
  AVERAGEIF: ([range, criterion, avgRange]) => {
    const values = list(range); const targets = avgRange === undefined ? values : list(avgRange);
    const picked: number[] = []; values.forEach((v, i) => { if (matches(v, criterion)) picked.push(num(targets[i])); });
    return picked.length ? picked.reduce((x, y) => x + y, 0) / picked.length : 0;
  },
  SUMIFS: ([sumRange, ...pairs]) => { const t = list(sumRange); return multiMatch(pairs).reduce((s, i) => s + num(t[i]), 0); },
  COUNTIFS: (pairs) => multiMatch(pairs).length,
  AVERAGEIFS: ([avgRange, ...pairs]) => { const t = list(avgRange); const idx = multiMatch(pairs); return idx.length ? idx.reduce((s, i) => s + num(t[i]), 0) / idx.length : 0; },
  MAXIFS: ([range, ...pairs]) => { const t = list(range); const idx = multiMatch(pairs); return idx.length ? Math.max(...idx.map((i) => num(t[i]))) : 0; },
  MINIFS: ([range, ...pairs]) => { const t = list(range); const idx = multiMatch(pairs); return idx.length ? Math.min(...idx.map((i) => num(t[i]))) : 0; },

  // -- logic
  IF: ([c, t, f]) => (truthy(c) ? (t ?? true) : (f ?? false)),
  IFS: (a) => { for (let i = 0; i + 1 < a.length; i += 2) if (truthy(a[i])) return a[i + 1]; return null; },
  IFERROR: ([v, fallback]) => (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? fallback : v),
  SWITCH: ([v, ...rest]) => {
    const hasDefault = rest.length % 2 === 1;
    const pairs = hasDefault ? rest.slice(0, -1) : rest;
    for (let i = 0; i + 1 < pairs.length; i += 2) if (text(pairs[i]).toLowerCase() === text(v).toLowerCase()) return pairs[i + 1];
    return hasDefault ? rest[rest.length - 1] : null;
  },
  CHOOSE: ([i, ...options]) => options[num(i) - 1] ?? null,
  AND: (a) => flat(a).every(truthy),
  OR: (a) => flat(a).some(truthy),
  XOR: (a) => flat(a).filter(truthy).length % 2 === 1,
  NOT: ([v]) => !truthy(v),
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: ([v]) => isBlank(v),
  ISNUMBER: ([v]) => typeof v === "number" && Number.isFinite(v),
  ISTEXT: ([v]) => typeof v === "string",
  ISLOGICAL: ([v]) => typeof v === "boolean",
  ISEVEN: ([v]) => Math.trunc(num(v)) % 2 === 0,
  ISODD: ([v]) => Math.trunc(num(v)) % 2 !== 0,

  // -- text
  CONCAT: (a) => flat(a).map(text).join(""),
  CONCATENATE: (a) => flat(a).map(text).join(""),
  TEXTJOIN: ([sep, ignoreEmpty, ...rest]) => flat(rest).filter((v) => !(truthy(ignoreEmpty ?? true) && isBlank(v))).map(text).join(text(sep)),
  UPPER: ([v]) => text(v).toUpperCase(),
  LOWER: ([v]) => text(v).toLowerCase(),
  PROPER: ([v]) => text(v).toLowerCase().replace(/(^|[^a-z0-9])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()),
  TRIM: ([v]) => text(v).trim().replace(/\s+/g, " "),
  CLEAN: ([v]) => text(v).replace(/[\x00-\x1F\x7F]/g, ""),
  LEN: ([v]) => text(v).length,
  LEFT: ([v, n]) => text(v).slice(0, n === undefined ? 1 : Math.max(0, num(n))),
  RIGHT: ([v, n]) => { const c = n === undefined ? 1 : num(n); return c <= 0 ? "" : text(v).slice(-c); },
  MID: ([v, start, n]) => { const s = Math.max(0, num(start) - 1); return text(v).substring(s, s + Math.max(0, num(n))); },
  SUBSTITUTE: ([v, from, to, nth]) => {
    const s = text(v); const f = text(from); const t = text(to);
    if (f === "") return s;
    if (nth === undefined) return s.split(f).join(t);
    let idx = -1; let count = 0;
    while ((idx = s.indexOf(f, idx + 1)) !== -1) { count += 1; if (count === num(nth)) return s.slice(0, idx) + t + s.slice(idx + f.length); }
    return s;
  },
  REPLACE: ([v, start, n, to]) => { const s = text(v); const i = Math.max(0, num(start) - 1); return s.slice(0, i) + text(to) + s.slice(i + Math.max(0, num(n))); },
  REPT: ([v, n]) => text(v).repeat(Math.max(0, Math.trunc(num(n)))),
  FIND: ([needle, hay, start]) => { const i = text(hay).indexOf(text(needle), Math.max(0, num(start ?? 1) - 1)); return i === -1 ? null : i + 1; },
  SEARCH: ([needle, hay, start]) => { const i = text(hay).toLowerCase().indexOf(text(needle).toLowerCase(), Math.max(0, num(start ?? 1) - 1)); return i === -1 ? null : i + 1; },
  EXACT: ([a, b]) => text(a) === text(b),
  CHAR: ([n]) => String.fromCharCode(num(n)),
  CODE: ([v]) => text(v).charCodeAt(0) || 0,
  TEXT: ([v, fmt]) => formatText(v, fmt === undefined ? undefined : text(fmt)),
  VALUE: ([v]) => num(v),
  NUMBERVALUE: ([v, dec, group]) => {
    let s = text(v).trim();
    if (group !== undefined) s = s.split(text(group)).join("");
    if (dec !== undefined && text(dec) !== ".") s = s.split(text(dec)).join(".");
    return num(s);
  },
  STARTSWITH: ([v, p]) => text(v).toLowerCase().startsWith(text(p).toLowerCase()),
  ENDSWITH: ([v, p]) => text(v).toLowerCase().endsWith(text(p).toLowerCase()),
  CONTAINS: ([v, p]) => text(v).toLowerCase().includes(text(p).toLowerCase()),

  // -- dates
  TODAY: () => isoDate(new Date()),
  NOW: () => new Date().toISOString(),
  DATE: ([y, m, d]) => isoDate(new Date(Date.UTC(num(y), num(m) - 1, num(d)))),
  DATEVALUE: ([v]) => { const d = toDate(v); return d ? isoDate(d) : null; },
  YEAR: ([v]) => toDate(v)?.getUTCFullYear() ?? 0,
  MONTH: ([v]) => { const d = toDate(v); return d ? d.getUTCMonth() + 1 : 0; },
  DAY: ([v]) => toDate(v)?.getUTCDate() ?? 0,
  WEEKDAY: ([v, type]) => { const d = toDate(v); if (!d) return 0; const sun0 = d.getUTCDay(); return num(type ?? 1) === 2 ? (sun0 === 0 ? 7 : sun0) : sun0 + 1; },
  DAYS: ([a, b]) => { const from = toDate(b); const to = toDate(a); if (!from || !to) return 0; return Math.round((to.getTime() - from.getTime()) / 86_400_000); },
  EDATE: ([v, months]) => { const d = toDate(v); return d ? isoDate(addMonths(d, num(months))) : null; },
  EOMONTH: ([v, months]) => { const d = toDate(v); if (!d) return null; const m = addMonths(d, num(months ?? 0)); return isoDate(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0))); },
  DATEDIF: ([a, b, unit]) => {
    const s = toDate(a); const e = toDate(b); if (!s || !e) return 0;
    const u = text(unit ?? "D").toUpperCase();
    if (u === "D") return Math.floor((e.getTime() - s.getTime()) / 86_400_000);
    let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
    if (e.getUTCDate() < s.getUTCDate()) months -= 1;
    if (u === "M") return months;
    if (u === "Y") return Math.floor(months / 12);
    return 0;
  },
  NETWORKDAYS: ([a, b]) => {
    const s = toDate(a); const e = toDate(b); if (!s || !e) return 0;
    const step = e >= s ? 1 : -1; let count = 0;
    const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
    const end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
    while (step > 0 ? cur <= end : cur >= end) { const d = cur.getUTCDay(); if (d !== 0 && d !== 6) count += 1; cur.setUTCDate(cur.getUTCDate() + step); }
    return count * step;
  },

  // -- lookups (column-scoped)
  LOOKUP: ([value, keys, results, fallback]) => { const i = list(keys).findIndex((k) => text(k).toLowerCase() === text(value).toLowerCase()); return i === -1 ? (fallback ?? null) : (list(results)[i] ?? null); },
  XLOOKUP: ([value, keys, results, fallback]) => { const i = list(keys).findIndex((k) => text(k).toLowerCase() === text(value).toLowerCase()); return i === -1 ? (fallback ?? null) : (list(results)[i] ?? null); },
  MATCH: ([value, keys]) => { const i = list(keys).findIndex((k) => text(k).toLowerCase() === text(value).toLowerCase()); return i === -1 ? null : i + 1; },
  INDEX: ([range, n]) => list(range)[num(n) - 1] ?? null,
};

/** Simple TEXT() formats: "0", "0.00", "#,##0", "#,##0.00", "0%", "0.0%", "yyyy-mm-dd", "dd/mm/yyyy", "mmm yyyy". */
function formatText(value: unknown, fmt?: string): string {
  if (fmt === undefined) return text(value);
  const f = fmt.trim();
  const d = /[ymd]/i.test(f) && !/[#0]/.test(f) ? toDate(value) : null;
  if (d) {
    const yyyy = String(d.getUTCFullYear()); const mm = String(d.getUTCMonth() + 1).padStart(2, "0"); const dd = String(d.getUTCDate()).padStart(2, "0");
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]!;
    return f.replace(/yyyy/i, yyyy).replace(/yy/i, yyyy.slice(2)).replace(/mmm/i, mon).replace(/mm/i, mm).replace(/dd/i, dd);
  }
  const n = num(value);
  const percent = f.endsWith("%");
  const core = percent ? f.slice(0, -1) : f;
  const decimals = core.includes(".") ? core.split(".")[1]!.replace(/[^0#]/g, "").length : 0;
  const grouped = core.includes(",");
  const scaled = percent ? n * 100 : n;
  const fixed = roundTo(scaled, decimals, "round").toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  const intText = grouped ? Number(intPart).toLocaleString("en-US", { maximumFractionDigits: 0 }) : intPart!;
  return `${intText}${frac !== undefined ? "." + frac : ""}${percent ? "%" : ""}`;
}

/* ------------------------------ argument scoping ------------------------------ */

/**
 * Which arguments of a function read a whole COLUMN when written as a bare
 * reference (`SUM(price)` sums the column, while `price * 2` reads the row).
 * `true` = every argument; an array = those 0-based positions; a function =
 * decide per position (for `range, criterion, range, criterion…` shapes).
 */
const COLUMN_ARGS: Record<string, true | number[] | ((i: number) => boolean)> = {
  SUM: true, AVERAGE: true, MIN: true, MAX: true, COUNT: true, COUNTA: true, COUNTBLANK: true,
  PRODUCT: true, MEDIAN: true, STDEV: true, VAR: true, SUMPRODUCT: true,
  LARGE: [0], SMALL: [0], RANK: [1],
  SUMIF: [0, 2], COUNTIF: [0], AVERAGEIF: [0, 2],
  SUMIFS: (i) => i === 0 || i % 2 === 1, AVERAGEIFS: (i) => i === 0 || i % 2 === 1,
  MAXIFS: (i) => i === 0 || i % 2 === 1, MINIFS: (i) => i === 0 || i % 2 === 1,
  COUNTIFS: (i) => i % 2 === 0,
  LOOKUP: [1, 2], XLOOKUP: [1, 2], MATCH: [1], INDEX: [0],
};

const aggregateNames = new Set(Object.keys(COLUMN_ARGS));
/** Names of the functions whose arguments (some or all) read whole columns. */
export const AGGREGATES: ReadonlySet<string> = aggregateNames;

function readsColumn(fn: string, index: number): boolean {
  const rule = COLUMN_ARGS[fn];
  if (rule === undefined) return false;
  if (rule === true) return true;
  if (Array.isArray(rule)) return rule.includes(index);
  return rule(index);
}

/* ------------------------------ evaluate ------------------------------ */

function evaluate(node: Node, scope: Scope): unknown {
  switch (node.type) {
    case "num": return node.value;
    case "str": return node.value;
    case "ref": {
      const upper = node.name.toUpperCase();
      if (upper === "TRUE") return true;
      if (upper === "FALSE") return false;
      return scope.field(node.name);
    }
    case "unary": {
      const v = evaluate(node.operand, scope);
      return node.op === "%" ? num(v) / 100 : -num(v);
    }
    case "binary": {
      const { op } = node;
      if (op === "&") return text(evaluate(node.left, scope)) + text(evaluate(node.right, scope));
      const l = evaluate(node.left, scope);
      const r = evaluate(node.right, scope);
      switch (op) {
        case "+": return num(l) + num(r);
        case "-": return num(l) - num(r);
        case "*": return num(l) * num(r);
        case "/": return num(r) === 0 ? null : num(l) / num(r);
        case "^": return num(l) ** num(r);
        case "=": return equals(l, r);
        case "<>": return !equals(l, r);
        case "<": return lessThan(l, r);
        case "<=": return lessThan(l, r) || equals(l, r);
        case ">": return lessThan(r, l);
        case ">=": return lessThan(r, l) || equals(l, r);
        default: throw new FormulaError(`Unknown operator "${op}"`);
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new FormulaError(`Unknown function "${node.name}"`, node.pos);
      const args = node.args.map((arg, i) =>
        arg.type === "ref" && readsColumn(node.name, i) ? scope.column(arg.name) : evaluate(arg, scope),
      );
      return fn(args);
    }
  }
}

const numeric = (a: unknown) => typeof a === "number" || typeof a === "boolean" || (typeof a === "string" && a.trim() !== "" && Number.isFinite(Number(a)));
function equals(a: unknown, b: unknown): boolean {
  if (numeric(a) && numeric(b)) return num(a) === num(b);
  return text(a).toLowerCase() === text(b).toLowerCase();
}
function lessThan(a: unknown, b: unknown): boolean {
  if ((numeric(a) && numeric(b)) || isBlank(a) || isBlank(b)) return num(a) < num(b);
  return text(a).toLowerCase() < text(b).toLowerCase();
}

/* ------------------------------ public api ------------------------------ */

/** A compiled formula: parse once, evaluate against any scope. */
export type Compiled = ((scope: Scope) => unknown) & {
  /** The column names the formula reads (row fields and aggregate columns). */
  references: string[];
  /** The original source. */
  source: string;
};

/** Parse once; the result is reusable across every row. Throws {@link FormulaError} on bad syntax. */
export function compile(source: string): Compiled {
  const body = source.trim().replace(/^=/, "");
  const tree = parse(tokenise(body));
  const refs = collectReferences(tree);
  const fn = ((scope: Scope) => evaluate(tree, scope)) as Compiled;
  fn.references = refs;
  fn.source = source;
  return fn;
}

/** Convenience for one-off evaluation. Returns `null` on any error (bad syntax, unknown function). */
export function run(source: string, scope: Scope): unknown {
  try { return compile(source)(scope); } catch { return null; }
}

/** Parse only — `{ ok: true }` or the error message and position. Use it to validate as the user types. */
export function check(source: string): { ok: true } | { ok: false; error: string; position?: number } {
  try { compile(source); return { ok: true }; } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), position: e instanceof FormulaError ? e.position : undefined };
  }
}

/** The column names a formula reads, without evaluating it. */
export function references(source: string): string[] {
  return compile(source).references;
}

function collectReferences(node: Node, out: Set<string> = new Set()): string[] {
  switch (node.type) {
    case "ref": { const u = node.name.toUpperCase(); if (u !== "TRUE" && u !== "FALSE") out.add(node.name); break; }
    case "unary": collectReferences(node.operand, out); break;
    case "binary": collectReferences(node.left, out); collectReferences(node.right, out); break;
    case "call": node.args.forEach((a) => collectReferences(a, out)); break;
    default: break;
  }
  return [...out];
}

/** Build a {@link Scope} for one row of a table (column reads are cached across rows). */
export function tableScope(rows: Record<string, unknown>[], index: number, cache: Map<string, unknown[]> = new Map()): Scope {
  return {
    field: (name) => rows[index]?.[name],
    column: (name) => {
      let col = cache.get(name);
      if (!col) { col = rows.map((r) => r[name]); cache.set(name, col); }
      return col;
    },
  };
}

/** Evaluate a formula for every row of a table → one value per row. */
export function computeColumn(source: string, rows: Record<string, unknown>[]): unknown[] {
  const fn = compile(source);
  const cache = new Map<string, unknown[]>();
  return rows.map((_, i) => fn(tableScope(rows, i, cache)));
}

/* ------------------------------ reference metadata ------------------------------ */

export type FunctionCategory = "math" | "statistics" | "logic" | "text" | "date" | "lookup" | "info";

export interface FunctionDoc {
  name: string;
  category: FunctionCategory;
  signature: string;
  description: string;
  example: string;
  /** What the example returns, as text. */
  result?: string;
}

const D = (name: string, category: FunctionCategory, signature: string, description: string, example: string, result?: string): FunctionDoc =>
  ({ name, category, signature, description, example, result });

/** Human reference for every built-in — powers in-app help, docs pages and autocomplete. */
export const FUNCTION_DOCS: FunctionDoc[] = [
  D("SUM", "math", "SUM(column | value, …)", "Adds numbers. A bare column name sums the whole column.", "=SUM(price)", "410"),
  D("AVERAGE", "statistics", "AVERAGE(column | value, …)", "Arithmetic mean of the numbers, ignoring blanks.", "=AVERAGE(price)", "102.5"),
  D("MIN", "statistics", "MIN(column | value, …)", "Smallest number.", "=MIN(stock)", "0"),
  D("MAX", "statistics", "MAX(column | value, …)", "Largest number.", "=MAX(price)", "250"),
  D("COUNT", "statistics", "COUNT(column | value, …)", "How many cells hold a number.", "=COUNT(price)", "4"),
  D("COUNTA", "statistics", "COUNTA(column | value, …)", "How many cells are not blank.", "=COUNTA(name)", "4"),
  D("COUNTBLANK", "statistics", "COUNTBLANK(column)", "How many cells are blank.", "=COUNTBLANK(barcode)", "2"),
  D("ROUND", "math", "ROUND(number, [places])", "Round to a number of decimal places (half away from zero).", "=ROUND(2.567, 2)", "2.57"),
  D("ROUNDUP", "math", "ROUNDUP(number, [places])", "Round away from zero.", "=ROUNDUP(2.11, 1)", "2.2"),
  D("ROUNDDOWN", "math", "ROUNDDOWN(number, [places])", "Round toward zero.", "=ROUNDDOWN(2.99, 1)", "2.9"),
  D("FLOOR", "math", "FLOOR(number)", "Round down to a whole number.", "=FLOOR(2.9)", "2"),
  D("CEILING", "math", "CEILING(number)", "Round up to a whole number.", "=CEILING(2.1)", "3"),
  D("INT", "math", "INT(number)", "The whole-number part, rounding down.", "=INT(-2.5)", "-3"),
  D("TRUNC", "math", "TRUNC(number, [places])", "Cut off decimals without rounding.", "=TRUNC(2.99)", "2"),
  D("ABS", "math", "ABS(number)", "Absolute value.", "=ABS(-7)", "7"),
  D("SIGN", "math", "SIGN(number)", "-1, 0 or 1.", "=SIGN(-12)", "-1"),
  D("EVEN", "math", "EVEN(number)", "Round up to the nearest even whole number.", "=EVEN(3)", "4"),
  D("ODD", "math", "ODD(number)", "Round up to the nearest odd whole number.", "=ODD(2)", "3"),
  D("POWER", "math", "POWER(base, exponent)", "base to the power of exponent (same as ^).", "=POWER(2, 10)", "1024"),
  D("SQRT", "math", "SQRT(number)", "Square root.", "=SQRT(81)", "9"),
  D("EXP", "math", "EXP(number)", "e raised to a power.", "=EXP(1)", "2.718…"),
  D("LN", "math", "LN(number)", "Natural logarithm.", "=LN(1)", "0"),
  D("LOG", "math", "LOG(number, [base])", "Logarithm, base 10 unless given.", "=LOG(8, 2)", "3"),
  D("LOG10", "math", "LOG10(number)", "Base-10 logarithm.", "=LOG10(1000)", "3"),
  D("PI", "math", "PI()", "π.", "=PI()", "3.14159…"),
  D("MOD", "math", "MOD(number, divisor)", "Remainder after division (sign follows the divisor).", "=MOD(10, 3)", "1"),
  D("PRODUCT", "math", "PRODUCT(column | value, …)", "Multiplies numbers together.", "=PRODUCT(2, 3, 4)", "24"),
  D("MEDIAN", "statistics", "MEDIAN(column | value, …)", "The middle value.", "=MEDIAN(price)", "80"),
  D("STDEV", "statistics", "STDEV(column | value, …)", "Sample standard deviation.", "=STDEV(price)", "…"),
  D("VAR", "statistics", "VAR(column | value, …)", "Sample variance.", "=VAR(price)", "…"),
  D("LARGE", "statistics", "LARGE(column, k)", "The k-th largest value.", "=LARGE(price, 2)", "100"),
  D("SMALL", "statistics", "SMALL(column, k)", "The k-th smallest value.", "=SMALL(price, 1)", "0"),
  D("RANK", "statistics", "RANK(value, column, [ascending])", "Rank of a value within a column (1 = largest, or smallest when ascending is TRUE).", "=RANK(price, price)", "1"),
  D("SUMPRODUCT", "math", "SUMPRODUCT(column, column, …)", "Multiplies matching rows across columns, then sums.", "=SUMPRODUCT(price, qty)", "…"),
  D("SUMIF", "math", "SUMIF(column, criterion, [sumColumn])", "Sum the rows whose value matches a criterion like \">10\" or \"Foods\".", "=SUMIF(category, \"Foods\", price)", "310"),
  D("COUNTIF", "statistics", "COUNTIF(column, criterion)", "Count the rows matching a criterion. Wildcards * and ? work.", "=COUNTIF(category, \"Foods\")", "2"),
  D("AVERAGEIF", "statistics", "AVERAGEIF(column, criterion, [avgColumn])", "Average of the rows matching a criterion.", "=AVERAGEIF(stock, \">0\", price)", "…"),
  D("SUMIFS", "math", "SUMIFS(sumColumn, column1, crit1, [column2, crit2, …])", "Sum where every criterion holds.", "=SUMIFS(price, category, \"Foods\", stock, \">0\")", "…"),
  D("COUNTIFS", "statistics", "COUNTIFS(column1, crit1, [column2, crit2, …])", "Count where every criterion holds.", "=COUNTIFS(category, \"Foods\", stock, \">0\")", "…"),
  D("AVERAGEIFS", "statistics", "AVERAGEIFS(avgColumn, column1, crit1, …)", "Average where every criterion holds.", "=AVERAGEIFS(price, category, \"Foods\")", "…"),
  D("MAXIFS", "statistics", "MAXIFS(column, column1, crit1, …)", "Largest value where every criterion holds.", "=MAXIFS(price, category, \"Foods\")", "…"),
  D("MINIFS", "statistics", "MINIFS(column, column1, crit1, …)", "Smallest value where every criterion holds.", "=MINIFS(price, stock, \">0\")", "…"),
  D("IF", "logic", "IF(test, thenValue, [elseValue])", "One value if the test is true, another if not.", "=IF(stock > 10, \"ok\", \"low\")", "\"ok\""),
  D("IFS", "logic", "IFS(test1, value1, test2, value2, …)", "The value of the first test that is true.", "=IFS(stock=0, \"out\", stock<10, \"low\", TRUE, \"ok\")", "…"),
  D("IFERROR", "logic", "IFERROR(value, fallback)", "The fallback when the value is empty or an error.", "=IFERROR(1/0, 0)", "0"),
  D("SWITCH", "logic", "SWITCH(value, match1, result1, …, [default])", "Pick a result by matching a value.", "=SWITCH(unit, \"kg\", 1000, \"g\", 1, 0)", "…"),
  D("CHOOSE", "logic", "CHOOSE(index, value1, value2, …)", "The n-th value.", "=CHOOSE(2, \"a\", \"b\", \"c\")", "\"b\""),
  D("AND", "logic", "AND(test, …)", "TRUE when every test is true.", "=AND(stock > 1, price > 1)", "TRUE"),
  D("OR", "logic", "OR(test, …)", "TRUE when any test is true.", "=OR(stock = 0, price = 0)", "…"),
  D("XOR", "logic", "XOR(test, …)", "TRUE when an odd number of tests are true.", "=XOR(TRUE, FALSE)", "TRUE"),
  D("NOT", "logic", "NOT(test)", "Flips a test.", "=NOT(stock > 1000)", "TRUE"),
  D("TRUE", "logic", "TRUE()", "The value TRUE.", "=TRUE()", "TRUE"),
  D("FALSE", "logic", "FALSE()", "The value FALSE.", "=FALSE()", "FALSE"),
  D("ISBLANK", "info", "ISBLANK(value)", "TRUE when the value is empty.", "=ISBLANK(barcode)", "…"),
  D("ISNUMBER", "info", "ISNUMBER(value)", "TRUE when the value is a number.", "=ISNUMBER(price)", "TRUE"),
  D("ISTEXT", "info", "ISTEXT(value)", "TRUE when the value is text.", "=ISTEXT(name)", "TRUE"),
  D("ISLOGICAL", "info", "ISLOGICAL(value)", "TRUE when the value is TRUE/FALSE.", "=ISLOGICAL(active)", "…"),
  D("ISEVEN", "info", "ISEVEN(number)", "TRUE for even numbers.", "=ISEVEN(4)", "TRUE"),
  D("ISODD", "info", "ISODD(number)", "TRUE for odd numbers.", "=ISODD(4)", "FALSE"),
  D("CONCAT", "text", "CONCAT(value, …)", "Joins values into text (same as &).", "=CONCAT(name, \" \", stock)", "\"Black Tea 12\""),
  D("CONCATENATE", "text", "CONCATENATE(value, …)", "Joins values into text.", "=CONCATENATE(\"a\", \"b\")", "\"ab\""),
  D("TEXTJOIN", "text", "TEXTJOIN(separator, ignoreEmpty, value, …)", "Joins values with a separator, optionally skipping blanks.", "=TEXTJOIN(\", \", TRUE, \"a\", \"\", \"b\")", "\"a, b\""),
  D("UPPER", "text", "UPPER(text)", "UPPER CASE.", "=UPPER(name)", "\"BLACK TEA\""),
  D("LOWER", "text", "LOWER(text)", "lower case.", "=LOWER(name)", "\"black tea\""),
  D("PROPER", "text", "PROPER(text)", "Capitalises Each Word.", "=PROPER(\"black tea\")", "\"Black Tea\""),
  D("TRIM", "text", "TRIM(text)", "Removes surrounding and doubled spaces.", "=TRIM(\"  a   b \")", "\"a b\""),
  D("CLEAN", "text", "CLEAN(text)", "Removes non-printable characters.", "=CLEAN(note)", "…"),
  D("LEN", "text", "LEN(text)", "Number of characters.", "=LEN(name)", "9"),
  D("LEFT", "text", "LEFT(text, [count])", "The first characters.", "=LEFT(name, 5)", "\"Black\""),
  D("RIGHT", "text", "RIGHT(text, [count])", "The last characters.", "=RIGHT(name, 3)", "\"Tea\""),
  D("MID", "text", "MID(text, start, count)", "Characters from a 1-based start.", "=MID(name, 7, 3)", "\"Tea\""),
  D("SUBSTITUTE", "text", "SUBSTITUTE(text, old, new, [nth])", "Replace text by matching, all or the n-th occurrence.", "=SUBSTITUTE(name, \"Black\", \"Green\")", "\"Green Tea\""),
  D("REPLACE", "text", "REPLACE(text, start, count, new)", "Replace text by position.", "=REPLACE(\"abcdef\", 2, 3, \"X\")", "\"aXef\""),
  D("REPT", "text", "REPT(text, times)", "Repeats text.", "=REPT(\"-\", 3)", "\"---\""),
  D("FIND", "text", "FIND(needle, text, [start])", "1-based position of needle, case-sensitive; empty when absent.", "=FIND(\"Tea\", name)", "7"),
  D("SEARCH", "text", "SEARCH(needle, text, [start])", "1-based position of needle, case-insensitive.", "=SEARCH(\"tea\", name)", "7"),
  D("EXACT", "text", "EXACT(a, b)", "TRUE when two texts match exactly (case-sensitive).", "=EXACT(\"a\", \"A\")", "FALSE"),
  D("CHAR", "text", "CHAR(code)", "The character for a code.", "=CHAR(65)", "\"A\""),
  D("CODE", "text", "CODE(text)", "The code of the first character.", "=CODE(\"A\")", "65"),
  D("TEXT", "text", "TEXT(value, [format])", "Format a number or date as text: \"0.00\", \"#,##0\", \"0%\", \"yyyy-mm-dd\", \"dd/mm/yyyy\".", "=TEXT(1234.5, \"#,##0.00\")", "\"1,234.50\""),
  D("VALUE", "text", "VALUE(text)", "Text to a number (\"1,200\" → 1200).", "=VALUE(\"1,200\")", "1200"),
  D("NUMBERVALUE", "text", "NUMBERVALUE(text, [decimalSep], [groupSep])", "Text to a number using the given separators.", "=NUMBERVALUE(\"1.234,5\", \",\", \".\")", "1234.5"),
  D("STARTSWITH", "text", "STARTSWITH(text, prefix)", "TRUE when text starts with prefix (case-insensitive).", "=STARTSWITH(sku, \"NP-\")", "…"),
  D("ENDSWITH", "text", "ENDSWITH(text, suffix)", "TRUE when text ends with suffix.", "=ENDSWITH(email, \"@gmail.com\")", "…"),
  D("CONTAINS", "text", "CONTAINS(text, part)", "TRUE when text contains part.", "=CONTAINS(name, \"tea\")", "TRUE"),
  D("TODAY", "date", "TODAY()", "Today's date as yyyy-mm-dd.", "=TODAY()", "\"2026-09-10\""),
  D("NOW", "date", "NOW()", "The current date and time (ISO).", "=NOW()", "…"),
  D("DATE", "date", "DATE(year, month, day)", "Build a date.", "=DATE(2026, 9, 10)", "\"2026-09-10\""),
  D("DATEVALUE", "date", "DATEVALUE(text)", "Parse text into a yyyy-mm-dd date.", "=DATEVALUE(\"10 Sep 2026\")", "\"2026-09-10\""),
  D("YEAR", "date", "YEAR(date)", "The year.", "=YEAR(\"2026-03-15\")", "2026"),
  D("MONTH", "date", "MONTH(date)", "The month, 1–12.", "=MONTH(\"2026-03-15\")", "3"),
  D("DAY", "date", "DAY(date)", "The day of the month.", "=DAY(\"2026-03-15\")", "15"),
  D("WEEKDAY", "date", "WEEKDAY(date, [type])", "Day of week: 1 = Sunday … 7 (type 1), or 1 = Monday … 7 (type 2).", "=WEEKDAY(\"2026-09-10\", 2)", "4"),
  D("DAYS", "date", "DAYS(end, start)", "Days between two dates.", "=DAYS(\"2026-03-10\", \"2026-03-01\")", "9"),
  D("EDATE", "date", "EDATE(date, months)", "The date a number of months later (or earlier).", "=EDATE(\"2026-01-31\", 1)", "\"2026-02-28\""),
  D("EOMONTH", "date", "EOMONTH(date, [months])", "The last day of the month, months later.", "=EOMONTH(\"2026-02-10\", 0)", "\"2026-02-28\""),
  D("DATEDIF", "date", "DATEDIF(start, end, unit)", "Difference in \"D\" days, \"M\" whole months or \"Y\" whole years.", "=DATEDIF(\"2024-01-15\", \"2026-09-10\", \"Y\")", "2"),
  D("NETWORKDAYS", "date", "NETWORKDAYS(start, end)", "Working days between two dates (Mon–Fri).", "=NETWORKDAYS(\"2026-09-07\", \"2026-09-11\")", "5"),
  D("LOOKUP", "lookup", "LOOKUP(value, keyColumn, resultColumn, [default])", "Find a value in one column and return the same row from another (VLOOKUP-style).", "=LOOKUP(categoryId, id, name, \"?\")", "…"),
  D("XLOOKUP", "lookup", "XLOOKUP(value, keyColumn, resultColumn, [default])", "Same as LOOKUP.", "=XLOOKUP(sku, sku, price, 0)", "…"),
  D("MATCH", "lookup", "MATCH(value, column)", "1-based position of a value in a column; empty when absent.", "=MATCH(\"Foods\", category)", "1"),
  D("INDEX", "lookup", "INDEX(column, n)", "The n-th value of a column.", "=INDEX(price, 2)", "100"),
];

/** Sorted names of every available function. */
export const FUNCTION_NAMES: string[] = Object.keys(FUNCTIONS).sort();

/** Look up the reference entry for a function (case-insensitive). */
export function describeFunction(name: string): FunctionDoc | undefined {
  const upper = name.toUpperCase();
  return FUNCTION_DOCS.find((d) => d.name === upper);
}

/** Add (or override) a function. Names are upper-cased. `columnArgs` marks which argument positions read whole columns. */
export function registerFunction(name: string, fn: FormulaFunction, doc?: Omit<FunctionDoc, "name"> & { columnArgs?: true | number[] }): void {
  const upper = name.toUpperCase();
  FUNCTIONS[upper] = fn;
  if (!FUNCTION_NAMES.includes(upper)) { FUNCTION_NAMES.push(upper); FUNCTION_NAMES.sort(); }
  if (doc?.columnArgs !== undefined) { COLUMN_ARGS[upper] = doc.columnArgs; aggregateNames.add(upper); }
  if (doc) {
    const entry = { name: upper, category: doc.category, signature: doc.signature, description: doc.description, example: doc.example, result: doc.result };
    const i = FUNCTION_DOCS.findIndex((d) => d.name === upper);
    if (i === -1) FUNCTION_DOCS.push(entry); else FUNCTION_DOCS[i] = entry;
  }
}
