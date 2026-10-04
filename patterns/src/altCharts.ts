/**
 * Time-independent chart types built from closes: Kagi and Point & Figure.
 * Like Renko and line break, each returns ordinary bars (so the price scale,
 * crosshair and studies keep working) plus the extra shape the chart's
 * overlay needs to draw them properly. Pure arithmetic on recorded bars.
 */
import type { Bar } from "./core";

/* ── Kagi ───────────────────────────────────────────────────────────────── */

export interface KagiLine {
  /** Thick (yang) at the start of this line. */
  yang: boolean;
  /** Price where the line changes thickness (passing the last shoulder / waist), if it does. */
  flipAt: number | null;
}

/**
 * Kagi: a line keeps going in one direction until price reverses by `rev`;
 * then it steps across and turns. It turns thick (yang) when it rises above the
 * previous shoulder (top) and thin (yin) when it falls below the previous
 * waist (bottom). Each line becomes one bar: open = where it starts, close =
 * where it ends.
 */
export function kagi(bars: Bar[], rev: number): { bars: Bar[]; lines: KagiLine[] } {
  const out: Bar[] = [];
  const lines: KagiLine[] = [];
  if (bars.length < 2 || !(rev > 0)) return { bars: out, lines };
  let dir = 0;
  let start = bars[0].close;
  let end = start;
  let t = bars[0].time;
  let vol = 0;
  let lastT = -Infinity;
  let shoulder: number | null = null; // top of the last up line
  let waist: number | null = null; // bottom of the last down line
  let yang = true;

  const close = () => {
    const time = Math.max(t, lastT + 1);
    lastT = time;
    let flipAt: number | null = null;
    const startYang = yang;
    if (dir > 0 && !yang && shoulder != null && end > shoulder) { flipAt = shoulder; yang = true; }
    if (dir < 0 && yang && waist != null && end < waist) { flipAt = waist; yang = false; }
    out.push({ time, open: start, high: Math.max(start, end), low: Math.min(start, end), close: end, volume: vol });
    lines.push({ yang: startYang, flipAt });
    if (dir > 0) shoulder = end;
    else waist = end;
    vol = 0;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const c = b.close;
    vol += b.volume || 0;
    if (dir === 0) {
      if (c >= start + rev || c <= start - rev) {
        dir = c > start ? 1 : -1;
        yang = dir > 0;
        end = c;
      }
      continue;
    }
    if (dir * (c - end) > 0) {
      end = c;
    } else if (dir * (end - c) >= rev) {
      close();
      start = end;
      end = c;
      dir = -dir;
      t = b.time;
    }
  }
  if (dir !== 0) close();
  return { bars: out, lines };
}

/* ── Point & Figure ─────────────────────────────────────────────────────── */

export interface PnfColumn {
  /** true = a column of X (rising), false = O (falling). */
  up: boolean;
  /** Lowest and highest box, as multiples of the box size. */
  lo: number;
  hi: number;
}

/**
 * Point & Figure (close method): X columns while price rises a box at a time,
 * O columns while it falls; a new column only after a reversal of `rev` boxes.
 * Box k sits at price k × box.
 */
export function pointFigure(bars: Bar[], box: number, rev = 3): { bars: Bar[]; cols: PnfColumn[] } {
  const out: Bar[] = [];
  const cols: PnfColumn[] = [];
  if (bars.length < 2 || !(box > 0)) return { bars: out, cols };
  const times: number[] = [];
  const vols: number[] = [];
  let lastT = -Infinity;
  let vol = 0;
  const k0 = Math.round(bars[0].close / box);
  let cur: PnfColumn | null = null;
  const open = (c: PnfColumn, time: number) => {
    const t = Math.max(time, lastT + 1);
    lastT = t;
    cols.push(c);
    times.push(t);
    vols.push(0);
    cur = c;
  };

  for (const b of bars) {
    const c = b.close;
    vol += b.volume || 0;
    const up = Math.floor(c / box + 1e-9);
    const dn = Math.ceil(c / box - 1e-9);
    if (!cur) {
      if (up >= k0 + 1) open({ up: true, lo: k0, hi: up }, b.time);
      else if (dn <= k0 - 1) open({ up: false, lo: dn, hi: k0 }, b.time);
    } else {
      const col: PnfColumn = cur;
      if (col.up) {
        if (up > col.hi) col.hi = up;
        else if (dn <= col.hi - rev) open({ up: false, lo: dn, hi: col.hi - 1 }, b.time);
      } else {
        if (dn < col.lo) col.lo = dn;
        else if (up >= col.lo + rev) open({ up: true, lo: col.lo + 1, hi: up }, b.time);
      }
    }
    if (cols.length) {
      vols[cols.length - 1] += vol;
      vol = 0;
    }
  }
  cols.forEach((c, k) => {
    const lo = c.lo * box - box / 2;
    const hi = c.hi * box + box / 2;
    out.push({ time: times[k], open: c.up ? lo : hi, high: hi, low: lo, close: c.up ? hi : lo, volume: vols[k] });
  });
  return { bars: out, cols };
}
