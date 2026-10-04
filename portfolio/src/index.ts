/**
 * @lacspace/portfolio — portfolio analytics from holdings and daily closes.
 *
 * Unrealised P/L against WACC, market-value weights, HHI concentration, sector weights,
 * annualised volatility (daily log returns × √periodsPerYear), beta against an index on
 * shared dates, max drawdown, and Sharpe / Sortino. Deterministic, zero-dependency.
 *
 * History is the CURRENT holdings valued on past closes (a "what my portfolio did" view),
 * not a reconstruction of past trades.
 */

const VERSION = "1.0.0";

export interface Holding {
  symbol: string;
  qty: number;
  /** Weighted average cost per share. */
  wacc: number;
}

/** A daily close. `date` is any sortable string ("2026-10-02") or a unix-seconds number. */
export interface Close {
  date: string | number;
  close: number;
}

export interface PortfolioInput {
  holdings: Holding[];
  /** Daily closes per symbol, any order. */
  prices: Record<string, Close[]>;
  /** Benchmark index closes (e.g. NEPSE) for beta and the benchmark return. */
  index?: Close[];
  /** symbol → sector. */
  sectors?: Record<string, string>;
}

export interface PortfolioOptions {
  /** Trading days per year for annualising. Default 240 (NEPSE: Sun–Thu minus holidays). */
  periodsPerYear?: number;
  /** Annual risk-free rate as a fraction (0.05 = 5%). Default 0. */
  riskFree?: number;
}

export interface HoldingRow {
  symbol: string;
  sector?: string;
  qty: number;
  wacc: number;
  /** Last close (null if no prices). */
  last: number | null;
  cost: number;
  value: number;
  /** Share of total market value, 0–1. */
  weight: number;
  pnl: number;
  /** Unrealised P/L % against cost. */
  pnlPct: number;
}

export interface PortfolioReport {
  holdings: HoldingRow[];
  totals: { cost: number; value: number; pnl: number; pnlPct: number };
  /** Herfindahl–Hirschman index on market-value weights, 0–10,000. */
  hhi: number;
  /** 10,000 / HHI: the number of equal-weight holdings with the same concentration. */
  effectiveHoldings: number;
  sectorWeights: { sector: string; value: number; weight: number }[];
  /** Portfolio market value per date (current holdings on historical closes). */
  history: { date: string | number; value: number }[];
  risk: {
    /** Number of daily returns used. */
    days: number;
    /** Annualised volatility of daily log returns, fraction (0.18 = 18%). */
    volatility: number | null;
    /** Max peak-to-trough decline of `history`, fraction (0.12 = −12%). */
    maxDrawdown: number | null;
    drawdownPeak?: string | number;
    drawdownTrough?: string | number;
    /** Annualised Sharpe on daily simple returns. */
    sharpe: number | null;
    /** Annualised Sortino (downside deviation vs the daily risk-free rate). */
    sortino: number | null;
    /** Period return of `history` (first → last), fraction. */
    periodReturn: number | null;
    /** Beta of daily simple returns vs the index, on dates both have a close. */
    beta: number | null;
    /** Correlation with the index on the same returns. */
    correlation: number | null;
    /** Index return over the same span as `history`, fraction. */
    indexReturn: number | null;
    /** Number of paired daily returns used for beta. */
    betaDays: number;
  };
}

/* ------------------------------------------------------------------ helpers */

const key = (d: string | number) => String(d);
const cmp = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

function mean(x: number[]): number {
  return x.reduce((s, v) => s + v, 0) / x.length;
}
/** Sample standard deviation (n − 1). */
function sd(x: number[]): number | null {
  if (x.length < 2) return null;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}
function sortCloses(c: Close[]): Close[] {
  return [...c].filter((x) => Number.isFinite(x.close)).sort((a, b) => cmp(a.date, b.date));
}

/** Herfindahl–Hirschman index (0–10,000) from weights (fractions or any positive numbers). */
export function hhi(weights: number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!total) return 0;
  return weights.reduce((s, w) => s + (Math.max(0, w) / total * 100) ** 2, 0);
}

/** Max drawdown of a value series: fraction plus the peak/trough indices. */
export function maxDrawdown(values: number[]): { dd: number; peak: number; trough: number } | null {
  if (values.length < 2) return null;
  let peakI = 0, best = { dd: 0, peak: 0, trough: 0 };
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[peakI]!) peakI = i;
    const dd = values[peakI]! > 0 ? (values[peakI]! - values[i]!) / values[peakI]! : 0;
    if (dd > best.dd) best = { dd, peak: peakI, trough: i };
  }
  return best;
}

/** Beta and correlation of `a` against `b` (paired return arrays). */
export function beta(a: number[], b: number[]): { beta: number | null; correlation: number | null } {
  const n = Math.min(a.length, b.length);
  if (n < 2) return { beta: null, correlation: null };
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i]! - ma) * (b[i]! - mb);
    va += (a[i]! - ma) ** 2;
    vb += (b[i]! - mb) ** 2;
  }
  return { beta: vb ? cov / vb : null, correlation: va && vb ? cov / Math.sqrt(va * vb) : null };
}

/* ----------------------------------------------------------------- analyse */

/** Full portfolio report from holdings, daily closes, an optional index and a sector map. */
export function analyzePortfolio(input: PortfolioInput, options: PortfolioOptions = {}): PortfolioReport {
  const ppy = options.periodsPerYear ?? 240;
  const rf = options.riskFree ?? 0;
  const rfDaily = rf / ppy;
  const sectors = input.sectors ?? {};

  // Merge duplicate symbols (same stock bought in two lots → qty-weighted WACC).
  const merged = new Map<string, Holding>();
  for (const h of input.holdings) {
    if (!(h.qty > 0)) continue;
    const m = merged.get(h.symbol);
    if (!m) merged.set(h.symbol, { ...h });
    else {
      const qty = m.qty + h.qty;
      merged.set(h.symbol, { symbol: h.symbol, qty, wacc: (m.wacc * m.qty + h.wacc * h.qty) / qty });
    }
  }
  const holds = [...merged.values()];
  const series = new Map(holds.map((h) => [h.symbol, sortCloses(input.prices[h.symbol] ?? [])]));

  // Holdings table.
  const rows: HoldingRow[] = holds.map((h) => {
    const s = series.get(h.symbol)!;
    const last = s.length ? s[s.length - 1]!.close : null;
    const cost = h.qty * h.wacc;
    const value = last == null ? 0 : h.qty * last;
    return { symbol: h.symbol, ...(sectors[h.symbol] ? { sector: sectors[h.symbol] } : {}), qty: h.qty, wacc: h.wacc, last, cost, value, weight: 0, pnl: value - cost, pnlPct: cost ? ((value - cost) / cost) * 100 : 0 };
  });
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  for (const r of rows) r.weight = totalValue ? r.value / totalValue : 0;
  rows.sort((a, b) => b.value - a.value);
  const h = hhi(rows.map((r) => r.value));

  const bySector = new Map<string, number>();
  for (const r of rows) bySector.set(r.sector ?? "Unknown", (bySector.get(r.sector ?? "Unknown") ?? 0) + r.value);
  const sectorWeights = [...bySector].map(([sector, value]) => ({ sector, value, weight: totalValue ? value / totalValue : 0 })).sort((a, b) => b.value - a.value);

  // History: every date any holding traded, forward-filling each symbol's last close,
  // starting once every holding has a price.
  const dates = [...new Set(holds.flatMap((x) => series.get(x.symbol)!.map((c) => key(c.date))))];
  const rawDate = new Map<string, string | number>();
  for (const x of holds) for (const c of series.get(x.symbol)!) rawDate.set(key(c.date), c.date);
  dates.sort((a, b) => cmp(rawDate.get(a)!, rawDate.get(b)!));
  const lookup = new Map(holds.map((x) => [x.symbol, new Map(series.get(x.symbol)!.map((c) => [key(c.date), c.close]))]));
  const lastSeen = new Map<string, number>();
  const history: PortfolioReport["history"] = [];
  for (const d of dates) {
    for (const x of holds) {
      const c = lookup.get(x.symbol)!.get(d);
      if (c != null) lastSeen.set(x.symbol, c);
    }
    if (holds.length && holds.every((x) => lastSeen.has(x.symbol))) {
      history.push({ date: rawDate.get(d)!, value: holds.reduce((s, x) => s + x.qty * lastSeen.get(x.symbol)!, 0) });
    }
  }

  const values = history.map((p) => p.value);
  const logR: number[] = [], simple: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1]! > 0 && values[i]! > 0) {
      logR.push(Math.log(values[i]! / values[i - 1]!));
      simple.push(values[i]! / values[i - 1]! - 1);
    }
  }
  const volD = sd(logR);
  const sdS = sd(simple);
  const excess = simple.map((r) => r - rfDaily);
  const downside = simple.length ? Math.sqrt(excess.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / simple.length) : 0;
  const mdd = maxDrawdown(values);

  // Beta: simple returns on dates where both the portfolio and the index have a value,
  // each return measured from the previous shared date.
  let b = { beta: null as number | null, correlation: null as number | null }, betaDays = 0, indexReturn: number | null = null;
  if (input.index?.length && history.length > 1) {
    const ix = new Map(sortCloses(input.index).map((c) => [key(c.date), c.close]));
    const shared = history.filter((p) => ix.has(key(p.date)));
    const pa: number[] = [], pb: number[] = [];
    for (let i = 1; i < shared.length; i++) {
      const i0 = ix.get(key(shared[i - 1]!.date))!, i1 = ix.get(key(shared[i]!.date))!;
      if (shared[i - 1]!.value > 0 && i0 > 0) {
        pa.push(shared[i]!.value / shared[i - 1]!.value - 1);
        pb.push(i1 / i0 - 1);
      }
    }
    b = beta(pa, pb);
    betaDays = pa.length;
    if (shared.length > 1) indexReturn = ix.get(key(shared[shared.length - 1]!.date))! / ix.get(key(shared[0]!.date))! - 1;
  }

  return {
    holdings: rows,
    totals: { cost: totalCost, value: totalValue, pnl: totalValue - totalCost, pnlPct: totalCost ? ((totalValue - totalCost) / totalCost) * 100 : 0 },
    hhi: h,
    effectiveHoldings: h ? 10000 / h : 0,
    sectorWeights,
    history,
    risk: {
      days: logR.length,
      volatility: volD == null ? null : volD * Math.sqrt(ppy),
      maxDrawdown: mdd ? mdd.dd : null,
      ...(mdd && mdd.dd > 0 ? { drawdownPeak: history[mdd.peak]!.date, drawdownTrough: history[mdd.trough]!.date } : {}),
      sharpe: sdS ? ((mean(simple) - rfDaily) / sdS) * Math.sqrt(ppy) : null,
      sortino: downside ? ((mean(simple) - rfDaily) / downside) * Math.sqrt(ppy) : null,
      periodReturn: values.length > 1 && values[0]! > 0 ? values[values.length - 1]! / values[0]! - 1 : null,
      beta: b.beta,
      correlation: b.correlation,
      indexReturn,
      betaDays,
    },
  };
}

/** describe() for agents/conductors. */
export function describe() {
  return {
    name: "@lacspace/portfolio",
    version: VERSION,
    summary: "Portfolio analytics from holdings {symbol, qty, wacc} and daily closes: unrealised P/L vs WACC, weights, HHI (0–10,000), sector weights, annualised volatility (log returns × √240), beta/correlation vs an index on shared dates, max drawdown, Sharpe, Sortino.",
    commands: [
      {
        name: "analyzePortfolio",
        input: {
          type: "object",
          properties: {
            holdings: { type: "array", items: { type: "object", properties: { symbol: { type: "string" }, qty: { type: "number" }, wacc: { type: "number" } }, required: ["symbol", "qty", "wacc"] } },
            prices: { type: "object", description: "symbol → { date, close }[]" },
            index: { type: "array", description: "{ date, close }[] benchmark (e.g. NEPSE)" },
            sectors: { type: "object", description: "symbol → sector" },
            options: { type: "object", properties: { periodsPerYear: { type: "number", default: 240 }, riskFree: { type: "number", default: 0 } } },
          },
          required: ["holdings", "prices"],
        },
        output: "{ holdings, totals, hhi, effectiveHoldings, sectorWeights, history, risk: { volatility, maxDrawdown, sharpe, sortino, beta, correlation, periodReturn, indexReturn } }",
      },
    ],
  };
}
