/**
 * Volume indicators — OBV, Accumulation/Distribution, Chaikin Money Flow.
 *
 * Added in 1.2.0. Same conventions as the core indicators: each is a small
 * class with an incremental `next()` plus a batch helper. Cumulative indicators
 * (OBV, A/D) emit from the first bar; CMF warms up over `period` bars.
 */

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`period must be a positive integer, got ${period}`);
  }
}

/** A high/low/close bar carrying volume — the input for volume indicators. */
export interface HLCV {
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Money-flow multiplier `((C−L)−(H−C))/(H−L)`, 0 when the bar has no range. */
function moneyFlowMultiplier(bar: HLCV): number {
  const range = bar.high - bar.low;
  if (range === 0) return 0;
  return ((bar.close - bar.low) - (bar.high - bar.close)) / range;
}

/**
 * On-Balance Volume — a running total that adds the bar's volume on an up-close
 * and subtracts it on a down-close. Cumulative; starts at 0 on the first bar.
 * Feed close/volume bars.
 */
export class OBV {
  private prevClose: number | null = null;
  private obv = 0;
  value: number | null = null;

  next(bar: { close: number; volume: number }): number {
    if (this.prevClose !== null) {
      if (bar.close > this.prevClose) this.obv += bar.volume;
      else if (bar.close < this.prevClose) this.obv -= bar.volume;
    }
    this.prevClose = bar.close;
    return (this.value = this.obv);
  }

  reset(): void {
    this.prevClose = null;
    this.obv = 0;
    this.value = null;
  }
}

/**
 * Accumulation/Distribution Line — cumulative sum of money-flow volume
 * (money-flow multiplier × volume). Feed high/low/close/volume bars.
 */
export class AccumulationDistribution {
  private adl = 0;
  value: number | null = null;

  next(bar: HLCV): number {
    this.adl += moneyFlowMultiplier(bar) * bar.volume;
    return (this.value = this.adl);
  }

  reset(): void {
    this.adl = 0;
    this.value = null;
  }
}

/**
 * Chaikin Money Flow — `Σ(money-flow volume) / Σ(volume)` over `period` bars
 * (default 20). Feed high/low/close/volume bars.
 */
export class ChaikinMoneyFlow {
  private mfv: number[] = [];
  private vol: number[] = [];
  value: number | null = null;

  constructor(public readonly period = 20) {
    assertPeriod(period);
  }

  next(bar: HLCV): number | null {
    this.mfv.push(moneyFlowMultiplier(bar) * bar.volume);
    this.vol.push(bar.volume);
    if (this.mfv.length > this.period) {
      this.mfv.shift();
      this.vol.shift();
    }
    if (this.mfv.length < this.period) return (this.value = null);
    const volSum = this.vol.reduce((a, b) => a + b, 0);
    if (volSum === 0) return (this.value = 0);
    const mfvSum = this.mfv.reduce((a, b) => a + b, 0);
    return (this.value = mfvSum / volSum);
  }
}

/* ------------------------------ batch helpers ------------------------------ */

export function obv(bars: { close: number; volume: number }[]): number[] {
  const ind = new OBV();
  return bars.map((b) => ind.next(b));
}

export function adl(bars: HLCV[]): number[] {
  const ind = new AccumulationDistribution();
  return bars.map((b) => ind.next(b));
}

export function cmf(bars: HLCV[], period = 20): (number | null)[] {
  const ind = new ChaikinMoneyFlow(period);
  return bars.map((b) => ind.next(b));
}
