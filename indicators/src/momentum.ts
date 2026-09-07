/**
 * Momentum indicators — StochRSI, CCI, Williams %R, ROC, MFI.
 *
 * Added in 1.2.0. Same conventions as the core indicators: each is a small
 * class with an incremental `next()` plus a batch helper. Warm-up returns
 * `null`; every instance exposes `.value`.
 */
import { RSI, SMA, HLC } from "./index";

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`period must be a positive integer, got ${period}`);
  }
}

export interface StochRSIValue {
  /** Raw StochRSI (0–100) before %K smoothing. */
  stochRSI: number;
  /** %K — SMA-smoothed StochRSI. */
  k: number;
  /** %D — SMA of %K. */
  d: number;
}

/**
 * Stochastic RSI — the Stochastic oscillator applied to RSI. Defaults
 * 14 / 14 / 3 / 3 (rsi period, stoch lookback, %K smoothing, %D smoothing).
 */
export class StochRSI {
  private readonly rsi: RSI;
  private readonly kSma: SMA;
  private readonly dSma: SMA;
  private rsiBuf: number[] = [];
  value: StochRSIValue | null = null;

  constructor(
    public readonly rsiPeriod = 14,
    public readonly stochPeriod = 14,
    public readonly kSmooth = 3,
    public readonly dSmooth = 3,
  ) {
    assertPeriod(rsiPeriod);
    assertPeriod(stochPeriod);
    this.rsi = new RSI(rsiPeriod);
    this.kSma = new SMA(kSmooth);
    this.dSma = new SMA(dSmooth);
  }

  next(price: number): StochRSIValue | null {
    const r = this.rsi.next(price);
    if (r === null) return (this.value = null);
    this.rsiBuf.push(r);
    if (this.rsiBuf.length > this.stochPeriod) this.rsiBuf.shift();
    if (this.rsiBuf.length < this.stochPeriod) return (this.value = null);
    let hi = -Infinity;
    let lo = Infinity;
    for (const v of this.rsiBuf) {
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    const stochRSI = hi === lo ? 0 : ((r - lo) / (hi - lo)) * 100;
    const k = this.kSma.next(stochRSI);
    if (k === null) return (this.value = null);
    const d = this.dSma.next(k);
    if (d === null) return (this.value = null);
    return (this.value = { stochRSI, k, d });
  }
}

/**
 * Commodity Channel Index — `(TP − SMA(TP)) / (0.015 · meanDeviation)`, where
 * TP is the typical price `(H+L+C)/3`. Default period 20. Feed HLC bars.
 */
export class CCI {
  private tp: number[] = [];
  value: number | null = null;

  constructor(public readonly period = 20) {
    assertPeriod(period);
  }

  next(bar: HLC): number | null {
    const tp = (bar.high + bar.low + bar.close) / 3;
    this.tp.push(tp);
    if (this.tp.length > this.period) this.tp.shift();
    if (this.tp.length < this.period) return (this.value = null);
    const mean = this.tp.reduce((a, b) => a + b, 0) / this.period;
    let dev = 0;
    for (const v of this.tp) dev += Math.abs(v - mean);
    const meanDev = dev / this.period;
    return (this.value = meanDev === 0 ? 0 : (tp - mean) / (0.015 * meanDev));
  }
}

/**
 * Williams %R — `(highestHigh − close) / (highestHigh − lowestLow) · −100`,
 * ranging −100…0. Default period 14. Feed HLC bars.
 */
export class WilliamsR {
  private highs: number[] = [];
  private lows: number[] = [];
  value: number | null = null;

  constructor(public readonly period = 14) {
    assertPeriod(period);
  }

  next(bar: HLC): number | null {
    this.highs.push(bar.high);
    this.lows.push(bar.low);
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
    }
    if (this.highs.length < this.period) return (this.value = null);
    const hh = Math.max(...this.highs);
    const ll = Math.min(...this.lows);
    return (this.value = hh === ll ? 0 : ((hh - bar.close) / (hh - ll)) * -100);
  }
}

/**
 * Rate of Change — `(price − price[n ago]) / price[n ago] · 100`, in percent.
 * Default period 12. Warms up after `period + 1` samples.
 */
export class ROC {
  private buf: number[] = [];
  value: number | null = null;

  constructor(public readonly period = 12) {
    assertPeriod(period);
  }

  next(price: number): number | null {
    this.buf.push(price);
    if (this.buf.length > this.period + 1) this.buf.shift();
    if (this.buf.length < this.period + 1) return (this.value = null);
    const past = this.buf[0]!;
    return (this.value = past === 0 ? 0 : ((price - past) / past) * 100);
  }
}

/**
 * Money Flow Index — a volume-weighted RSI. Uses the typical price `(H+L+C)/3`
 * and raw money flow `TP · volume`. Default period 14. Feed high/low/close/volume
 * bars. Warms up after `period + 1` bars (needs a prior TP to classify flow).
 */
export class MFI {
  private prevTP: number | null = null;
  private pos: number[] = [];
  private neg: number[] = [];
  value: number | null = null;

  constructor(public readonly period = 14) {
    assertPeriod(period);
  }

  next(bar: { high: number; low: number; close: number; volume: number }): number | null {
    const tp = (bar.high + bar.low + bar.close) / 3;
    const flow = tp * bar.volume;
    if (this.prevTP === null) {
      this.prevTP = tp;
      return (this.value = null);
    }
    this.pos.push(tp > this.prevTP ? flow : 0);
    this.neg.push(tp < this.prevTP ? flow : 0);
    this.prevTP = tp;
    if (this.pos.length > this.period) {
      this.pos.shift();
      this.neg.shift();
    }
    if (this.pos.length < this.period) return (this.value = null);
    const posSum = this.pos.reduce((a, b) => a + b, 0);
    const negSum = this.neg.reduce((a, b) => a + b, 0);
    if (negSum === 0) return (this.value = posSum === 0 ? 50 : 100);
    const ratio = posSum / negSum;
    return (this.value = 100 - 100 / (1 + ratio));
  }
}

/* ------------------------------ batch helpers ------------------------------ */

export function stochRSI(
  values: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
): (StochRSIValue | null)[] {
  const ind = new StochRSI(rsiPeriod, stochPeriod, kSmooth, dSmooth);
  return values.map((v) => ind.next(v));
}

export function cci(bars: HLC[], period = 20): (number | null)[] {
  const ind = new CCI(period);
  return bars.map((b) => ind.next(b));
}

export function williamsR(bars: HLC[], period = 14): (number | null)[] {
  const ind = new WilliamsR(period);
  return bars.map((b) => ind.next(b));
}

export const roc = (values: number[], period = 12): (number | null)[] => {
  const ind = new ROC(period);
  return values.map((v) => ind.next(v));
};

export function mfi(
  bars: { high: number; low: number; close: number; volume: number }[],
  period = 14,
): (number | null)[] {
  const ind = new MFI(period);
  return bars.map((b) => ind.next(b));
}
