/**
 * @lacspace/indicators
 * Streaming technical indicators for stock-market apps.
 *
 * Every indicator is a small class with an incremental `next()` that updates in
 * O(1) (or O(period) for window-based ones) — push one live tick, get the new
 * value, without recomputing the whole series. Perfect for live LTP feeds.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  time?: number;
}

/** A high/low/close bar — the minimum most range-based indicators need. */
export interface HLC {
  high: number;
  low: number;
  close: number;
}

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`period must be a positive integer, got ${period}`);
  }
}

/** Simple Moving Average. Incremental O(1) using a running window sum. */
export class SMA {
  private buf: number[] = [];
  private sum = 0;
  /** Latest value, or `null` until `period` samples have been seen. */
  value: number | null = null;

  constructor(public readonly period: number) {
    assertPeriod(period);
  }

  next(price: number): number | null {
    this.buf.push(price);
    this.sum += price;
    if (this.buf.length > this.period) this.sum -= this.buf.shift()!;
    this.value = this.buf.length === this.period ? this.sum / this.period : null;
    return this.value;
  }
}

/** Exponential Moving Average. Seeded with an SMA of the first `period` values. */
export class EMA {
  private readonly k: number;
  private seed: number[] = [];
  private ema: number | null = null;
  value: number | null = null;

  constructor(public readonly period: number) {
    assertPeriod(period);
    this.k = 2 / (period + 1);
  }

  next(price: number): number | null {
    if (this.ema === null) {
      this.seed.push(price);
      if (this.seed.length < this.period) return (this.value = null);
      this.ema = this.seed.reduce((a, b) => a + b, 0) / this.period;
    } else {
      this.ema = price * this.k + this.ema * (1 - this.k);
    }
    return (this.value = this.ema);
  }
}

/** Weighted Moving Average — recent samples weighted linearly higher. */
export class WMA {
  private buf: number[] = [];
  value: number | null = null;

  constructor(public readonly period: number) {
    assertPeriod(period);
  }

  next(price: number): number | null {
    this.buf.push(price);
    if (this.buf.length > this.period) this.buf.shift();
    if (this.buf.length < this.period) return (this.value = null);
    let num = 0;
    let den = 0;
    for (let i = 0; i < this.period; i++) {
      const w = i + 1;
      num += this.buf[i]! * w;
      den += w;
    }
    return (this.value = num / den);
  }
}

/** Relative Strength Index (Wilder's smoothing). O(1) per tick. */
export class RSI {
  private prev: number | null = null;
  private avgGain = 0;
  private avgLoss = 0;
  private count = 0;
  value: number | null = null;

  constructor(public readonly period: number = 14) {
    assertPeriod(period);
  }

  next(price: number): number | null {
    if (this.prev === null) {
      this.prev = price;
      return (this.value = null);
    }
    const change = price - this.prev;
    this.prev = price;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    this.count++;

    if (this.count <= this.period) {
      this.avgGain += gain;
      this.avgLoss += loss;
      if (this.count < this.period) return (this.value = null);
      this.avgGain /= this.period;
      this.avgLoss /= this.period;
    } else {
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }
    return (this.value = this.compute());
  }

  private compute(): number {
    if (this.avgLoss === 0) return 100;
    const rs = this.avgGain / this.avgLoss;
    return 100 - 100 / (1 + rs);
  }
}

export interface MACDValue {
  macd: number;
  signal: number;
  histogram: number;
}

/** Moving Average Convergence Divergence. Defaults 12 / 26 / 9. */
export class MACD {
  private readonly fastEma: EMA;
  private readonly slowEma: EMA;
  private readonly signalEma: EMA;
  value: MACDValue | null = null;

  constructor(fast = 12, slow = 26, signal = 9) {
    this.fastEma = new EMA(fast);
    this.slowEma = new EMA(slow);
    this.signalEma = new EMA(signal);
  }

  next(price: number): MACDValue | null {
    const f = this.fastEma.next(price);
    const s = this.slowEma.next(price);
    if (f === null || s === null) return (this.value = null);
    const macd = f - s;
    const signal = this.signalEma.next(macd);
    if (signal === null) return (this.value = null);
    return (this.value = { macd, signal, histogram: macd - signal });
  }
}

export interface BollingerValue {
  middle: number;
  upper: number;
  lower: number;
  /** (upper - lower) / middle — normalised band width. */
  bandwidth: number;
}

/** Bollinger Bands — SMA middle band ± `mult` standard deviations. */
export class BollingerBands {
  private buf: number[] = [];
  private sum = 0;
  value: BollingerValue | null = null;

  constructor(
    public readonly period = 20,
    public readonly mult = 2,
  ) {
    assertPeriod(period);
  }

  next(price: number): BollingerValue | null {
    this.buf.push(price);
    this.sum += price;
    if (this.buf.length > this.period) this.sum -= this.buf.shift()!;
    if (this.buf.length < this.period) return (this.value = null);
    const mean = this.sum / this.period;
    let variance = 0;
    for (const v of this.buf) variance += (v - mean) ** 2;
    const sd = Math.sqrt(variance / this.period);
    const upper = mean + this.mult * sd;
    const lower = mean - this.mult * sd;
    return (this.value = {
      middle: mean,
      upper,
      lower,
      bandwidth: mean === 0 ? 0 : (upper - lower) / mean,
    });
  }
}

/** Average True Range (Wilder). Feed it high/low/close bars. */
export class ATR {
  private prevClose: number | null = null;
  private atr: number | null = null;
  private seed: number[] = [];
  value: number | null = null;

  constructor(public readonly period = 14) {
    assertPeriod(period);
  }

  next(bar: HLC): number | null {
    const tr =
      this.prevClose === null
        ? bar.high - bar.low
        : Math.max(
            bar.high - bar.low,
            Math.abs(bar.high - this.prevClose),
            Math.abs(bar.low - this.prevClose),
          );
    this.prevClose = bar.close;

    if (this.atr === null) {
      this.seed.push(tr);
      if (this.seed.length < this.period) return (this.value = null);
      this.atr = this.seed.reduce((a, b) => a + b, 0) / this.period;
      return (this.value = this.atr);
    }
    this.atr = (this.atr * (this.period - 1) + tr) / this.period;
    return (this.value = this.atr);
  }
}

/** Volume-Weighted Average Price. Cumulative — call `reset()` per session. */
export class VWAP {
  private pv = 0;
  private vol = 0;
  value: number | null = null;

  next(bar: Required<Pick<Candle, "high" | "low" | "close" | "volume">>): number | null {
    const typical = (bar.high + bar.low + bar.close) / 3;
    this.pv += typical * bar.volume;
    this.vol += bar.volume;
    return (this.value = this.vol === 0 ? null : this.pv / this.vol);
  }

  reset(): void {
    this.pv = 0;
    this.vol = 0;
    this.value = null;
  }
}

export interface StochasticValue {
  /** %K — position of close within the recent high/low range (0–100). */
  k: number;
  /** %D — SMA of %K. */
  d: number;
}

/** Stochastic Oscillator (%K / %D). */
export class Stochastic {
  private highs: number[] = [];
  private lows: number[] = [];
  private readonly dSma: SMA;
  value: StochasticValue | null = null;

  constructor(
    public readonly period = 14,
    public readonly signal = 3,
  ) {
    assertPeriod(period);
    this.dSma = new SMA(signal);
  }

  next(bar: HLC): StochasticValue | null {
    this.highs.push(bar.high);
    this.lows.push(bar.low);
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
    }
    if (this.highs.length < this.period) return (this.value = null);
    const hh = Math.max(...this.highs);
    const ll = Math.min(...this.lows);
    const k = hh === ll ? 100 : ((bar.close - ll) / (hh - ll)) * 100;
    const d = this.dSma.next(k);
    if (d === null) return (this.value = null);
    return (this.value = { k, d });
  }
}

export interface SupertrendValue {
  value: number;
  /** 1 = uptrend (price above band), -1 = downtrend. */
  direction: 1 | -1;
}

/** Supertrend — ATR-based trend follower. Defaults period 10, multiplier 3. */
export class Supertrend {
  private readonly atr: ATR;
  private prevClose: number | null = null;
  private prevFinalUpper = 0;
  private prevFinalLower = 0;
  private prevSupertrend: number | null = null;
  value: SupertrendValue | null = null;

  constructor(
    public readonly period = 10,
    public readonly mult = 3,
  ) {
    this.atr = new ATR(period);
  }

  next(bar: HLC): SupertrendValue | null {
    const atr = this.atr.next(bar);
    if (atr === null) {
      this.prevClose = bar.close;
      return (this.value = null);
    }
    const hl2 = (bar.high + bar.low) / 2;
    const basicUpper = hl2 + this.mult * atr;
    const basicLower = hl2 - this.mult * atr;
    const pc = this.prevClose ?? bar.close;

    const first = this.prevSupertrend === null;
    const finalUpper =
      first || basicUpper < this.prevFinalUpper || pc > this.prevFinalUpper
        ? basicUpper
        : this.prevFinalUpper;
    const finalLower =
      first || basicLower > this.prevFinalLower || pc < this.prevFinalLower
        ? basicLower
        : this.prevFinalLower;

    let st: number;
    let direction: 1 | -1;
    if (first) {
      direction = bar.close <= finalUpper ? -1 : 1;
      st = direction === -1 ? finalUpper : finalLower;
    } else if (this.prevSupertrend === this.prevFinalUpper) {
      if (bar.close <= finalUpper) {
        st = finalUpper;
        direction = -1;
      } else {
        st = finalLower;
        direction = 1;
      }
    } else {
      if (bar.close >= finalLower) {
        st = finalLower;
        direction = 1;
      } else {
        st = finalUpper;
        direction = -1;
      }
    }

    this.prevFinalUpper = finalUpper;
    this.prevFinalLower = finalLower;
    this.prevSupertrend = st;
    this.prevClose = bar.close;
    return (this.value = { value: st, direction });
  }
}

export interface ADXValue {
  adx: number;
  plusDI: number;
  minusDI: number;
}

/** Average Directional Index with +DI / -DI (Wilder). */
export class ADX {
  private prevHigh: number | null = null;
  private prevLow = 0;
  private prevClose = 0;
  private smTR = 0;
  private smPDM = 0;
  private smMDM = 0;
  private dxs: number[] = [];
  private adx: number | null = null;
  private count = 0;
  value: ADXValue | null = null;

  constructor(public readonly period = 14) {
    assertPeriod(period);
  }

  next(bar: HLC): ADXValue | null {
    if (this.prevHigh === null) {
      this.prevHigh = bar.high;
      this.prevLow = bar.low;
      this.prevClose = bar.close;
      return (this.value = null);
    }
    const upMove = bar.high - this.prevHigh;
    const downMove = this.prevLow - bar.low;
    const pdm = upMove > downMove && upMove > 0 ? upMove : 0;
    const mdm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - this.prevClose),
      Math.abs(bar.low - this.prevClose),
    );
    this.prevHigh = bar.high;
    this.prevLow = bar.low;
    this.prevClose = bar.close;
    this.count++;

    if (this.count <= this.period) {
      this.smTR += tr;
      this.smPDM += pdm;
      this.smMDM += mdm;
      if (this.count < this.period) return (this.value = null);
    } else {
      this.smTR = this.smTR - this.smTR / this.period + tr;
      this.smPDM = this.smPDM - this.smPDM / this.period + pdm;
      this.smMDM = this.smMDM - this.smMDM / this.period + mdm;
    }

    const plusDI = this.smTR === 0 ? 0 : (100 * this.smPDM) / this.smTR;
    const minusDI = this.smTR === 0 ? 0 : (100 * this.smMDM) / this.smTR;
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / diSum;

    if (this.adx === null) {
      this.dxs.push(dx);
      if (this.dxs.length < this.period) return (this.value = null);
      this.adx = this.dxs.reduce((a, b) => a + b, 0) / this.period;
    } else {
      this.adx = (this.adx * (this.period - 1) + dx) / this.period;
    }
    return (this.value = { adx: this.adx, plusDI, minusDI });
  }
}

/* ------------------------------------------------------------------ *
 * Batch helpers — run an indicator over an existing array in one call.
 * Each returns an array aligned to the input (nulls during warm-up).
 * ------------------------------------------------------------------ */

function runNumber<T extends { next(v: number): number | null }>(
  ind: T,
  values: number[],
): (number | null)[] {
  return values.map((v) => ind.next(v));
}

export const sma = (values: number[], period: number) => runNumber(new SMA(period), values);
export const ema = (values: number[], period: number) => runNumber(new EMA(period), values);
export const wma = (values: number[], period: number) => runNumber(new WMA(period), values);
export const rsi = (values: number[], period = 14) => runNumber(new RSI(period), values);

export function macd(values: number[], fast = 12, slow = 26, signal = 9): (MACDValue | null)[] {
  const ind = new MACD(fast, slow, signal);
  return values.map((v) => ind.next(v));
}

export function bollinger(values: number[], period = 20, mult = 2): (BollingerValue | null)[] {
  const ind = new BollingerBands(period, mult);
  return values.map((v) => ind.next(v));
}

export function atr(bars: HLC[], period = 14): (number | null)[] {
  const ind = new ATR(period);
  return bars.map((b) => ind.next(b));
}

export function supertrend(bars: HLC[], period = 10, mult = 3): (SupertrendValue | null)[] {
  const ind = new Supertrend(period, mult);
  return bars.map((b) => ind.next(b));
}

export function adx(bars: HLC[], period = 14): (ADXValue | null)[] {
  const ind = new ADX(period);
  return bars.map((b) => ind.next(b));
}

/* ------------------------------------------------------------------ *
 * Crossover helpers — the backbone of most signal logic.
 * ------------------------------------------------------------------ */

/** True when series A crossed from at-or-below B to strictly above B. */
export function crossedAbove(
  prev: { a: number; b: number },
  curr: { a: number; b: number },
): boolean {
  return prev.a <= prev.b && curr.a > curr.b;
}

/** True when series A crossed from at-or-above B to strictly below B. */
export function crossedBelow(
  prev: { a: number; b: number },
  curr: { a: number; b: number },
): boolean {
  return prev.a >= prev.b && curr.a < curr.b;
}
