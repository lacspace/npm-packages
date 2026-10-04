/**
 * Pattern recognition on recorded bars: harmonic patterns (Gartley, Bat,
 * Butterfly, Crab, Cypher, AB=CD), an Elliott-wave impulse count, classic chart
 * patterns (double tops/bottoms, head & shoulders, triangles, wedges,
 * channels) and per-session market / volume profiles.
 *
 * Everything is found from ATR-sized swings, so the same settings work on a
 * 5-minute chart and a weekly one. These are rule-based detections of
 * geometry already on the chart — descriptive, never a forecast. Wave counts
 * in particular are subjective; this shows one count that obeys the rules.
 */
import { atr, volumeProfile, type Bar, type StudyZone } from "./core";

/** A polyline on the price pane. `i` is a bar index (may run past the last bar for projections). */
export interface StudyPath {
  pts: { i: number; p: number; label?: string }[];
  color: string;
  width?: number;
  dashed?: boolean;
  /** Fill the closed polygon with this colour at low opacity. */
  fill?: boolean;
  /** Name drawn beside the last point (or `labelAt`). */
  label?: string;
  labelAt?: number;
}

/** A histogram drawn inside one session (TPO letters or volume). */
export interface StudyProfile {
  from: number;
  to: number;
  rows: { lo: number; hi: number; v: number; up?: number; letters?: string }[];
  poc: number;
  vaLow: number;
  vaHigh: number;
  /** Initial balance (first hour) for TPO profiles. */
  ib?: { lo: number; hi: number };
  kind: "tpo" | "vol";
  color: string;
}

export interface Pivot {
  i: number;
  p: number;
  hi: boolean;
}

/* ── swings ─────────────────────────────────────────────────────────────── */

/**
 * Alternating swing highs and lows: a swing is confirmed once price moves
 * `k` × ATR(14) away from it. The last, still-forming extreme is returned as
 * `tail` (not yet confirmed).
 */
export function swings(bars: Bar[], k = 2): { piv: Pivot[]; tail: Pivot | null; atr: number[] } {
  const n = bars.length;
  const a = atr(bars, 14);
  const at: number[] = new Array(n);
  let rs = 0;
  for (let i = 0; i < n; i++) {
    rs += bars[i].high - bars[i].low;
    at[i] = a[i] ?? rs / (i + 1);
  }
  const piv: Pivot[] = [];
  if (n < 3) return { piv, tail: null, atr: at };
  let trend = 0;
  let hiI = 0;
  let loI = 0;
  for (let i = 1; i < n; i++) {
    const t = at[i] * k;
    const b = bars[i];
    if (trend === 0) {
      if (b.high >= bars[hiI].high) hiI = i;
      if (b.low <= bars[loI].low) loI = i;
      if (bars[hiI].high - bars[loI].low >= t) {
        if (hiI > loI) { piv.push({ i: loI, p: bars[loI].low, hi: false }); trend = 1; }
        else { piv.push({ i: hiI, p: bars[hiI].high, hi: true }); trend = -1; }
      }
    } else if (trend === 1) {
      if (b.high >= bars[hiI].high) hiI = i;
      else if (bars[hiI].high - b.low >= t) { piv.push({ i: hiI, p: bars[hiI].high, hi: true }); trend = -1; loI = i; }
    } else {
      if (b.low <= bars[loI].low) loI = i;
      else if (b.high - bars[loI].low >= t) { piv.push({ i: loI, p: bars[loI].low, hi: false }); trend = 1; hiI = i; }
    }
  }
  const tail = trend === 1 ? { i: hiI, p: bars[hiI].high, hi: true } : trend === -1 ? { i: loI, p: bars[loI].low, hi: false } : null;
  return { piv, tail, atr: at };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(2));

/* ── harmonic patterns ──────────────────────────────────────────────────── */

type Range = [number, number];
interface HarmDef {
  name: string;
  ab: Range;
  bc: Range;
  cd: Range;
  /** D as a retracement / extension of XA. */
  xd: Range;
}
const HARMONICS: HarmDef[] = [
  { name: "Gartley", ab: [0.618, 0.618], bc: [0.382, 0.886], cd: [1.13, 1.618], xd: [0.786, 0.786] },
  { name: "Bat", ab: [0.382, 0.5], bc: [0.382, 0.886], cd: [1.618, 2.618], xd: [0.886, 0.886] },
  { name: "Alt Bat", ab: [0.382, 0.382], bc: [0.382, 0.886], cd: [2, 3.618], xd: [1.13, 1.13] },
  { name: "Butterfly", ab: [0.786, 0.786], bc: [0.382, 0.886], cd: [1.618, 2.618], xd: [1.27, 1.618] },
  { name: "Crab", ab: [0.382, 0.618], bc: [0.382, 0.886], cd: [2.24, 3.618], xd: [1.618, 1.618] },
  { name: "Deep Crab", ab: [0.886, 0.886], bc: [0.382, 0.886], cd: [2, 3.618], xd: [1.618, 1.618] },
];
const inR = (v: number, r: Range, tol: number) => v >= r[0] * (1 - tol) && v <= r[1] * (1 + tol);

export interface HarmonicHit {
  name: string;
  bull: boolean;
  pts: Pivot[];
  /** D not yet confirmed as a swing. */
  forming: boolean;
}

/**
 * Harmonic XABCD patterns on the swings. Completed ones (D already reached)
 * are drawn as two triangles; a pattern still waiting for D shows its
 * potential reversal zone (where D would complete) as a dashed box.
 */
export function harmonics(bars: Bar[], k = 2, tolPct = 6, show = 3, up = "#16A34A", down = "#DC2626") {
  const { piv, tail } = swings(bars, k);
  const all = tail ? [...piv, tail] : piv;
  const tol = tolPct / 100;
  const hits: HarmonicHit[] = [];
  const legLen = (a: Pivot, b: Pivot) => Math.abs(b.p - a.p);

  for (let s = 0; s + 4 < all.length; s++) {
    const [X, A, B, C, D] = all.slice(s, s + 5);
    const XA = legLen(X, A), AB = legLen(A, B), BC = legLen(B, C), CD = legLen(C, D);
    if (!XA || !AB || !BC) continue;
    const bull = !X.hi; // X low → A high → … → D low: a bullish (buy-side) pattern
    const ab = AB / XA, bc = BC / AB, cd = CD / BC, xd = Math.abs(A.p - D.p) / XA;
    let name: string | null = null;
    for (const h of HARMONICS) {
      if (bc > 1.0 * (1 + tol)) break; // C past A: not these shapes
      if (inR(ab, h.ab, tol) && inR(bc, h.bc, tol) && inR(cd, h.cd, tol) && inR(xd, h.xd, tol)) { name = h.name; break; }
    }
    if (!name) {
      // Cypher: C extends beyond A (1.13–1.414 of XA), D retraces 0.786 of XC.
      const xc = Math.abs(C.p - X.p) / XA;
      const xcD = Math.abs(C.p - D.p) / Math.abs(C.p - X.p);
      const beyondA = bull ? C.p > A.p : C.p < A.p;
      if (beyondA && inR(ab, [0.382, 0.618], tol) && inR(xc, [1.13, 1.414], tol) && inR(xcD, [0.786, 0.786], tol)) name = "Cypher";
    }
    if (name) hits.push({ name, bull, pts: [X, A, B, C, D], forming: D === tail });
  }

  // AB = CD on the last four swings, if no XABCD shape fits there.
  for (let s = Math.max(0, all.length - 6); s + 3 < all.length; s++) {
    const [A, B, C, D] = all.slice(s, s + 4);
    const AB = legLen(A, B), BC = legLen(B, C), CD = legLen(C, D);
    if (!AB || !BC) continue;
    const bc = BC / AB;
    if (inR(bc, [0.382, 0.886], tol) && Math.abs(CD / AB - 1) <= tol * 2) {
      if (!hits.some((h) => h.pts[4] === D)) hits.push({ name: "AB=CD", bull: A.hi, pts: [A, B, C, D], forming: D === tail });
    }
  }

  const paths: StudyPath[] = [];
  const zones: StudyZone[] = [];
  const shown = hits.slice(-show);
  for (const h of shown) {
    const color = h.bull ? up : down;
    const tag = `${h.bull ? "Bullish" : "Bearish"} ${h.name}${h.forming ? " (forming)" : ""}`;
    if (h.pts.length === 5) {
      const [X, A, B, C, D] = h.pts;
      paths.push({ pts: [{ i: X.i, p: X.p, label: "X" }, { i: A.i, p: A.p, label: "A" }, { i: B.i, p: B.p, label: "B" }], color, fill: true, width: 1.5 });
      paths.push({ pts: [{ i: B.i, p: B.p }, { i: C.i, p: C.p, label: "C" }, { i: D.i, p: D.p, label: "D" }], color, fill: true, width: 1.5, label: tag });
      paths.push({ pts: [{ i: X.i, p: X.p }, { i: B.i, p: B.p }], color, dashed: true, width: 1, label: (Math.abs(A.p - B.p) / Math.abs(A.p - X.p)).toFixed(3), labelAt: 0.5 });
      paths.push({ pts: [{ i: B.i, p: B.p }, { i: D.i, p: D.p }], color, dashed: true, width: 1, label: (Math.abs(C.p - D.p) / Math.abs(C.p - B.p)).toFixed(3), labelAt: 0.5 });
      paths.push({ pts: [{ i: X.i, p: X.p }, { i: D.i, p: D.p }], color, dashed: true, width: 1, label: (Math.abs(A.p - D.p) / Math.abs(A.p - X.p)).toFixed(3), labelAt: 0.5 });
    } else {
      const [A, B, C, D] = h.pts;
      paths.push({ pts: [{ i: A.i, p: A.p, label: "A" }, { i: B.i, p: B.p, label: "B" }, { i: C.i, p: C.p, label: "C" }, { i: D.i, p: D.p, label: "D" }], color, width: 1.5, label: tag });
    }
  }

  // Potential reversal zone for a pattern still waiting on D: the last four
  // confirmed swings as X, A, B, C, and where each pattern's D would land.
  if (piv.length >= 4) {
    const [X, A, B, C] = piv.slice(-4);
    const XA = legLen(X, A), AB = legLen(A, B), BC = legLen(B, C);
    if (XA && AB && BC) {
      const bull = !X.hi;
      const dir = bull ? -1 : 1; // D lies below C for a bullish pattern
      const ab = AB / XA, bc = BC / AB;
      for (const h of HARMONICS) {
        if (!inR(ab, h.ab, tol) || !inR(bc, h.bc, tol)) continue;
        // D must satisfy both the XA and BC projections — their overlap.
        const xd1 = A.p + dir * h.xd[0] * XA, xd2 = A.p + dir * h.xd[1] * XA;
        const cd1 = C.p + dir * h.cd[0] * BC, cd2 = C.p + dir * h.cd[1] * BC;
        const loX = Math.min(xd1, xd2) - XA * tol * 0.5, hiX = Math.max(xd1, xd2) + XA * tol * 0.5;
        const lo = Math.max(loX, Math.min(cd1, cd2)), hi = Math.min(hiX, Math.max(cd1, cd2));
        if (!(hi >= lo)) continue;
        const done = tail && tail.i > C.i && (bull ? tail.p <= hi : tail.p >= lo);
        zones.push({ from: C.i, to: null, top: r2(hi + (hi === lo ? XA * 0.01 : 0)), bottom: r2(lo), color: bull ? up : down, dashed: true, label: `${bull ? "Bullish" : "Bearish"} ${h.name} D zone ${fmt(lo)}–${fmt(hi)}${done ? " · reached" : ""}` });
        paths.push({ pts: [{ i: X.i, p: X.p, label: "X" }, { i: A.i, p: A.p, label: "A" }, { i: B.i, p: B.p, label: "B" }, { i: C.i, p: C.p, label: "C" }], color: bull ? up : down, dashed: true, width: 1 });
        break;
      }
    }
  }
  return { paths, zones, hits };
}

/* ── Elliott waves ──────────────────────────────────────────────────────── */

/**
 * The most recent five-wave impulse whose swings obey the three hard rules:
 * wave 2 never retraces past the start of wave 1, wave 3 is never the shortest
 * of 1/3/5, and wave 4 never enters wave 1's territory. Swings after wave 5
 * are labelled a-b-c. If the latest four swings form waves 1–4, the wave 5
 * target zone (wave 1 equality to 0.618 × waves 0→3) is shown instead.
 */
export function elliott(bars: Bar[], k = 2, up = "#16A34A", down = "#DC2626", neutral = "#94A3B8") {
  const { piv, tail } = swings(bars, k);
  const all = tail ? [...piv, tail] : piv;
  const paths: StudyPath[] = [];
  const zones: StudyZone[] = [];

  const valid = (w: Pivot[], upTrend: boolean, upTo = 5) => {
    const s = upTrend ? 1 : -1;
    const v = w.map((x) => s * x.p);
    const w1 = v[1] - v[0], w3 = upTo >= 3 ? v[3] - v[2] : 0;
    if (!(w1 > 0)) return false;
    if (!(v[2] > v[0])) return false; // rule 1
    if (upTo >= 3 && !(v[3] > v[1])) return false;
    if (upTo >= 4 && !(v[4] > v[1])) return false; // rule 3: no overlap with wave 1
    if (upTo >= 5) {
      const w5 = v[5] - v[4];
      if (!(w5 > 0)) return false;
      if (w3 < w1 && w3 < w5) return false; // rule 2
    }
    return true;
  };

  let found: { start: number; upTrend: boolean } | null = null;
  for (let s = all.length - 6; s >= 0; s--) {
    const w = all.slice(s, s + 6);
    const upTrend = !w[0].hi;
    if (valid(w, upTrend)) { found = { start: s, upTrend }; break; }
  }

  if (found) {
    const w = all.slice(found.start, found.start + 6);
    const color = found.upTrend ? up : down;
    paths.push({ pts: w.map((x, j) => ({ i: x.i, p: x.p, label: j === 0 ? "0" : `(${j})` })), color, width: 2, label: `Impulse ${found.upTrend ? "up" : "down"}${w[5] === tail ? " · wave 5 forming" : ""}` });
    const after = all.slice(found.start + 5, found.start + 9);
    if (after.length >= 2) {
      const lab = ["", "(a)", "(b)", "(c)"];
      paths.push({ pts: after.map((x, j) => ({ i: x.i, p: x.p, label: lab[j] || undefined })), color: neutral, width: 1.5, dashed: true, label: "Correction" });
    }
  }

  // Waves 1–4 in place and no completed impulse after them → project wave 5.
  const last5 = all.slice(-5);
  if (last5.length === 5 && (!found || found.start + 5 < all.length - 5)) {
    const upTrend = !last5[0].hi;
    if (valid(last5, upTrend, 4) && (last5[4] !== tail || piv.length >= 5)) {
      const s = upTrend ? 1 : -1;
      const [p0, p1, , p3, p4] = last5;
      const w1 = Math.abs(p1.p - p0.p);
      const t1 = p4.p + s * w1;
      const t2 = p4.p + s * 0.618 * Math.abs(p3.p - p0.p);
      const color = upTrend ? up : down;
      paths.push({ pts: last5.map((x, j) => ({ i: x.i, p: x.p, label: j === 0 ? "0" : `(${j})` })), color, width: 1.5, dashed: true, label: "Waves 1–4 (possible)" });
      zones.push({ from: p4.i, to: null, top: r2(Math.max(t1, t2)), bottom: r2(Math.min(t1, t2)), color, dashed: true, label: `Wave 5 target ${fmt(Math.min(t1, t2))}–${fmt(Math.max(t1, t2))}` });
    }
  }
  return { paths, zones };
}

/* ── chart patterns ─────────────────────────────────────────────────────── */

function fit(pts: Pivot[]) {
  const n = pts.length;
  const mx = pts.reduce((s, q) => s + q.i, 0) / n;
  const my = pts.reduce((s, q) => s + q.p, 0) / n;
  let sxy = 0, sxx = 0;
  for (const q of pts) { sxy += (q.i - mx) * (q.p - my); sxx += (q.i - mx) ** 2; }
  const m = sxx ? sxy / sxx : 0;
  const b = my - m * mx;
  const err = Math.max(...pts.map((q) => Math.abs(q.p - (m * q.i + b))));
  return { m, b, at: (i: number) => m * i + b, err };
}

/**
 * Double tops/bottoms, head & shoulders (and inverse), and the latest
 * converging / parallel structure (triangles, wedges, channels, ranges).
 * `look` limits patterns to the last N bars. Tolerances scale with ATR.
 */
export function chartPatterns(bars: Bar[], k = 1.5, look = 200, up = "#16A34A", down = "#DC2626", neutral = "#94A3B8", show = 2) {
  const n = bars.length;
  const { piv, tail, atr: at } = swings(bars, k);
  const paths: StudyPath[] = [];
  const zones: StudyZone[] = [];
  if (n < 20 || piv.length < 3) return { paths, zones, found: [] as string[] };
  const found: string[] = [];
  const from = n - look;
  const A = (i: number) => at[Math.min(n - 1, Math.max(0, i))];
  const lastClose = bars[n - 1].close;
  const firstClose = (i: number, test: (j: number) => boolean) => {
    for (let j = i + 1; j < n; j++) if (test(j)) return j;
    return -1;
  };
  // A pattern still waiting for its break is only worth showing while it is
  // one of the latest swings; an old one that never broke is history.
  const liveFrom = piv.length >= 3 ? piv[piv.length - 3].i : 0;

  interface Cand { start: number; end: number; name: string; paths: StudyPath[]; zones: StudyZone[] }
  const cands: Cand[] = [];

  // Double top / bottom: two equal swings with a real trough / peak between.
  for (let s = 0; s + 2 < piv.length; s++) {
    const [p1, mid, p2] = piv.slice(s, s + 3);
    if (p2.i < from) continue;
    const a = A(p2.i);
    if (Math.abs(p1.p - p2.p) > 0.6 * a) continue;
    const top = p1.hi;
    const sg = top ? 1 : -1;
    const peak = top ? Math.max(p1.p, p2.p) : Math.min(p1.p, p2.p);
    const h = Math.abs(peak - mid.p);
    if (h < 2 * a) continue;
    const brk = firstClose(p2.i, (j) => sg * (mid.p - bars[j].close) > 0);
    // Invalid if price closed beyond the peaks before breaking the neckline.
    const fail = firstClose(p2.i, (j) => sg * (bars[j].close - peak) > 0);
    if (fail >= 0 && (brk < 0 || fail < brk)) continue;
    if (brk < 0 && p2.i < liveFrom) continue;
    const color = top ? down : up;
    const name = top ? "Double top" : "Double bottom";
    const target = mid.p - sg * h;
    const c: Cand = { start: p1.i, end: brk >= 0 ? brk : p2.i, name, paths: [], zones: [] };
    c.paths.push({ pts: [{ i: p1.i, p: p1.p, label: top ? "T1" : "B1" }, { i: mid.i, p: mid.p }, { i: p2.i, p: p2.p, label: top ? "T2" : "B2" }], color, width: 1.5, label: `${name}${brk >= 0 ? " · confirmed" : " · watching neckline"}`, labelAt: 1 });
    c.zones.push({ from: p1.i, to: brk >= 0 ? brk : null, top: mid.p, bottom: mid.p, color: neutral, dashed: true, label: "Neckline" });
    if (brk >= 0) c.zones.push({ from: brk, to: Math.min(n - 1, brk + (p2.i - p1.i)), top: target, bottom: target, color, dashed: true, label: `Measured move ${fmt(target)}` });
    cands.push(c);
  }

  // Head & shoulders: three peaks, the middle highest, shoulders level.
  for (let s = 0; s + 4 < piv.length; s++) {
    const [l, t1, h, t2, r] = piv.slice(s, s + 5);
    if (r.i < from) continue;
    const top = h.hi;
    const sg = top ? 1 : -1;
    const a = A(r.i);
    if (!(sg * (h.p - l.p) > 0.5 * a && sg * (h.p - r.p) > 0.5 * a)) continue;
    if (Math.abs(l.p - r.p) > 1.25 * a) continue;
    const neck = fit([t1, t2]);
    const depth = Math.abs(h.p - neck.at(h.i));
    if (depth < 2 * a) continue;
    const brk = firstClose(r.i, (j) => sg * (neck.at(j) - bars[j].close) > 0);
    const fail = firstClose(r.i, (j) => sg * (bars[j].close - h.p) > 0);
    if (fail >= 0 && (brk < 0 || fail < brk)) continue;
    if (brk < 0 && r.i < liveFrom) continue;
    const color = top ? down : up;
    const name = top ? "Head & shoulders" : "Inverse head & shoulders";
    const c: Cand = { start: l.i, end: brk >= 0 ? brk : r.i, name, paths: [], zones: [] };
    c.paths.push({ pts: [{ i: l.i, p: l.p, label: "LS" }, { i: t1.i, p: t1.p }, { i: h.i, p: h.p, label: "H" }, { i: t2.i, p: t2.p }, { i: r.i, p: r.p, label: "RS" }], color, width: 1.5, label: `${name}${brk >= 0 ? " · confirmed" : " · watching neckline"}`, labelAt: 2 });
    const e = brk >= 0 ? brk : n - 1;
    c.paths.push({ pts: [{ i: t1.i, p: neck.at(t1.i) }, { i: e, p: neck.at(e) }], color: neutral, dashed: true, width: 1, label: "Neckline", labelAt: 0 });
    if (brk >= 0) {
      const target = neck.at(brk) - sg * depth;
      c.zones.push({ from: brk, to: Math.min(n - 1, brk + (r.i - l.i)), top: target, bottom: target, color, dashed: true, label: `Measured move ${fmt(target)}` });
    }
    cands.push(c);
  }

  // The latest few, preferring head & shoulders over a double top on the same swings.
  cands.sort((x, y) => y.end - x.end || (y.name.includes("shoulders") ? 1 : 0) - (x.name.includes("shoulders") ? 1 : 0));
  const kept: Cand[] = [];
  for (const c of cands) {
    if (kept.length >= show) break;
    if (kept.some((q) => c.start < q.end && q.start < c.end)) continue; // overlapping
    kept.push(c);
  }
  for (const c of kept) {
    paths.push(...c.paths);
    zones.push(...c.zones);
    found.push(c.name);
  }

  // Latest structure: fit lines through the recent swing highs and lows.
  const conf = tail ? [...piv, tail] : piv;
  for (const m of [6, 5, 4]) {
    if (conf.length < m) continue;
    const w = conf.slice(-m);
    if (w[0].i < from) continue;
    const hs = w.filter((q) => q.hi), ls = w.filter((q) => !q.hi);
    if (hs.length < 2 || ls.length < 2) continue;
    const U = fit(hs), Lo = fit(ls);
    const a = A(w[w.length - 1].i);
    if (U.err > 0.6 * a || Lo.err > 0.6 * a) continue;
    const i0 = w[0].i, i1 = n - 1;
    const span = i1 - i0;
    const du = U.m * span, dl = Lo.m * span; // change of each line across the pattern
    const flat = (d: number) => Math.abs(d) <= 1.0 * a;
    const w0 = U.at(i0) - Lo.at(i0), w1 = U.at(i1) - Lo.at(i1);
    if (!(w0 > 0)) continue;
    const conv = w1 < w0 * 0.75, par = Math.abs(w1 - w0) <= w0 * 0.25;
    let name = "";
    if (flat(du) && dl > a && conv) name = "Ascending triangle";
    else if (flat(dl) && du < -a && conv) name = "Descending triangle";
    else if (du < -a && dl > a) name = "Symmetrical triangle";
    else if (du > 0 && dl > 0 && conv && !flat(dl)) name = "Rising wedge";
    else if (du < 0 && dl < 0 && conv && !flat(du)) name = "Falling wedge";
    else if (flat(du) && flat(dl) && par) name = "Range (rectangle)";
    else if (du > a && dl > a && par) name = "Rising channel";
    else if (du < -a && dl < -a && par) name = "Falling channel";
    else if (w1 > w0 * 1.25) name = "Broadening formation";
    if (!name) continue;
    const brokeUp = lastClose > U.at(i1);
    const brokeDn = lastClose < Lo.at(i1);
    const color = brokeUp ? up : brokeDn ? down : neutral;
    const st = brokeUp ? " · broke up" : brokeDn ? " · broke down" : "";
    paths.push({ pts: [{ i: i0, p: U.at(i0) }, { i: i1, p: U.at(i1) }], color, width: 1.5, label: `${name}${st}`, labelAt: 1 });
    paths.push({ pts: [{ i: i0, p: Lo.at(i0) }, { i: i1, p: Lo.at(i1) }], color, width: 1.5 });
    found.push(name);
    break;
  }
  return { paths, zones, found };
}

/* ── market profile & session volume profile ────────────────────────────── */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function niceStep(v: number) {
  if (!(v > 0)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
}

function sessions(bars: Bar[]) {
  const out: { from: number; to: number }[] = [];
  let cur = -1;
  bars.forEach((b, i) => {
    const d = Math.floor(b.time / 86400);
    if (d !== cur) { out.push({ from: i, to: i }); cur = d; }
    else out[out.length - 1].to = i;
  });
  return out;
}

function valueArea(counts: number[], poc: number, share = 0.7) {
  const total = counts.reduce((s, x) => s + x, 0);
  let inVa = counts[poc], a = poc, z = poc;
  while (inVa < total * share && (a > 0 || z < counts.length - 1)) {
    const below = a > 0 ? counts[a - 1] : -1;
    const above = z < counts.length - 1 ? counts[z + 1] : -1;
    if (above >= below) { z++; inVa += above; } else { a--; inVa += below; }
  }
  return { a, z };
}

/**
 * Market profile (TPO): each 30-minute period of a session gets a letter
 * (A = 11:00, B = 11:30 …) and every price row it traded through gets that
 * letter. Shows the point of control, the 70% value area and the initial
 * balance (first hour). Hourly bars use one letter per hour.
 */
export function tpoProfiles(bars: Bar[], rowsWanted = 24, sessionsShown = 5, color = "#6366F1"): StudyProfile[] {
  const ss = sessions(bars).slice(-sessionsShown);
  if (!ss.length) return [];
  const ranges = ss.map((s) => {
    let hi = -Infinity, lo = Infinity;
    for (let i = s.from; i <= s.to; i++) { hi = Math.max(hi, bars[i].high); lo = Math.min(lo, bars[i].low); }
    return hi - lo;
  }).filter((r) => r > 0).sort((x, y) => x - y);
  const step = niceStep((ranges[Math.floor(ranges.length / 2)] || 0) / rowsWanted);
  if (!step) return [];
  const out: StudyProfile[] = [];
  for (const s of ss) {
    const t0 = bars[s.from].time;
    const period = bars.length > 1 && bars[s.from + 1] && bars[s.from + 1].time - t0 >= 3600 ? 3600 : 1800;
    let lo = Infinity, hi = -Infinity;
    for (let i = s.from; i <= s.to; i++) { hi = Math.max(hi, bars[i].high); lo = Math.min(lo, bars[i].low); }
    if (!(hi >= lo)) continue;
    const base = Math.floor(lo / step + 1e-9);
    const top = Math.floor(hi / step + 1e-9);
    const nRows = top - base + 1;
    if (nRows > 200) continue;
    const letters: string[] = new Array(nRows).fill("");
    const marked: Set<number>[] = Array.from({ length: nRows }, () => new Set<number>());
    let ibLo = Infinity, ibHi = -Infinity;
    for (let i = s.from; i <= s.to; i++) {
      const b = bars[i];
      const per = Math.min(LETTERS.length - 1, Math.floor((b.time - t0) / period));
      if (b.time - t0 < 3600) { ibLo = Math.min(ibLo, b.low); ibHi = Math.max(ibHi, b.high); }
      const a = Math.floor(b.low / step + 1e-9) - base, z = Math.floor(b.high / step + 1e-9) - base;
      for (let r = Math.max(0, a); r <= Math.min(nRows - 1, z); r++) {
        if (!marked[r].has(per)) { marked[r].add(per); letters[r] += LETTERS[per]; }
      }
    }
    const counts = marked.map((m) => m.size);
    let poc = 0;
    const mid = (nRows - 1) / 2;
    counts.forEach((c, r) => { if (c > counts[poc] || (c === counts[poc] && Math.abs(r - mid) < Math.abs(poc - mid))) poc = r; });
    const { a, z } = valueArea(counts, poc);
    out.push({
      from: s.from,
      to: s.to,
      kind: "tpo",
      color,
      rows: counts.map((v, r) => ({ lo: (base + r) * step, hi: (base + r + 1) * step, v, letters: letters[r] })),
      poc,
      vaLow: (base + a) * step,
      vaHigh: (base + z + 1) * step,
      ib: ibHi >= ibLo ? { lo: ibLo, hi: ibHi } : undefined,
    });
  }
  return out;
}

/** A volume profile for each of the last N sessions, drawn inside that session. */
export function sessionVolumeProfiles(bars: Bar[], rows = 20, sessionsShown = 5, color = "#0EA5E9"): StudyProfile[] {
  const out: StudyProfile[] = [];
  for (const s of sessions(bars).slice(-sessionsShown)) {
    const vp = volumeProfile(bars.slice(s.from, s.to + 1), rows);
    if (!vp || !vp.max) continue;
    out.push({
      from: s.from,
      to: s.to,
      kind: "vol",
      color,
      rows: vp.buckets.map((b) => ({ lo: b.lo, hi: b.hi, v: b.up + b.down, up: b.up })),
      poc: vp.poc,
      vaLow: vp.vaLow,
      vaHigh: vp.vaHigh,
    });
  }
  return out;
}
