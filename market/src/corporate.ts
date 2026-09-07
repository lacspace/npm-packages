/**
 * Corporate-action price adjustment — back-adjust a historical close series for
 * splits, bonus issues and dividends so it lines up with post-event prices
 * ("adjusted close"). Pure array maths, no lookups.
 *
 * Convention: `atIndex` is the index of the first bar quoted in the NEW
 * (post-event) terms (the ex-date bar). Every bar BEFORE it is scaled by the
 * action's factor; the ex-date bar and everything after are left unchanged.
 */

function scaleBefore(prices: number[], atIndex: number, factor: number): number[] {
  return prices.map((p, i) => (i < atIndex ? p * factor : p));
}

/**
 * Adjust for a stock split. `ratio` is new-per-old, so a 2-for-1 split is
 * `ratio = 2` and halves every pre-split price.
 * @example adjustForSplit([100, 100, 50, 50], 2, 2) // [50, 50, 50, 50]
 */
export function adjustForSplit(prices: number[], ratio: number, atIndex: number): number[] {
  if (ratio <= 0) return prices.slice();
  return scaleBefore(prices, atIndex, 1 / ratio);
}

/**
 * Adjust for a bonus issue of `a` new shares for every `b` held (a:b). The
 * pre-event factor is `b / (a + b)`.
 * @example adjustForBonus([100, 100, 50, 50], 1, 1, 2) // [50, 50, 50, 50]
 */
export function adjustForBonus(prices: number[], a: number, b: number, atIndex: number): number[] {
  if (a < 0 || b <= 0) return prices.slice();
  return scaleBefore(prices, atIndex, b / (a + b));
}

/**
 * Adjust for a cash dividend of `amount` per share going ex at `atIndex`, using
 * that bar's close as reference: pre-event factor `(close − amount) / close`.
 * @example adjustForDividend([110, 110, 100], 10, 2) // [99, 99, 100]
 */
export function adjustForDividend(prices: number[], amount: number, atIndex: number): number[] {
  const ref = prices[atIndex];
  if (ref === undefined || ref <= 0 || amount <= 0) return prices.slice();
  return scaleBefore(prices, atIndex, (ref - amount) / ref);
}

/** A corporate action applied to a close series at a given bar index. */
export type CorporateAction =
  | { type: "split"; ratio: number; atIndex: number }
  | { type: "bonus"; a: number; b: number; atIndex: number }
  | { type: "dividend"; amount: number; atIndex: number };

/**
 * Apply a list of corporate actions to a close series and return the fully
 * back-adjusted series. Actions compose multiplicatively; dividend factors use
 * each action's reference close from the ORIGINAL (unadjusted) series.
 */
export function adjustClose(prices: number[], actions: CorporateAction[]): number[] {
  let out = prices.slice();
  for (const action of actions) {
    switch (action.type) {
      case "split":
        out = adjustForSplit(out, action.ratio, action.atIndex);
        break;
      case "bonus":
        out = adjustForBonus(out, action.a, action.b, action.atIndex);
        break;
      case "dividend": {
        const ref = prices[action.atIndex];
        if (ref !== undefined && ref > 0 && action.amount > 0) {
          out = scaleBefore(out, action.atIndex, (ref - action.amount) / ref);
        }
        break;
      }
    }
  }
  return out;
}
