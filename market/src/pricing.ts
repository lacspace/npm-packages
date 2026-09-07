/**
 * Small price/quantity maths that pair with `roundToTick` and `circuitLimits`:
 * lot-size rounding and bid/ask spread.
 */

/**
 * Round a quantity DOWN to a whole multiple of the exchange lot/board size
 * (e.g. F&O lots). `lotSize <= 0` returns the quantity unchanged.
 * @example roundToLot(147, 25) // 125
 */
export function roundToLot(qty: number, lotSize = 1): number {
  if (lotSize <= 0) return qty;
  return Math.floor(qty / lotSize) * lotSize;
}

/** Bid/ask spread decomposition. */
export interface Spread {
  /** `ask − bid`. */
  absolute: number;
  /** Mid price `(bid + ask) / 2`. */
  mid: number;
  /** Spread as a percentage of the mid price. 0 when mid is 0. */
  percent: number;
}

/**
 * Bid/ask spread: absolute width, mid price and spread as a percent of mid.
 * @example spread(99, 101) // { absolute: 2, mid: 100, percent: 2 }
 */
export function spread(bid: number, ask: number): Spread {
  const absolute = ask - bid;
  const mid = (bid + ask) / 2;
  return { absolute, mid, percent: mid === 0 ? 0 : (absolute / mid) * 100 };
}
