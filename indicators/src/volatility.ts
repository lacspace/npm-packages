/**
 * Volatility indicators — standard deviation, Keltner Channels, Donchian Channels.
 *
 * Added in 1.2.0. Same conventions as the core indicators: each is a small
 * class with an incremental `next()` plus a batch helper. Warm-up returns
 * `null`; every instance exposes `.value`.
 */
import { EMA, ATR, HLC } from "./index";

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`period must be a positive integer, got ${period}`);
  }
}

/**
 * Rolling population standard deviation over `period` samples — the same
 * (variance / period) convention used by {@link BollingerBands}.
 */
export class StdDev {
  private buf: number[] = [];
  private sum = 0;
  value: number | null = null;

  constructor(public readonly period: number) {
    assertPeriod(period);
  }

  next(price: number): number | null {
    this.buf.push(price);
    this.sum += price;
    if (this.buf.length > this.period) this.sum -= this.buf.shift()!;
    if (this.buf.length < this.period) return (this.value = null);
    const mean = this.sum / this.period;
    let variance = 0;
    for (const v of this.buf) variance += (v - mean) ** 2;
    return (this.value = Math.sqrt(variance / this.period));
  }
}

export interface KeltnerValue {
  /** Middle band — EMA of close. */
  middle: number;
  upper: number;
  lower: number;
}

/**
 * Keltner Channels — an EMA middle band with an ATR envelope: `EMA(period) ±
 * mult · ATR(atrPeriod)`. Defaults period 20, multiplier 2, `atrPeriod` = period.
 * Feed high/low/close bars.
 */
export class KeltnerChannels {
  private readonly ema: EMA;
  private readonly atr: ATR;
  value: KeltnerValue | null = null;

  constructor(
    public readonly period = 20,
    public readonly mult = 2,
    public readonly atrPeriod = period,
  ) {
    assertPeriod(period);
    this.ema = new EMA(period);
    this.atr = new ATR(atrPeriod);
  }

  next(bar: HLC): KeltnerValue | null {
    const mid = this.ema.next(bar.close);
    const range = this.atr.next(bar);
    if (mid === null || range === null) return (this.value = null);
    return (this.value = {
      middle: mid,
      upper: mid + this.mult * range,
      lower: mid - this.mult * range,
    });
  }
}

export interface DonchianValue {
  upper: number;
  lower: number;
  /** Midline — `(upper + lower) / 2`. */
  middle: number;
}

/**
 * Donchian Channels — highest high and lowest low over `period` bars (default 20).
 * Feed high/low bars (close is ignored).
 */
export class DonchianChannels {
  private highs: number[] = [];
  private lows: number[] = [];
  value: DonchianValue | null = null;

  constructor(public readonly period = 20) {
    assertPeriod(period);
  }

  next(bar: { high: number; low: number }): DonchianValue | null {
    this.highs.push(bar.high);
    this.lows.push(bar.low);
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
    }
    if (this.highs.length < this.period) return (this.value = null);
    const upper = Math.max(...this.highs);
    const lower = Math.min(...this.lows);
    return (this.value = { upper, lower, middle: (upper + lower) / 2 });
  }
}

/* ------------------------------ batch helpers ------------------------------ */

export const stddev = (values: number[], period: number): (number | null)[] => {
  const ind = new StdDev(period);
  return values.map((v) => ind.next(v));
};

export function keltner(
  bars: HLC[],
  period = 20,
  mult = 2,
  atrPeriod = period,
): (KeltnerValue | null)[] {
  const ind = new KeltnerChannels(period, mult, atrPeriod);
  return bars.map((b) => ind.next(b));
}

export function donchian(
  bars: { high: number; low: number }[],
  period = 20,
): (DonchianValue | null)[] {
  const ind = new DonchianChannels(period);
  return bars.map((b) => ind.next(b));
}
