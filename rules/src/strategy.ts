/**
 * Strategy rules: a small, safe rule language for "buy when … , sell when …".
 *
 * A strategy is data, not code — operands (price, an indicator, a number),
 * comparisons (above, below, crosses above, crosses below) and AND/OR groups —
 * so it can be built by clicking, written by the AI, saved, backtested in the
 * browser and evaluated by the server for alerts with exactly the same result.
 * This file is self-contained on purpose: it is copied verbatim into the
 * backend (src/utils/strategy.ts) and the website. Keep the copies identical.
 */

export interface RBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
type S = (number | null)[];

export type Src = "close" | "open" | "high" | "low" | "volume";
export type Operand =
  | { k: "num"; v: number }
  | { k: "price"; src: Src }
  | { k: "sma" | "ema"; n: number; src?: Src }
  | { k: "rsi"; n: number }
  | { k: "macd" | "macdSignal" | "macdHist"; f?: number; s?: number; g?: number }
  | { k: "atr"; n: number }
  | { k: "bbUpper" | "bbMid" | "bbLower"; n: number; m: number }
  | { k: "stDir"; n: number; m: number }
  | { k: "highest" | "lowest"; n: number }
  | { k: "volAvg"; n: number }
  | { k: "change"; n: number };
export type Op = ">" | "<" | "crossAbove" | "crossBelow";
export interface Cond {
  a: Operand;
  op: Op;
  b: Operand;
  /** Multiply the right-hand side, e.g. volume > 2 × its average. */
  mul?: number;
}
export interface Group {
  mode: "all" | "any";
  conds: Cond[];
}
export interface Rules {
  name: string;
  entry: Group;
  /** Optional: exit on these conditions as well as the stop / target. */
  exit: Group;
  /** Stop and target as multiples of ATR(14) at entry (0 / undefined = off). */
  stopAtr?: number;
  targetAtr?: number;
}

export const OPERAND_KINDS: { k: Operand["k"]; label: string }[] = [
  { k: "price", label: "Price" },
  { k: "num", label: "Number" },
  { k: "ema", label: "EMA" },
  { k: "sma", label: "SMA" },
  { k: "rsi", label: "RSI" },
  { k: "macd", label: "MACD line" },
  { k: "macdSignal", label: "MACD signal" },
  { k: "macdHist", label: "MACD histogram" },
  { k: "bbUpper", label: "Bollinger upper" },
  { k: "bbMid", label: "Bollinger middle" },
  { k: "bbLower", label: "Bollinger lower" },
  { k: "stDir", label: "Supertrend direction (+1 / −1)" },
  { k: "atr", label: "ATR" },
  { k: "highest", label: "Highest high of last N (before this candle)" },
  { k: "lowest", label: "Lowest low of last N (before this candle)" },
  { k: "volAvg", label: "Average volume" },
  { k: "change", label: "% change over N candles" },
];
export const OPS: { op: Op; label: string }[] = [
  { op: ">", label: "is above" },
  { op: "<", label: "is below" },
  { op: "crossAbove", label: "crosses above" },
  { op: "crossBelow", label: "crosses below" },
];

/** Sensible defaults when a kind is picked in the builder. */
export function defaultOperand(k: Operand["k"]): Operand {
  switch (k) {
    case "num": return { k, v: 50 };
    case "price": return { k, src: "close" };
    case "sma": case "ema": return { k, n: 20 };
    case "rsi": return { k, n: 14 };
    case "macd": case "macdSignal": case "macdHist": return { k, f: 12, s: 26, g: 9 };
    case "atr": return { k, n: 14 };
    case "bbUpper": case "bbMid": case "bbLower": return { k, n: 20, m: 2 };
    case "stDir": return { k, n: 10, m: 3 };
    case "highest": case "lowest": return { k, n: 20 };
    case "volAvg": return { k, n: 20 };
    case "change": return { k, n: 5 };
  }
}

/* ── maths (self-contained) ─────────────────────────────────────────────── */

const nulls = (n: number): S => new Array(n).fill(null);
function sma(v: number[], n: number): S {
  const o = nulls(v.length);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) o[i] = s / n;
  }
  return o;
}
function emaS(v: S, n: number): S {
  const o = nulls(v.length);
  const k = 2 / (n + 1);
  let e: number | null = null;
  let seed = 0, cnt = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (x == null) continue;
    if (e == null) {
      seed += x;
      cnt++;
      if (cnt === n) { e = seed / n; o[i] = e; }
    } else {
      e = x * k + e * (1 - k);
      o[i] = e;
    }
  }
  return o;
}
function rsi(v: number[], n: number): S {
  const o = nulls(v.length);
  if (v.length <= n) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}
function atr(b: RBar[], n: number): S {
  const o = nulls(b.length);
  if (b.length <= n) return o;
  const tr = b.map((x, i) => (i ? Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)) : x.high - x.low));
  let a = tr.slice(1, n + 1).reduce((p, q) => p + q, 0) / n;
  o[n] = a;
  for (let i = n + 1; i < b.length; i++) { a = (a * (n - 1) + tr[i]) / n; o[i] = a; }
  return o;
}
function supertrendDir(b: RBar[], n: number, m: number): S {
  const a = atr(b, n);
  const d = nulls(b.length);
  let up = 0, dn = 0, dir = 1, started = false;
  for (let i = 0; i < b.length; i++) {
    const x = a[i];
    if (x == null) continue;
    const hl2 = (b[i].high + b[i].low) / 2;
    const bu = hl2 - m * x, bd = hl2 + m * x;
    const pc = i ? b[i - 1].close : b[i].close;
    if (!started) { up = bu; dn = bd; started = true; }
    else {
      up = pc > up ? Math.max(bu, up) : bu;
      dn = pc < dn ? Math.min(bd, dn) : bd;
      if (dir === -1 && b[i].close > dn) dir = 1;
      else if (dir === 1 && b[i].close < up) dir = -1;
    }
    d[i] = dir;
  }
  return d;
}

/** The series an operand stands for, cached per strategy run. */
function series(o: Operand, b: RBar[], cache: Map<string, S>): S {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const src = (s: Src = "close") => b.map((x) => x[s]);
  const cl = src();
  let out: S;
  switch (o.k) {
    case "num": out = b.map(() => o.v); break;
    case "price": out = src(o.src); break;
    case "sma": out = sma(src(o.src), o.n); break;
    case "ema": out = emaS(src(o.src), o.n); break;
    case "rsi": out = rsi(cl, o.n); break;
    case "macd": case "macdSignal": case "macdHist": {
      const f = emaS(cl, o.f ?? 12), s = emaS(cl, o.s ?? 26);
      const line: S = cl.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null));
      const sig = emaS(line, o.g ?? 9);
      out = o.k === "macd" ? line : o.k === "macdSignal" ? sig : line.map((x, i) => (x != null && sig[i] != null ? x - (sig[i] as number) : null));
      break;
    }
    case "atr": out = atr(b, o.n); break;
    case "bbUpper": case "bbMid": case "bbLower": {
      const mid = sma(cl, o.n);
      out = mid.map((m, i) => {
        if (m == null) return null;
        if (o.k === "bbMid") return m;
        let v = 0;
        for (let j = i - o.n + 1; j <= i; j++) v += (cl[j] - m) ** 2;
        const sd = Math.sqrt(v / o.n);
        return o.k === "bbUpper" ? m + o.m * sd : m - o.m * sd;
      });
      break;
    }
    case "stDir": out = supertrendDir(b, o.n, o.m); break;
    case "highest": case "lowest": {
      // The N candles BEFORE this one, so "close crosses above highest(20)" is a real breakout.
      out = b.map((_, i) => {
        if (i < o.n) return null;
        let v = o.k === "highest" ? -Infinity : Infinity;
        for (let j = i - o.n; j < i; j++) v = o.k === "highest" ? Math.max(v, b[j].high) : Math.min(v, b[j].low);
        return v;
      });
      break;
    }
    case "volAvg": out = sma(src("volume"), o.n); break;
    case "change": out = cl.map((c, i) => (i >= o.n && cl[i - o.n] ? ((c - cl[i - o.n]) / cl[i - o.n]) * 100 : null)); break;
  }
  cache.set(key, out);
  return out;
}

const warm = (o: Operand): number => {
  switch (o.k) {
    case "num": case "price": return 0;
    case "macd": case "macdSignal": case "macdHist": return (o.s ?? 26) + (o.g ?? 9);
    case "ema": return o.n * 2;
    case "rsi": return o.n * 3;
    default: return (o as { n: number }).n + 1;
  }
};

/** Per-candle truth of a group, read on each candle's close. */
function group(g: Group, b: RBar[], cache: Map<string, S>): boolean[] {
  const n = b.length;
  if (!g.conds.length) return new Array(n).fill(false);
  const each = g.conds.map((c) => {
    const A = series(c.a, b, cache);
    const B0 = series(c.b, b, cache);
    const k = c.mul ?? 1;
    const B = k === 1 ? B0 : B0.map((x) => (x == null ? null : x * k));
    return b.map((_, i) => {
      const a = A[i], bb = B[i];
      if (a == null || bb == null) return false;
      if (c.op === ">") return a > bb;
      if (c.op === "<") return a < bb;
      const pa = A[i - 1], pb = B[i - 1];
      if (pa == null || pb == null) return false;
      return c.op === "crossAbove" ? pa <= pb && a > bb : pa >= pb && a < bb;
    });
  });
  return b.map((_, i) => (g.mode === "all" ? each.every((e) => e[i]) : each.some((e) => e[i])));
}

/** Entry / exit truth per candle, plus the candles needed before it can be trusted. */
export function evaluate(r: Rules, b: RBar[]) {
  const cache = new Map<string, S>();
  const need = Math.max(2, ...[...r.entry.conds, ...r.exit.conds].flatMap((c) => [warm(c.a), warm(c.b)])) + 1;
  return { entry: group(r.entry, b, cache), exit: group(r.exit, b, cache), atr: series({ k: "atr", n: 14 }, b, cache), need };
}

/* ── words ──────────────────────────────────────────────────────────────── */

export function describeOperand(o: Operand): string {
  switch (o.k) {
    case "num": return String(o.v);
    case "price": return o.src === "close" ? "close" : o.src;
    case "sma": case "ema": return `${o.k.toUpperCase()} ${o.n}${o.src && o.src !== "close" ? ` of ${o.src}` : ""}`;
    case "rsi": return `RSI ${o.n}`;
    case "macd": return "MACD";
    case "macdSignal": return "MACD signal";
    case "macdHist": return "MACD histogram";
    case "atr": return `ATR ${o.n}`;
    case "bbUpper": return `upper Bollinger (${o.n}, ${o.m})`;
    case "bbMid": return `Bollinger middle (${o.n})`;
    case "bbLower": return `lower Bollinger (${o.n}, ${o.m})`;
    case "stDir": return `Supertrend (${o.n}, ${o.m}) direction`;
    case "highest": return `${o.n}-candle high`;
    case "lowest": return `${o.n}-candle low`;
    case "volAvg": return `${o.n}-candle average volume`;
    case "change": return `${o.n}-candle % change`;
  }
}
export const describeCond = (c: Cond) =>
  `${describeOperand(c.a)} ${OPS.find((x) => x.op === c.op)!.label} ${c.mul && c.mul !== 1 ? `${c.mul} × ` : ""}${describeOperand(c.b)}`;
export function describeRules(r: Rules): string {
  const g = (x: Group) => x.conds.map(describeCond).join(x.mode === "all" ? " and " : " or ");
  const parts = [`Buy when ${g(r.entry) || "—"}`];
  if (r.exit.conds.length) parts.push(`sell when ${g(r.exit)}`);
  if (r.stopAtr) parts.push(`stop ${r.stopAtr} × ATR below entry`);
  if (r.targetAtr) parts.push(`target ${r.targetAtr} × ATR above`);
  return parts.join("; ") + ".";
}

/* ── validation (for saved, AI-written and server-side rules) ───────────── */

const SRC = new Set(["close", "open", "high", "low", "volume"]);
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

type Loose = Record<string, unknown>;
const srcOf = (v: unknown): Src | null => (typeof v === "string" && SRC.has(v) ? (v as Src) : null);

function cleanOperand(raw: unknown): Operand | null {
  const x = raw as Loose;
  if (!x || typeof x !== "object" || !OPERAND_KINDS.some((o) => o.k === x.k)) return null;
  const d = defaultOperand(x.k as Operand["k"]) as Loose;
  switch (x.k as Operand["k"]) {
    case "num": return { k: "num", v: num(x.v, -1e9, 1e9, d.v as number) };
    case "price": return { k: "price", src: srcOf(x.src) || "close" };
    case "sma": case "ema": {
      const src = srcOf(x.src);
      return { k: x.k as "sma" | "ema", n: int(x.n, 1, 500, d.n as number), ...(src && src !== "close" ? { src } : {}) };
    }
    case "macd": case "macdSignal": case "macdHist": return { k: x.k as "macd", f: int(x.f, 2, 100, 12), s: int(x.s, 3, 200, 26), g: int(x.g, 2, 50, 9) };
    case "bbUpper": case "bbMid": case "bbLower": return { k: x.k as "bbUpper", n: int(x.n, 2, 300, 20), m: num(x.m, 0.5, 5, 2) };
    case "stDir": return { k: "stDir", n: int(x.n, 2, 100, 10), m: num(x.m, 0.5, 10, 3) };
    default: return { k: x.k, n: int(x.n, 1, 500, d.n as number) } as Operand;
  }
}
function cleanGroup(raw: unknown): Group {
  const x = (raw || {}) as Loose;
  const conds = (Array.isArray(x.conds) ? (x.conds as Loose[]) : [])
    .slice(0, 8)
    .map((c) => {
      const a = cleanOperand(c?.a), b = cleanOperand(c?.b);
      if (!a || !b || !OPS.some((o) => o.op === c?.op)) return null;
      const mul = c.mul == null ? undefined : num(c.mul, 0.01, 100, 1);
      return { a, op: c.op as Op, b, ...(mul && mul !== 1 ? { mul } : {}) };
    })
    .filter(Boolean) as Cond[];
  return { mode: x.mode === "any" ? "any" : "all", conds };
}

/** Coerce anything (saved JSON, AI output, a request body) into valid rules, or null if it has no entry condition. */
export function cleanRules(raw: unknown): Rules | null {
  const x = raw as Loose;
  if (!x || typeof x !== "object") return null;
  const r: Rules = {
    name: String(x.name || "My strategy").slice(0, 60),
    entry: cleanGroup(x.entry),
    exit: cleanGroup(x.exit),
  };
  const sa = num(x.stopAtr, 0, 20, 0), ta = num(x.targetAtr, 0, 50, 0);
  if (sa) r.stopAtr = sa;
  if (ta) r.targetAtr = ta;
  return r.entry.conds.length ? r : null;
}

/* ── starting points ────────────────────────────────────────────────────── */

export const STRATEGY_TEMPLATES: Rules[] = [
  {
    name: "Trend pullback",
    entry: { mode: "all", conds: [{ a: { k: "price", src: "close" }, op: ">", b: { k: "ema", n: 50 } }, { a: { k: "rsi", n: 14 }, op: "crossAbove", b: { k: "num", v: 40 } }] },
    exit: { mode: "any", conds: [{ a: { k: "rsi", n: 14 }, op: "crossBelow", b: { k: "num", v: 70 } }] },
    stopAtr: 2,
    targetAtr: 4,
  },
  {
    name: "EMA cross with RSI filter",
    entry: { mode: "all", conds: [{ a: { k: "ema", n: 20 }, op: "crossAbove", b: { k: "ema", n: 50 } }, { a: { k: "rsi", n: 14 }, op: ">", b: { k: "num", v: 50 } }] },
    exit: { mode: "any", conds: [{ a: { k: "ema", n: 20 }, op: "crossBelow", b: { k: "ema", n: 50 } }] },
    stopAtr: 2,
  },
  {
    name: "Breakout on volume",
    entry: { mode: "all", conds: [{ a: { k: "price", src: "close" }, op: "crossAbove", b: { k: "highest", n: 20 } }, { a: { k: "price", src: "volume" }, op: ">", b: { k: "volAvg", n: 20 }, mul: 1.5 }] },
    exit: { mode: "any", conds: [{ a: { k: "price", src: "close" }, op: "crossBelow", b: { k: "lowest", n: 10 } }] },
    stopAtr: 1.5,
    targetAtr: 3,
  },
  {
    name: "Bollinger bounce",
    entry: { mode: "all", conds: [{ a: { k: "price", src: "close" }, op: "crossAbove", b: { k: "bbLower", n: 20, m: 2 } }] },
    exit: { mode: "any", conds: [{ a: { k: "price", src: "close" }, op: ">", b: { k: "bbMid", n: 20, m: 2 } }] },
    stopAtr: 1.5,
  },
  {
    name: "Supertrend + MACD",
    entry: { mode: "all", conds: [{ a: { k: "stDir", n: 10, m: 3 }, op: ">", b: { k: "num", v: 0 } }, { a: { k: "macd" }, op: "crossAbove", b: { k: "macdSignal" } }] },
    exit: { mode: "any", conds: [{ a: { k: "stDir", n: 10, m: 3 }, op: "<", b: { k: "num", v: 0 } }] },
  },
];

/* ── @lacspace/rules addition (superset of the app copies) ───────────────── */

/** The full per-candle series an operand stands for (null while warming up). */
export function operandSeries(o: Operand, b: RBar[]): (number | null)[] {
  return series(o, b, new Map());
}
