/**
 * OHLCV candle utilities — resampling, gap detection and volume-weighted price.
 *
 * Pure data-shaping helpers: they aggregate and inspect price bars but compute
 * no technical indicators (that is `@lacspace/indicators`) and run no trading
 * engine (that is `@lacspace/paper-trade`).
 */

/** A single OHLCV price bar. `time` may be epoch-ms, a `Date`, or an ISO string. */
export interface Candle {
  time: number | Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Traded volume for the bar. Treated as 0 when omitted. */
  volume?: number;
}

function barMillis(t: number | Date | string): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return new Date(t).getTime();
}

/** Typical price of a bar: `(high + low + close) / 3`. */
export function typicalPrice(c: Candle): number {
  return (c.high + c.low + c.close) / 3;
}

/**
 * Aggregate finer-grained candles into a higher timeframe (e.g. 1m → 5m/1h/1d).
 * Bars are bucketed by `Math.floor(time / intervalMs) * intervalMs`; each output
 * bar keeps the first open, max high, min low, last close, summed volume, and a
 * numeric `time` at the bucket start. Input order is not assumed — bars are
 * sorted by time first.
 * @example resampleCandles(oneMinBars, 5 * 60_000) // 5-minute bars
 */
export function resampleCandles(candles: Candle[], intervalMs: number): Candle[] {
  if (intervalMs <= 0 || candles.length === 0) return [];
  const sorted = candles
    .map((c) => ({ c, t: barMillis(c.time) }))
    .sort((a, b) => a.t - b.t);

  const out: Candle[] = [];
  let bucketStart = NaN;
  let cur: Candle | null = null;
  for (const { c, t } of sorted) {
    const start = Math.floor(t / intervalMs) * intervalMs;
    if (cur === null || start !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = start;
      cur = {
        time: start,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume = (cur.volume ?? 0) + (c.volume ?? 0);
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** A run of missing bars detected in an otherwise fixed-interval series. */
export interface CandleGap {
  /** Time of the bar before the gap (epoch-ms). */
  from: number;
  /** Time of the bar after the gap (epoch-ms). */
  to: number;
  /** Number of bars missing between them. */
  missing: number;
}

/**
 * Find missing bars in a fixed-interval candle series. A gap is reported
 * whenever two consecutive bars are more than one `intervalMs` apart.
 * @example detectGaps(bars, 60_000) // [{ from, to, missing }]
 */
export function detectGaps(candles: Candle[], intervalMs: number): CandleGap[] {
  if (intervalMs <= 0 || candles.length < 2) return [];
  const times = candles.map((c) => barMillis(c.time)).sort((a, b) => a - b);
  const gaps: CandleGap[] = [];
  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1]!;
    const next = times[i]!;
    const missing = Math.round((next - prev) / intervalMs) - 1;
    if (missing > 0) gaps.push({ from: prev, to: next, missing });
  }
  return gaps;
}

/**
 * Volume-weighted average price across candles, using each bar's typical price
 * `(high + low + close) / 3`. Returns 0 for an empty series or when total volume
 * is 0.
 */
export function vwap(candles: Candle[]): number {
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const v = c.volume ?? 0;
    pv += typicalPrice(c) * v;
    vol += v;
  }
  return vol === 0 ? 0 : pv / vol;
}
