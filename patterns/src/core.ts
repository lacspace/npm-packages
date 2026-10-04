/** Shared bar type and the few series helpers the detectors need (Wilder ATR, volume profile). */

export interface Bar {
  /** Unix seconds (bar open). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Series = (number | null)[];

/** A horizontal box / line on the price pane. */
export interface StudyZone {
  /** First bar index. */
  from: number;
  /** Last bar index; null = runs to the right edge. */
  to: number | null;
  top: number;
  bottom: number;
  color: string;
  label?: string;
  /** Dashed outline / line instead of solid. */
  dashed?: boolean;
}

const nulls = (n: number): Series => new Array(n).fill(null);

/** Wilder's moving average (RMA), seeded with the SMA of the first `n` values. */
export function rma(values: Series, n: number): Series {
  const out = nulls(values.length);
  if (n < 1) return out;
  let prev: number | null = null;
  let seed = 0;
  let seen = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seed += v;
      seen++;
      if (seen === n) {
        prev = seed / n;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (n - 1) + v) / n;
    out[i] = prev;
  }
  return out;
}

export function trueRange(bars: Bar[]): Series {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** Average true range (Wilder). */
export function atr(bars: Bar[], n = 14): Series {
  return rma(trueRange(bars), n);
}

/** Volume by price: `rows` buckets, each with up and down volume, plus POC and the 70% value area. */
export function volumeProfile(bars: Bar[], rows = 24) {
  if (!bars.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); }
  if (!(hi > lo)) return null;
  const step = (hi - lo) / rows;
  const buckets = Array.from({ length: rows }, (_, k) => ({ lo: lo + k * step, hi: lo + (k + 1) * step, up: 0, down: 0 }));
  for (const b of bars) {
    if (!b.volume) continue;
    // Spread each bar's volume evenly over the price range it covered.
    const a = Math.max(0, Math.floor((b.low - lo) / step));
    const z = Math.min(rows - 1, Math.floor((b.high - lo) / step));
    const share = b.volume / (z - a + 1);
    for (let k = a; k <= z; k++) {
      if (b.close >= b.open) buckets[k].up += share; else buckets[k].down += share;
    }
  }
  let poc = 0;
  buckets.forEach((x, k) => { if (x.up + x.down > buckets[poc].up + buckets[poc].down) poc = k; });
  const total = buckets.reduce((s, x) => s + x.up + x.down, 0);
  let inVa = buckets[poc].up + buckets[poc].down, a = poc, z = poc;
  while (inVa < total * 0.7 && (a > 0 || z < rows - 1)) {
    const below = a > 0 ? buckets[a - 1].up + buckets[a - 1].down : -1;
    const above = z < rows - 1 ? buckets[z + 1].up + buckets[z + 1].down : -1;
    if (above >= below) { z++; inVa += above; } else { a--; inVa += below; }
  }
  return { buckets, poc, vaLow: buckets[a].lo, vaHigh: buckets[z].hi, max: Math.max(...buckets.map((x) => x.up + x.down)) };
}
