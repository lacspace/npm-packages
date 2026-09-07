/**
 * Portfolio analytics for @lacspace/paper-trade.
 *
 * Pure, zero-dependency functions over an equity series — period returns, total
 * return, and max drawdown — plus the {@link EquityStats}/{@link PerformanceStats}
 * shapes the account exposes. They operate on plain `number[]` (or
 * {@link EquityPoint}[]), so you can feed them an account's `equityCurve()` or
 * any series you tracked yourself.
 */
import type { TradeStats } from "./index";

/** A single sampled point on the equity curve. */
export interface EquityPoint {
  /** Millis timestamp (from the account clock). */
  t: number;
  /** Account equity (cash + mark-to-market value) at that time. */
  equity: number;
}

export interface EquityStats {
  /** Number of samples in the series. */
  points: number;
  /** First equity value. */
  start: number;
  /** Last equity value. */
  end: number;
  /** Highest equity reached. */
  high: number;
  /** Lowest equity reached. */
  low: number;
  /** (end - start) / start × 100. */
  totalReturnPct: number;
  /** Largest peak-to-trough drop, in money. */
  maxDrawdown: number;
  /** Largest peak-to-trough drop, as a percent of the peak. */
  maxDrawdownPct: number;
}

/** {@link TradeStats} merged with equity-curve stats — the full backtest picture. */
export interface PerformanceStats extends TradeStats, EquityStats {}

function values(series: number[] | EquityPoint[]): number[] {
  return series.map((p) => (typeof p === "number" ? p : p.equity));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Simple period-over-period returns (fraction, e.g. 0.05 = +5%). */
export function simpleReturns(series: number[] | EquityPoint[]): number[] {
  const v = values(series);
  const out: number[] = [];
  for (let i = 1; i < v.length; i++) {
    const prev = v[i - 1]!;
    const cur = v[i]!;
    out.push(prev === 0 ? 0 : (cur - prev) / prev);
  }
  return out;
}

/** Total return from first to last sample, as a percent. */
export function totalReturnPct(series: number[] | EquityPoint[]): number {
  const v = values(series);
  if (v.length < 2) return 0;
  const first = v[0]!;
  const last = v[v.length - 1]!;
  if (first === 0) return 0;
  return round2(((last - first) / Math.abs(first)) * 100);
}

/** Largest peak-to-trough decline over the series (money + percent + indices). */
export function maxDrawdown(series: number[] | EquityPoint[]): {
  maxDrawdown: number;
  maxDrawdownPct: number;
  peakIndex: number;
  troughIndex: number;
} {
  const v = values(series);
  let peak = v[0] ?? 0;
  let peakIdx = 0;
  let maxDd = 0;
  let maxDdPct = 0;
  let ddPeakIdx = 0;
  let ddTroughIdx = 0;
  for (let i = 0; i < v.length; i++) {
    const cur = v[i]!;
    if (cur > peak) {
      peak = cur;
      peakIdx = i;
    }
    const dd = peak - cur;
    if (dd > maxDd) {
      maxDd = dd;
      maxDdPct = peak === 0 ? 0 : (dd / peak) * 100;
      ddPeakIdx = peakIdx;
      ddTroughIdx = i;
    }
  }
  return {
    maxDrawdown: round2(maxDd),
    maxDrawdownPct: round2(maxDdPct),
    peakIndex: ddPeakIdx,
    troughIndex: ddTroughIdx,
  };
}

/** Summary stats over an equity series. */
export function equityStats(series: number[] | EquityPoint[]): EquityStats {
  const v = values(series);
  const dd = maxDrawdown(v);
  return {
    points: v.length,
    start: round2(v[0] ?? 0),
    end: round2(v[v.length - 1] ?? 0),
    high: round2(v.length ? Math.max(...v) : 0),
    low: round2(v.length ? Math.min(...v) : 0),
    totalReturnPct: totalReturnPct(v),
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPct: dd.maxDrawdownPct,
  };
}
