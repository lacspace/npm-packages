/**
 * Return-series performance maths that complement the existing portfolio stats
 * (`volatility`, `sharpe`, `sortino`, `maxDrawdown`): log returns, cumulative
 * return and beta versus a benchmark.
 */

/**
 * Period-over-period log (continuously-compounded) returns from a price/equity
 * series: `ln(pₜ / pₜ₋₁)`. Steps where the previous value is ≤ 0 are skipped,
 * mirroring {@link simpleReturns}.
 * @example logReturns([100, 105, 110]) // [0.04879…, 0.04652…]
 */
export function logReturns(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const cur = series[i]!;
    if (prev > 0 && cur > 0) out.push(Math.log(cur / prev));
  }
  return out;
}

/**
 * Cumulative (geometrically-compounded) return of a simple-return series,
 * as a fraction: `∏(1 + rᵢ) − 1`. Empty input → 0.
 * @example cumulativeReturn([0.1, 0.1]) // 0.21
 */
export function cumulativeReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

/**
 * Beta of an asset versus a benchmark from two aligned return series:
 * `cov(asset, benchmark) / var(benchmark)` (sample covariance/variance).
 * Series are compared over their overlapping length. Returns `NaN` when fewer
 * than two paired points exist or the benchmark has zero variance.
 * @example beta([0.02, 0.04, -0.02], [0.01, 0.02, -0.01]) // 2
 */
export function beta(asset: number[], benchmark: number[]): number {
  const n = Math.min(asset.length, benchmark.length);
  if (n < 2) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += asset[i]!;
    mb += benchmark[i]!;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < n; i++) {
    const da = asset[i]! - ma;
    const db = benchmark[i]! - mb;
    cov += da * db;
    varb += db * db;
  }
  if (varb === 0) return NaN;
  return cov / varb;
}
