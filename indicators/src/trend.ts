/**
 * Trend indicators — DEMA, TEMA, Parabolic SAR, Ichimoku Cloud.
 *
 * Added in 1.2.0. Same conventions as the core indicators: each is a small
 * class with an incremental `next()` (O(1)/O(period)) plus a batch helper.
 * Warm-up returns `null`; every instance exposes `.value`.
 */
import { EMA, HLC } from "./index";

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`period must be a positive integer, got ${period}`);
  }
}

/**
 * Double Exponential Moving Average — `2·EMA − EMA(EMA)`, a lag-reduced EMA.
 * Warms up after `2·period − 1` samples (both EMAs seeded).
 */
export class DEMA {
  private readonly ema1: EMA;
  private readonly ema2: EMA;
  value: number | null = null;

  constructor(public readonly period: number) {
    assertPeriod(period);
    this.ema1 = new EMA(period);
    this.ema2 = new EMA(period);
  }

  next(price: number): number | null {
    const e1 = this.ema1.next(price);
    if (e1 === null) return (this.value = null);
    const e2 = this.ema2.next(e1);
    if (e2 === null) return (this.value = null);
    return (this.value = 2 * e1 - e2);
  }
}

/**
 * Triple Exponential Moving Average — `3·EMA1 − 3·EMA2 + EMA3`, less lag than DEMA.
 * Warms up after `3·period − 2` samples.
 */
export class TEMA {
  private readonly ema1: EMA;
  private readonly ema2: EMA;
  private readonly ema3: EMA;
  value: number | null = null;

  constructor(public readonly period: number) {
    assertPeriod(period);
    this.ema1 = new EMA(period);
    this.ema2 = new EMA(period);
    this.ema3 = new EMA(period);
  }

  next(price: number): number | null {
    const e1 = this.ema1.next(price);
    if (e1 === null) return (this.value = null);
    const e2 = this.ema2.next(e1);
    if (e2 === null) return (this.value = null);
    const e3 = this.ema3.next(e2);
    if (e3 === null) return (this.value = null);
    return (this.value = 3 * e1 - 3 * e2 + e3);
  }
}

export interface ParabolicSARValue {
  value: number;
  /** 1 = long/uptrend (SAR below price), -1 = short/downtrend. */
  direction: 1 | -1;
}

/**
 * Parabolic SAR (Wilder). Feed high/low/close bars; `step` is the acceleration
 * factor increment (default 0.02), `max` its ceiling (default 0.2). Needs two
 * bars to establish the initial trend.
 */
export class ParabolicSAR {
  private sar = 0;
  private ep = 0;
  private af = 0;
  private isLong = true;
  private bars = 0;
  private firstHigh = 0;
  private firstLow = 0;
  private firstClose = 0;
  private prevHigh = 0;
  private prevLow = 0;
  private prevPrevHigh = 0;
  private prevPrevLow = 0;
  value: ParabolicSARValue | null = null;

  constructor(
    public readonly step = 0.02,
    public readonly max = 0.2,
  ) {
    if (!(step > 0)) throw new RangeError(`step must be > 0, got ${step}`);
    if (!(max >= step)) throw new RangeError(`max must be >= step, got ${max}`);
  }

  next(bar: HLC): ParabolicSARValue | null {
    this.bars++;
    if (this.bars === 1) {
      this.firstHigh = bar.high;
      this.firstLow = bar.low;
      this.firstClose = bar.close;
      this.prevHigh = bar.high;
      this.prevLow = bar.low;
      return (this.value = null);
    }
    if (this.bars === 2) {
      this.isLong = bar.close >= this.firstClose;
      if (this.isLong) {
        this.ep = Math.max(this.firstHigh, bar.high);
        this.sar = Math.min(this.firstLow, bar.low);
      } else {
        this.ep = Math.min(this.firstLow, bar.low);
        this.sar = Math.max(this.firstHigh, bar.high);
      }
      this.af = this.step;
      this.prevPrevHigh = this.prevHigh;
      this.prevPrevLow = this.prevLow;
      this.prevHigh = bar.high;
      this.prevLow = bar.low;
      return (this.value = { value: this.sar, direction: this.isLong ? 1 : -1 });
    }

    let sar = this.sar + this.af * (this.ep - this.sar);
    if (this.isLong) {
      // SAR can't rise above the prior two lows.
      sar = Math.min(sar, this.prevLow, this.prevPrevLow);
      if (bar.high > this.ep) {
        this.ep = bar.high;
        this.af = Math.min(this.af + this.step, this.max);
      }
      if (bar.low < sar) {
        this.isLong = false;
        sar = this.ep;
        this.ep = bar.low;
        this.af = this.step;
      }
    } else {
      // SAR can't fall below the prior two highs.
      sar = Math.max(sar, this.prevHigh, this.prevPrevHigh);
      if (bar.low < this.ep) {
        this.ep = bar.low;
        this.af = Math.min(this.af + this.step, this.max);
      }
      if (bar.high > sar) {
        this.isLong = true;
        sar = this.ep;
        this.ep = bar.high;
        this.af = this.step;
      }
    }

    this.sar = sar;
    this.prevPrevHigh = this.prevHigh;
    this.prevPrevLow = this.prevLow;
    this.prevHigh = bar.high;
    this.prevLow = bar.low;
    return (this.value = { value: sar, direction: this.isLong ? 1 : -1 });
  }
}

export interface IchimokuValue {
  /** Tenkan-sen (conversion line). */
  conversion: number;
  /** Kijun-sen (base line). */
  base: number;
  /** Senkou Span A (leading span A), un-displaced. */
  spanA: number;
  /** Senkou Span B (leading span B), un-displaced. */
  spanB: number;
}

/**
 * Ichimoku Cloud. Feed high/low/close bars. Returns the four lines once the
 * longest window (`spanBPeriod`) has filled. The leading spans are returned
 * un-displaced (compute the +`displacement` plotting offset yourself); the
 * Chikou span is simply the close plotted `displacement` bars back.
 */
export class Ichimoku {
  private highs: number[] = [];
  private lows: number[] = [];
  value: IchimokuValue | null = null;

  constructor(
    public readonly conversionPeriod = 9,
    public readonly basePeriod = 26,
    public readonly spanBPeriod = 52,
    public readonly displacement = 26,
  ) {
    assertPeriod(conversionPeriod);
    assertPeriod(basePeriod);
    assertPeriod(spanBPeriod);
  }

  private midpoint(period: number): number {
    const n = this.highs.length;
    let hh = -Infinity;
    let ll = Infinity;
    for (let i = n - period; i < n; i++) {
      if (this.highs[i]! > hh) hh = this.highs[i]!;
      if (this.lows[i]! < ll) ll = this.lows[i]!;
    }
    return (hh + ll) / 2;
  }

  next(bar: HLC): IchimokuValue | null {
    this.highs.push(bar.high);
    this.lows.push(bar.low);
    const cap = this.spanBPeriod + 1;
    if (this.highs.length > cap) {
      this.highs.shift();
      this.lows.shift();
    }
    if (this.highs.length < this.spanBPeriod) return (this.value = null);
    const conversion = this.midpoint(this.conversionPeriod);
    const base = this.midpoint(this.basePeriod);
    const spanA = (conversion + base) / 2;
    const spanB = this.midpoint(this.spanBPeriod);
    return (this.value = { conversion, base, spanA, spanB });
  }
}

/* ------------------------------ batch helpers ------------------------------ */

export const dema = (values: number[], period: number): (number | null)[] => {
  const ind = new DEMA(period);
  return values.map((v) => ind.next(v));
};

export const tema = (values: number[], period: number): (number | null)[] => {
  const ind = new TEMA(period);
  return values.map((v) => ind.next(v));
};

export function parabolicSAR(bars: HLC[], step = 0.02, max = 0.2): (ParabolicSARValue | null)[] {
  const ind = new ParabolicSAR(step, max);
  return bars.map((b) => ind.next(b));
}

export function ichimoku(
  bars: HLC[],
  conversionPeriod = 9,
  basePeriod = 26,
  spanBPeriod = 52,
  displacement = 26,
): (IchimokuValue | null)[] {
  const ind = new Ichimoku(conversionPeriod, basePeriod, spanBPeriod, displacement);
  return bars.map((b) => ind.next(b));
}
