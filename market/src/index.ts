/**
 * @lacspace/market
 * The money & mechanics toolkit every stock-market app re-implements.
 *
 * P&L, returns, CAGR, XIRR, tick-size rounding, circuit limits, position sizing
 * — plus a real Indian brokerage & charges calculator (STT, GST, SEBI, stamp,
 * exchange txn) with discount-broker presets.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export interface FormatMoneyOptions {
  symbol?: string;
  decimals?: number;
}

/**
 * Format a number in the Indian numbering system (lakh / crore grouping).
 * @example formatINR(1234567.5) // "₹12,34,567.50"
 */
export function formatINR(amount: number, opts: FormatMoneyOptions = {}): string {
  const { symbol = "₹", decimals = 2 } = opts;
  const neg = amount < 0;
  const fixed = Math.abs(amount).toFixed(decimals);
  const [intPart = "0", frac = ""] = fixed.split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3
    : last3;
  return `${neg ? "-" : ""}${symbol}${grouped}${decimals > 0 ? "." + frac : ""}`;
}

/* ------------------------------------------------------------------ *
 * Returns & P&L
 * ------------------------------------------------------------------ */

/** Absolute profit/loss for a round-trip. */
export function pnl(o: { buy: number; sell: number; qty: number }): number {
  return (o.sell - o.buy) * o.qty;
}

/** Percentage change from `reference` to `current` (e.g. LTP vs prev close). */
export function changePercent(current: number, reference: number): number {
  if (reference === 0) return 0;
  return ((current - reference) / reference) * 100;
}

/** Profit/loss as a percentage of the buy price. */
export function pnlPercent(o: { buy: number; sell: number }): number {
  return changePercent(o.sell, o.buy);
}

/** Compound Annual Growth Rate as a fraction (0.15 = 15%). */
export function cagr(begin: number, end: number, years: number): number {
  if (begin <= 0 || years <= 0) return NaN;
  return Math.pow(end / begin, 1 / years) - 1;
}

export interface CashFlow {
  /** Negative = money out (investment), positive = money in (redemption). */
  amount: number;
  date: Date | string | number;
}

function toMillis(d: Date | string | number): number {
  if (d instanceof Date) return d.getTime();
  if (typeof d === "number") return d;
  return new Date(d).getTime();
}

/**
 * Extended Internal Rate of Return for irregularly-spaced cash flows.
 * Returns an annualised rate as a fraction. Uses Newton–Raphson.
 * @example xirr([{amount:-10000, date:"2024-01-01"}, {amount:12000, date:"2025-01-01"}]) // ~0.20
 */
export function xirr(flows: CashFlow[], guess = 0.1): number {
  if (flows.length < 2) return NaN;
  const cf = flows
    .map((f) => ({ amount: f.amount, t: toMillis(f.date) }))
    .sort((a, b) => a.t - b.t);
  const t0 = cf[0]!.t;
  const yearFrac = (t: number) => (t - t0) / (365 * 24 * 3600 * 1000);
  const npv = (r: number) =>
    cf.reduce((s, c) => s + c.amount / Math.pow(1 + r, yearFrac(c.t)), 0);
  const dnpv = (r: number) =>
    cf.reduce((s, c) => {
      const y = yearFrac(c.t);
      return s - (y * c.amount) / Math.pow(1 + r, y + 1);
    }, 0);

  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-7) return r;
    const d = dnpv(r);
    if (d === 0) break;
    const next = r - f / d;
    if (!isFinite(next)) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  return r;
}

/* ------------------------------------------------------------------ *
 * Position mechanics
 * ------------------------------------------------------------------ */

/** Volume-weighted average price across a set of trades. */
export function averagePrice(trades: { price: number; qty: number }[]): number {
  let qty = 0;
  let value = 0;
  for (const t of trades) {
    qty += t.qty;
    value += t.price * t.qty;
  }
  return qty === 0 ? 0 : value / qty;
}

/**
 * Risk-based position sizing. Returns the whole-share quantity so that a stop-out
 * costs at most `riskPercent` of capital.
 * @example positionSize({ capital: 100000, riskPercent: 1, entry: 500, stop: 480 }) // 50
 */
export function positionSize(o: {
  capital: number;
  riskPercent: number;
  entry: number;
  stop: number;
}): number {
  const riskAmount = o.capital * (o.riskPercent / 100);
  const perShareRisk = Math.abs(o.entry - o.stop);
  if (perShareRisk === 0) return 0;
  return Math.floor(riskAmount / perShareRisk);
}

/** Round a price to the nearest exchange tick (default ₹0.05 for NSE equity). */
export function roundToTick(price: number, tick = 0.05): number {
  if (tick <= 0) return price;
  return Number((Math.round(price / tick) * tick).toFixed(4));
}

/** Upper & lower circuit price for a given previous close and band percent. */
export function circuitLimits(
  prevClose: number,
  percent: number,
): { upper: number; lower: number } {
  const delta = prevClose * (percent / 100);
  return {
    upper: roundToTick(prevClose + delta),
    lower: roundToTick(prevClose - delta),
  };
}

/* ------------------------------------------------------------------ *
 * Brokerage & statutory charges (India)
 * ------------------------------------------------------------------ */

export type Segment = "delivery" | "intraday" | "futures" | "options";

export interface SegmentRates {
  /** Brokerage as a fraction of turnover per side (0.0003 = 0.03%). */
  brokeragePct: number;
  /** Per-order brokerage cap (₹). */
  brokerageCap: number;
  /** Flat per-order brokerage (₹) — overrides the pct/cap model when set. */
  brokerageFlat?: number;
  sttBuy: number;
  sttSell: number;
  exchangeTxn: number;
  stampBuy: number;
  /** Depository (DP) charge per scrip on the sell leg (₹). */
  dpPerScrip: number;
}

export interface ChargeConfig {
  segments: Record<Segment, SegmentRates>;
  sebi: number;
  gst: number;
}

/**
 * Default rates approximating an Indian discount broker (Zerodha-style) as of
 * FY2024–25. Statutory rates change — override any field via the `config`
 * argument of {@link charges} and always verify against the live rate card.
 */
export const IN_DISCOUNT_BROKER: ChargeConfig = {
  segments: {
    delivery: {
      brokeragePct: 0,
      brokerageCap: 0,
      sttBuy: 0.001,
      sttSell: 0.001,
      exchangeTxn: 0.0000297,
      stampBuy: 0.00015,
      dpPerScrip: 13.5,
    },
    intraday: {
      brokeragePct: 0.0003,
      brokerageCap: 20,
      sttBuy: 0,
      sttSell: 0.00025,
      exchangeTxn: 0.0000297,
      stampBuy: 0.00003,
      dpPerScrip: 0,
    },
    futures: {
      brokeragePct: 0.0003,
      brokerageCap: 20,
      sttBuy: 0,
      sttSell: 0.0002,
      exchangeTxn: 0.0000173,
      stampBuy: 0.00002,
      dpPerScrip: 0,
    },
    options: {
      brokeragePct: 0,
      brokerageCap: 20,
      brokerageFlat: 20,
      sttBuy: 0,
      sttSell: 0.001,
      exchangeTxn: 0.0003503,
      stampBuy: 0.00003,
      dpPerScrip: 0,
    },
  },
  sebi: 0.000001, // ₹10 per crore
  gst: 0.18,
};

export interface ChargeInput {
  segment: Segment;
  /** Buy price per unit. Omit / 0 for a sell-only leg. */
  buy: number;
  /** Sell price per unit. Omit / 0 for a buy-only leg. */
  sell: number;
  qty: number;
}

export interface ChargeBreakdown {
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebi: number;
  stamp: number;
  gst: number;
  dp: number;
  totalCharges: number;
  grossPnl: number;
  netPnl: number;
  /** Per-share price move needed just to break even on charges. */
  breakeven: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function legBrokerage(turnover: number, r: SegmentRates): number {
  if (turnover <= 0) return 0;
  if (r.brokerageFlat !== undefined) return r.brokerageFlat;
  if (r.brokeragePct === 0) return 0;
  return Math.min(turnover * r.brokeragePct, r.brokerageCap);
}

/**
 * Full brokerage + statutory charges breakdown for a trade, Indian market.
 * @example
 * charges({ segment: "intraday", buy: 100, sell: 102, qty: 500 });
 * // { brokerage, stt, gst, sebi, stamp, exchangeTxn, totalCharges, netPnl, breakeven, ... }
 */
export function charges(
  input: ChargeInput,
  config: ChargeConfig = IN_DISCOUNT_BROKER,
): ChargeBreakdown {
  const r = config.segments[input.segment];
  const buyVal = (input.buy || 0) * input.qty;
  const sellVal = (input.sell || 0) * input.qty;
  const turnover = buyVal + sellVal;

  const brokerage = legBrokerage(buyVal, r) + legBrokerage(sellVal, r);
  const stt = buyVal * r.sttBuy + sellVal * r.sttSell;
  const exchangeTxn = turnover * r.exchangeTxn;
  const sebi = turnover * config.sebi;
  const stamp = buyVal * r.stampBuy;
  const gst = (brokerage + exchangeTxn + sebi) * config.gst;
  const dp = sellVal > 0 ? r.dpPerScrip : 0;

  const totalCharges = brokerage + stt + exchangeTxn + sebi + stamp + gst + dp;
  const grossPnl = sellVal - buyVal;

  return {
    turnover: round2(turnover),
    brokerage: round2(brokerage),
    stt: round2(stt),
    exchangeTxn: round2(exchangeTxn),
    sebi: round2(sebi),
    stamp: round2(stamp),
    gst: round2(gst),
    dp: round2(dp),
    totalCharges: round2(totalCharges),
    grossPnl: round2(grossPnl),
    netPnl: round2(grossPnl - totalCharges),
    breakeven: input.qty === 0 ? 0 : round2(totalCharges / input.qty),
  };
}

/* ------------------------------------------------------------------ *
 * Compact formatting
 * ------------------------------------------------------------------ */

function trimTo2(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Compact INR: `formatCompactINR(12345678)` → `"₹1.23 Cr"`. */
export function formatCompactINR(amount: number, opts: FormatMoneyOptions = {}): string {
  const { symbol = "₹" } = opts;
  const neg = amount < 0;
  const a = Math.abs(amount);
  const units: [number, string][] = [
    [1e7, "Cr"],
    [1e5, "L"],
    [1e3, "K"],
  ];
  const u = units.find(([size]) => a >= size);
  const out = u ? `${trimTo2(a / u[0])} ${u[1]}` : trimTo2(a);
  return `${neg ? "-" : ""}${symbol}${out}`;
}

/* ------------------------------------------------------------------ *
 * Options — Black-Scholes greeks
 * ------------------------------------------------------------------ */

function normPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation). */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

export interface OptionInput {
  type: "call" | "put";
  /** Spot price of the underlying. */
  spot: number;
  strike: number;
  /** Time to expiry in years (e.g. 30 days ≈ 30/365). */
  timeYears: number;
  /** Risk-free rate (annual, decimal — e.g. 0.07). */
  rate: number;
  /** Volatility (annual, decimal — e.g. 0.25). */
  volatility: number;
  /** Continuous dividend yield (annual, decimal). Default 0. */
  dividendYield?: number;
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** Per-year theta (divide by 365 for per-day). */
  theta: number;
  /** Per 1.00 change in volatility (divide by 100 for per 1%). */
  vega: number;
  /** Per 1.00 change in rate (divide by 100 for per 1%). */
  rho: number;
}

/** Black-Scholes price + greeks for a European option. */
export function blackScholes(o: OptionInput): Greeks {
  const { type, spot: S, strike: K, timeYears: t, rate: r } = o;
  const q = o.dividendYield ?? 0;
  const sigma = o.volatility;

  // Degenerate inputs (expired option or zero vol) would divide by zero and
  // produce NaN/Infinity — fall back to the intrinsic value instead.
  if (t <= 0 || sigma <= 0) {
    if (type === "call") {
      return {
        price: Math.max(0, S - K),
        delta: S > K ? 1 : 0,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
      };
    }
    return {
      price: Math.max(0, K - S),
      delta: S < K ? -1 : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * t);
  const dq = Math.exp(-q * t);
  const nd1 = normPdf(d1);
  const gamma = (dq * nd1) / (S * sigma * sqrtT);
  const vega = S * dq * nd1 * sqrtT;
  if (type === "call") {
    const Nd1 = normCdf(d1);
    const Nd2 = normCdf(d2);
    return {
      price: S * dq * Nd1 - K * disc * Nd2,
      delta: dq * Nd1,
      gamma,
      theta: -(S * dq * nd1 * sigma) / (2 * sqrtT) - r * K * disc * Nd2 + q * S * dq * Nd1,
      vega,
      rho: K * t * disc * Nd2,
    };
  }
  const Nnd1 = normCdf(-d1);
  const Nnd2 = normCdf(-d2);
  return {
    price: K * disc * Nnd2 - S * dq * Nnd1,
    delta: -dq * Nnd1,
    gamma,
    theta: -(S * dq * nd1 * sigma) / (2 * sqrtT) + r * K * disc * Nnd2 - q * S * dq * Nnd1,
    vega,
    rho: -K * t * disc * Nnd2,
  };
}

/** Solve implied volatility from an observed option price (bisection). */
export function impliedVolatility(
  marketPrice: number,
  o: Omit<OptionInput, "volatility">,
  opts: { tolerance?: number; maxIterations?: number } = {},
): number | null {
  const tol = opts.tolerance ?? 1e-6;
  const maxIter = opts.maxIterations ?? 100;
  let lo = 1e-4;
  let hi = 5;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const price = blackScholes({ ...o, volatility: mid }).price;
    const diff = price - marketPrice;
    if (Math.abs(diff) < tol) return mid;
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Portfolio analytics
 * ------------------------------------------------------------------ */

/** Period-over-period simple returns from a price/equity series. */
export function simpleReturns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    if (prev !== 0) out.push((series[i]! - prev) / prev);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Volatility (stdev of returns); annualized by default. */
export function volatility(returns: number[], opts: { annualize?: boolean; periodsPerYear?: number } = {}): number {
  const sd = stdev(returns);
  return opts.annualize === false ? sd : sd * Math.sqrt(opts.periodsPerYear ?? 252);
}

/** Annualized Sharpe ratio from a return series. */
export function sharpe(returns: number[], opts: { riskFree?: number; periodsPerYear?: number } = {}): number {
  const ppy = opts.periodsPerYear ?? 252;
  const rfPerPeriod = (opts.riskFree ?? 0) / ppy;
  const excess = returns.map((r) => r - rfPerPeriod);
  const sd = stdev(excess);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(ppy);
}

/** Annualized Sortino ratio (downside-deviation only). */
export function sortino(returns: number[], opts: { riskFree?: number; periodsPerYear?: number } = {}): number {
  const ppy = opts.periodsPerYear ?? 252;
  const rfPerPeriod = (opts.riskFree ?? 0) / ppy;
  const excess = returns.map((r) => r - rfPerPeriod);
  const downside = excess.filter((r) => r < 0);
  if (!downside.length) return 0;
  const dd = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length);
  if (dd === 0) return 0;
  return (mean(excess) / dd) * Math.sqrt(ppy);
}

/** Maximum drawdown of an equity curve, as a positive fraction (0.2 = −20%). */
export function maxDrawdown(equity: number[]): { maxDrawdown: number; peakIndex: number; troughIndex: number } {
  let peak = equity[0] ?? 0;
  let peakIdx = 0;
  let maxDd = 0;
  let ddPeak = 0;
  let ddTrough = 0;
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i]!;
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
      ddPeak = peakIdx;
      ddTrough = i;
    }
  }
  return { maxDrawdown: maxDd, peakIndex: ddPeak, troughIndex: ddTrough };
}
