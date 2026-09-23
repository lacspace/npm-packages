/**
 * The maths behind every chart in this package — scales, ticks, stacking, path
 * strings, arc geometry, formatting and hit-testing.
 *
 * All of it is pure: no React, no DOM, no module-level state. That is the point.
 * A chart whose behaviour is only reachable by rendering it is a chart nobody
 * can test, so the components in this package are thin wrappers that turn these
 * numbers into elements. Import them directly if you want to draw your own SVG.
 */

/** A point in SVG user space. */
export interface Point {
  x: number;
  y: number;
}

/* ==========================================================================
   Numbers
   ========================================================================== */

/** Smallest and largest finite value in a list. Empty or all-NaN gives `[0, 1]`. */
export function extent(values: readonly number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity || max === -Infinity) return [0, 1];
  return [min, max];
}

/**
 * Widen a domain whose ends are equal (one data point, or a flat line) so it
 * still has something to spread across. A flat series at 0 gets `[-1, 1]`;
 * anything else gets ±50%, which draws the line through the middle rather than
 * along the floor.
 */
export function padDegenerate(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min < max) return [min, max];
  const pad = min === 0 ? 1 : Math.abs(min) * 0.5;
  return [min - pad, min + pad];
}

/**
 * Round a span to a "nice" number — 1, 2, 5 or 10 times a power of ten. This is
 * what turns an axis reading `0, 137, 274` into one reading `0, 150, 300`.
 */
export function niceNum(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range === 0) return 0;
  const sign = range < 0 ? -1 : 1;
  const abs = Math.abs(range);
  const exponent = Math.floor(Math.log10(abs));
  const fraction = abs / 10 ** exponent;
  let nice: number;
  if (round) {
    nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return sign * nice * 10 ** exponent;
}

/** Strip binary float noise such as `0.30000000000000004` for a given step. */
export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step === 0) return value;
  const decimals = Math.max(0, Math.min(12, -Math.floor(Math.log10(Math.abs(step)))));
  return Number(value.toFixed(decimals));
}

/**
 * Axis ticks at readable intervals, covering the whole domain.
 *
 * Handles the three cases every hand-rolled tick generator gets wrong: equal
 * min and max, ranges that cross zero, and a single data point.
 *
 * @param count Roughly how many ticks you want. You may get one or two more.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const [lo, hi] = padDegenerate(Math.min(min, max), Math.max(min, max));
  const steps = Math.max(1, Math.floor(count) - 1);
  const span = niceNum(hi - lo, false);
  const step = niceNum(span / steps, true) || 1;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  // Walk by index rather than accumulating, so float error cannot compound.
  const total = Math.round((end - start) / step);
  for (let i = 0; i <= total; i++) ticks.push(roundToStep(start + i * step, step));
  return ticks;
}

/** The domain the ticks from {@link niceTicks} actually span. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const ticks = niceTicks(min, max, count);
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  if (first === undefined || last === undefined) return padDegenerate(min, max);
  return [first, last];
}

/* ==========================================================================
   Scales
   ========================================================================== */

/** A continuous domain mapped onto a pixel range, and back again. */
export interface LinearScale {
  domain: [number, number];
  range: [number, number];
  /** Domain value → pixel. */
  scale: (value: number) => number;
  /** Pixel → domain value. The inverse of `scale`. */
  invert: (pixel: number) => number;
}

/**
 * A linear scale. Pass a descending range (`[height, 0]`) for a y axis — SVG's
 * origin is top-left, and inverting the range here is cheaper than remembering
 * to subtract everywhere else.
 */
export function linearScale(
  domain: [number, number],
  range: [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return {
    domain,
    range,
    scale: (value: number) => {
      if (!Number.isFinite(value)) return r0;
      if (span === 0) return (r0 + r1) / 2;
      return r0 + ((value - d0) / span) * (r1 - r0);
    },
    invert: (pixel: number) => {
      if (r1 === r0) return d0;
      return d0 + ((pixel - r0) / (r1 - r0)) * span;
    },
  };
}

/** Evenly spaced slots for categorical data — one per bar, one per column. */
export interface BandScale {
  count: number;
  /** Distance from one slot's start to the next. */
  step: number;
  /** Width of the drawn band, once padding is removed. */
  bandwidth: number;
  /** Left (or top) edge of band `i`. */
  at: (index: number) => number;
  /** Centre of band `i` — where a line chart's point or a tick label goes. */
  center: (index: number) => number;
  /** Which band a pixel falls in, clamped to the ends. */
  indexAt: (pixel: number) => number;
}

/**
 * A band scale.
 *
 * @param padding Fraction of each step left as gap, `0`–`1`. `0.2` is a good
 * default for bars; pass `0` for a heatmap, where the cells should touch.
 */
export function bandScale(
  count: number,
  range: [number, number],
  padding = 0.2,
): BandScale {
  const [r0, r1] = range;
  const n = Math.max(0, Math.floor(count));
  const pad = clampUnit(padding);
  const step = n === 0 ? 0 : (r1 - r0) / n;
  const bandwidth = Math.abs(step) * (1 - pad);
  const offset = (Math.abs(step) - bandwidth) / 2;
  return {
    count: n,
    step,
    bandwidth,
    at: (index: number) => r0 + step * index + offset,
    center: (index: number) => r0 + step * index + offset + bandwidth / 2,
    indexAt: (pixel: number) => {
      if (n === 0 || step === 0) return 0;
      const raw = Math.floor((pixel - r0) / step);
      return raw < 0 ? 0 : raw > n - 1 ? n - 1 : raw;
    },
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 0.95 ? 0.95 : value;
}

/* ==========================================================================
   Layout
   ========================================================================== */

/** Space reserved around the plot for axis labels. */
export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Default margins. They are generous on the left and bottom because that is
 * where the tick labels live — an axis label that clips is the single most
 * common bug in hand-rolled SVG charts.
 */
export const DEFAULT_MARGIN: Margin = { top: 12, right: 16, bottom: 26, left: 44 };

/** The drawable rectangle inside the viewBox. */
export interface Plot extends Margin {
  /** Inner width, never negative. */
  width: number;
  /** Inner height, never negative. */
  height: number;
  /** x of the inner left edge. */
  x0: number;
  /** x of the inner right edge. */
  x1: number;
  /** y of the inner top edge. */
  y0: number;
  /** y of the inner bottom edge. */
  y1: number;
}

/** Work out the plot rectangle for a viewBox of `width` × `height`. */
export function plotArea(
  width: number,
  height: number,
  margin?: Partial<Margin>,
): Plot {
  const m: Margin = { ...DEFAULT_MARGIN, ...margin };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = Math.max(0, height - m.top - m.bottom);
  return {
    ...m,
    width: innerW,
    height: innerH,
    x0: m.left,
    x1: m.left + innerW,
    y0: m.top,
    y1: m.top + innerH,
  };
}

/* ==========================================================================
   Series maths
   ========================================================================== */

/** One series' slice of a stack: `[from, to]` in domain units, per index. */
export type StackBand = [number, number];

/**
 * Stack series into cumulative bands.
 *
 * Positive and negative values stack away from zero independently, so a series
 * with losses draws below the axis instead of cancelling the gains above it.
 * Non-finite values are treated as 0 — a gap in the data should not shift
 * everything above it.
 */
export function stackSeries(series: readonly (readonly number[])[]): StackBand[][] {
  const length = series.reduce((max, s) => Math.max(max, s.length), 0);
  const up = new Array<number>(length).fill(0);
  const down = new Array<number>(length).fill(0);
  return series.map((values) => {
    const bands: StackBand[] = [];
    for (let i = 0; i < length; i++) {
      const raw = values[i];
      const v = Number.isFinite(raw) ? (raw as number) : 0;
      if (v < 0) {
        const from = down[i] ?? 0;
        down[i] = from + v;
        bands.push([from, from + v]);
      } else {
        const from = up[i] ?? 0;
        up[i] = from + v;
        bands.push([from, from + v]);
      }
    }
    return bands;
  });
}

/** The total extent a stacked chart needs, including the zero baseline. */
export function stackExtent(series: readonly (readonly number[])[]): [number, number] {
  const stacks = stackSeries(series);
  const values: number[] = [0];
  for (const bands of stacks) for (const [, to] of bands) values.push(to);
  return extent(values);
}

/** Sum of the finite values in a list. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) if (Number.isFinite(v)) total += v;
  return total;
}

/* ==========================================================================
   Paths
   ========================================================================== */

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1000) / 1000);
}

/** A straight polyline through the points. Empty input gives an empty string. */
export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  let d = "";
  points.forEach((p, i) => {
    d += `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`;
    if (i < points.length - 1) d += " ";
  });
  return d;
}

/**
 * A smoothed curve through the points, as cubic béziers.
 *
 * This is a Catmull-Rom spline converted to béziers, so the curve passes
 * *through* every point — unlike a plain quadratic smoothing, which drifts off
 * the data and quietly lies about your numbers.
 *
 * @param tension `0` is a polyline, `1` is very loopy. `0.5` is the default.
 */
export function smoothPath(points: readonly Point[], tension = 0.5): string {
  if (points.length < 3) return linePath(points);
  const t = clampUnit(tension) / 6;
  const first = points[0] as Point;
  let d = `M${fmt(first.x)} ${fmt(first.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? (points[i] as Point);
    const p1 = points[i] as Point;
    const p2 = points[i + 1] as Point;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

/** Close a line path down to a baseline to make a fillable area. */
export function areaPath(
  points: readonly Point[],
  baselineY: number,
  smooth = false,
): string {
  if (points.length === 0) return "";
  const top = smooth ? smoothPath(points) : linePath(points);
  const last = points[points.length - 1] as Point;
  const first = points[0] as Point;
  return `${top} L${fmt(last.x)} ${fmt(baselineY)} L${fmt(first.x)} ${fmt(baselineY)} Z`;
}

/** A closed polygon — radar series, funnel stages. */
export function polygonPath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return `${linePath(points)} Z`;
}

/** A rectangle with rounded caps on one end only — the bar chart's shape. */
export function roundedBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  side: "top" | "bottom" | "left" | "right" = "top",
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, side === "top" || side === "bottom" ? w / 2 : h / 2, side === "top" || side === "bottom" ? h : w));
  if (r === 0) return `M${fmt(x)} ${fmt(y)} h${fmt(w)} v${fmt(h)} h${fmt(-w)} Z`;
  switch (side) {
    case "top":
      return `M${fmt(x)} ${fmt(y + h)} L${fmt(x)} ${fmt(y + r)} Q${fmt(x)} ${fmt(y)} ${fmt(x + r)} ${fmt(y)} L${fmt(x + w - r)} ${fmt(y)} Q${fmt(x + w)} ${fmt(y)} ${fmt(x + w)} ${fmt(y + r)} L${fmt(x + w)} ${fmt(y + h)} Z`;
    case "bottom":
      return `M${fmt(x)} ${fmt(y)} L${fmt(x + w)} ${fmt(y)} L${fmt(x + w)} ${fmt(y + h - r)} Q${fmt(x + w)} ${fmt(y + h)} ${fmt(x + w - r)} ${fmt(y + h)} L${fmt(x + r)} ${fmt(y + h)} Q${fmt(x)} ${fmt(y + h)} ${fmt(x)} ${fmt(y + h - r)} Z`;
    case "right":
      return `M${fmt(x)} ${fmt(y)} L${fmt(x + w - r)} ${fmt(y)} Q${fmt(x + w)} ${fmt(y)} ${fmt(x + w)} ${fmt(y + r)} L${fmt(x + w)} ${fmt(y + h - r)} Q${fmt(x + w)} ${fmt(y + h)} ${fmt(x + w - r)} ${fmt(y + h)} L${fmt(x)} ${fmt(y + h)} Z`;
    default:
      return `M${fmt(x + w)} ${fmt(y)} L${fmt(x + r)} ${fmt(y)} Q${fmt(x)} ${fmt(y)} ${fmt(x)} ${fmt(y + r)} L${fmt(x)} ${fmt(y + h - r)} Q${fmt(x)} ${fmt(y + h)} ${fmt(x + r)} ${fmt(y + h)} L${fmt(x + w)} ${fmt(y + h)} Z`;
  }
}

/* ==========================================================================
   Arcs — donut, pie, gauge
   ========================================================================== */

/** A point on a circle. Angles are degrees, 0° at 12 o'clock, clockwise. */
export function polarPoint(cx: number, cy: number, radius: number, angle: number): Point {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/**
 * An arc, or a ring segment when `innerRadius > 0`.
 *
 * The three edge cases this gets right, and most implementations do not:
 * a zero-length sweep draws nothing (rather than a hairline artefact), a full
 * 360° sweep is split into two arcs (a single arc from a point back to itself
 * is a no-op in SVG, which is why "100%" donuts so often render empty), and a
 * negative sweep draws anticlockwise.
 */
export function arcPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const rOuter = Math.max(0, outerRadius);
  const rInner = Math.max(0, Math.min(innerRadius, rOuter));
  let sweep = endAngle - startAngle;
  if (!Number.isFinite(sweep) || Math.abs(sweep) < 1e-6) return "";
  if (Math.abs(sweep) >= 360) {
    // A closed ring: two half-circles, plus a hole punched the other way round
    // so `fill-rule: evenodd` is not required for the donut to have a centre.
    const dir = sweep < 0 ? -1 : 1;
    sweep = 360 * dir;
    const o0 = polarPoint(cx, cy, rOuter, startAngle);
    const oMid = polarPoint(cx, cy, rOuter, startAngle + 180 * dir);
    const outer = `M${fmt(o0.x)} ${fmt(o0.y)} A${fmt(rOuter)} ${fmt(rOuter)} 0 0 ${dir > 0 ? 1 : 0} ${fmt(oMid.x)} ${fmt(oMid.y)} A${fmt(rOuter)} ${fmt(rOuter)} 0 0 ${dir > 0 ? 1 : 0} ${fmt(o0.x)} ${fmt(o0.y)} Z`;
    if (rInner <= 0) return outer;
    const i0 = polarPoint(cx, cy, rInner, startAngle);
    const iMid = polarPoint(cx, cy, rInner, startAngle + 180 * dir);
    const inner = `M${fmt(i0.x)} ${fmt(i0.y)} A${fmt(rInner)} ${fmt(rInner)} 0 0 ${dir > 0 ? 0 : 1} ${fmt(iMid.x)} ${fmt(iMid.y)} A${fmt(rInner)} ${fmt(rInner)} 0 0 ${dir > 0 ? 0 : 1} ${fmt(i0.x)} ${fmt(i0.y)} Z`;
    return `${outer} ${inner}`;
  }

  const large = Math.abs(sweep) > 180 ? 1 : 0;
  const clockwise = sweep > 0 ? 1 : 0;
  const start = polarPoint(cx, cy, rOuter, startAngle);
  const end = polarPoint(cx, cy, rOuter, endAngle);

  if (rInner <= 0) {
    return `M${fmt(cx)} ${fmt(cy)} L${fmt(start.x)} ${fmt(start.y)} A${fmt(rOuter)} ${fmt(rOuter)} 0 ${large} ${clockwise} ${fmt(end.x)} ${fmt(end.y)} Z`;
  }
  const innerEnd = polarPoint(cx, cy, rInner, endAngle);
  const innerStart = polarPoint(cx, cy, rInner, startAngle);
  return `M${fmt(start.x)} ${fmt(start.y)} A${fmt(rOuter)} ${fmt(rOuter)} 0 ${large} ${clockwise} ${fmt(end.x)} ${fmt(end.y)} L${fmt(innerEnd.x)} ${fmt(innerEnd.y)} A${fmt(rInner)} ${fmt(rInner)} 0 ${large} ${clockwise ? 0 : 1} ${fmt(innerStart.x)} ${fmt(innerStart.y)} Z`;
}

/** One slice of a pie or donut, in angles and fractions. */
export interface Slice {
  index: number;
  value: number;
  /** Share of the total, `0`–`1`. */
  fraction: number;
  startAngle: number;
  endAngle: number;
  /** Angle to hang a label off. */
  midAngle: number;
}

/**
 * Turn values into slices.
 *
 * Negative and non-finite values are dropped rather than drawn backwards — a
 * pie of "-5" has no honest picture. An all-zero list gives zero-length slices,
 * which {@link arcPath} then renders as nothing at all.
 */
export function pieSlices(
  values: readonly number[],
  startAngle = 0,
  endAngle = 360,
): Slice[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = sum(safe);
  const span = endAngle - startAngle;
  let cursor = startAngle;
  return safe.map((value, index) => {
    const fraction = total === 0 ? 0 : value / total;
    const start = cursor;
    const end = start + fraction * span;
    cursor = end;
    return { index, value, fraction, startAngle: start, endAngle: end, midAngle: (start + end) / 2 };
  });
}

/** Where a gauge's needle points, for a value in `min..max`. */
export function gaugeAngle(
  value: number,
  min: number,
  max: number,
  startAngle = -120,
  endAngle = 120,
): number {
  if (max === min) return startAngle;
  const t = clamp01((value - min) / (max - min));
  return startAngle + t * (endAngle - startAngle);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ==========================================================================
   Colour
   ========================================================================== */

/**
 * The built-in palette: eight hues picked to stay distinguishable next to each
 * other, on white and on near-black, and for the common forms of colour
 * blindness. Pass your own `colors` to any chart to replace it.
 */
export const DEFAULT_PALETTE: readonly string[] = [
  "#4d9fff",
  "#f59e0b",
  "#16a34a",
  "#a855f7",
  "#ef4444",
  "#0891b2",
  "#ec4899",
  "#65a30d",
];

/**
 * Pick colour `index`, cycling when there are more series than colours. Never
 * returns `undefined`, so every drawn shape can be given an explicit fill.
 */
export function colorAt(index: number, palette: readonly string[] = DEFAULT_PALETTE): string {
  const list = palette.length > 0 ? palette : DEFAULT_PALETTE;
  const i = ((Math.floor(index) % list.length) + list.length) % list.length;
  return list[i] as string;
}

/** Parse `#rgb` / `#rrggbb` into channels. Returns `null` for anything else. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const body = m[1] as string;
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Blend two hex colours. `t = 0` is `from`, `t = 1` is `to`. */
export function mixColor(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return t < 0.5 ? from : to;
  const k = clamp01(t);
  const ch = (i: 0 | 1 | 2): string =>
    Math.round((a[i] as number) + ((b[i] as number) - (a[i] as number)) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** Heatmap cell colour: where `value` sits in `min..max`, along a two-stop ramp. */
export function heatColor(
  value: number,
  min: number,
  max: number,
  from = "#e6f0ff",
  to = "#1d4ed8",
): string {
  if (!Number.isFinite(value)) return from;
  if (max === min) return to;
  return mixColor(from, to, (value - min) / (max - min));
}

/* ==========================================================================
   Formatting
   ========================================================================== */

/** `0.4212` → `"42%"`. Give a fraction, not a percentage. */
export function formatPercent(fraction: number, decimals = 0): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(Math.max(0, decimals))}%`;
}

/**
 * Compact axis and tooltip numbers: `1500` → `"1.5K"`, `-2_400_000` → `"-2.4M"`.
 * Small numbers keep their decimals, because an axis of `0, 0, 1` is useless.
 */
export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size;
      return `${trimZeros(scaled.toFixed(decimals))}${suffix}`;
    }
  }
  if (Number.isInteger(value)) return String(value);
  return trimZeros(value.toFixed(Math.max(decimals, 2)));
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * A one-line summary of a chart, used as its `aria-label`. A screen reader
 * should learn what the picture says without having to walk the data table.
 */
export function describeSeries(
  title: string,
  series: ReadonlyArray<{ name?: string; data: readonly number[] }>,
): string {
  if (series.length === 0) return `${title} with no data`;
  const parts = series.map((s, i) => {
    const name = s.name ?? `Series ${i + 1}`;
    const [min, max] = extent(s.data);
    const last = s.data[s.data.length - 1];
    const tail = last === undefined ? "" : `, ending at ${formatNumber(last)}`;
    return `${name}: ${s.data.length} points from ${formatNumber(min)} to ${formatNumber(max)}${tail}`;
  });
  return `${title}. ${parts.join(". ")}.`;
}

/* ==========================================================================
   Hit testing
   ========================================================================== */

/** What the pointer landed on. */
export interface Hit {
  index: number;
  point: Point;
  distance: number;
}

/**
 * The point nearest the pointer.
 *
 * Omit `y` and it matches on `x` alone, which is what a time-series tooltip
 * wants: you are pointing at a moment, not at a pixel, and requiring vertical
 * accuracy makes a flat series impossible to hover.
 */
export function nearestPoint(
  points: readonly Point[],
  x: number,
  y?: number,
  maxDistance = Infinity,
): Hit | null {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    const dx = point.x - x;
    const dy = y === undefined ? 0 : point.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  const point = points[bestIndex];
  if (!point || bestDistance > maxDistance) return null;
  return { index: bestIndex, point, distance: bestDistance };
}

/* ==========================================================================
   Chart-specific maths
   ========================================================================== */

/** One candle. `label` is optional — the index is used when it is missing. */
export interface Candle {
  label?: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * The price range a candlestick chart must cover. Uses `low`/`high` but also
 * folds in `open`/`close`, because real feeds do occasionally ship a close
 * outside the day's range and a chart that trusts them silently clips a wick.
 */
export function ohlcExtent(candles: readonly Candle[]): [number, number] {
  const values: number[] = [];
  for (const c of candles) values.push(c.low, c.high, c.open, c.close);
  if (values.length === 0) return [0, 1];
  return extent(values);
}

/** `up` when the candle closed above its open, `down` below, `flat` when equal. */
export function candleDirection(candle: Candle): "up" | "down" | "flat" {
  if (candle.close > candle.open) return "up";
  if (candle.close < candle.open) return "down";
  return "flat";
}

/** A funnel stage with both conversion rates worked out. */
export interface FunnelStage {
  index: number;
  label: string;
  value: number;
  /** Share of the first stage, `0`–`1`. */
  ofFirst: number;
  /** Share of the previous stage, `0`–`1`. The first stage is always `1`. */
  ofPrevious: number;
  /** How many were lost since the previous stage. */
  dropOff: number;
}

/**
 * Conversion maths for a funnel. Both rates are reported because they answer
 * different questions: `ofFirst` is "how much of the top is left", `ofPrevious`
 * is "where is the leak".
 */
export function funnelStages(
  stages: ReadonlyArray<{ label: string; value: number }>,
): FunnelStage[] {
  const first = stages[0]?.value ?? 0;
  return stages.map((stage, index) => {
    const prev = stages[index - 1]?.value;
    const value = Number.isFinite(stage.value) ? stage.value : 0;
    return {
      index,
      label: stage.label,
      value,
      ofFirst: first === 0 ? 0 : value / first,
      ofPrevious: index === 0 ? 1 : prev === undefined || prev === 0 ? 0 : value / prev,
      dropOff: prev === undefined ? 0 : prev - value,
    };
  });
}

/** One cell of a calendar heatmap. */
export interface CalendarCell {
  date: string;
  value: number;
  /** Column, counting weeks from the first Sunday on or before the start. */
  week: number;
  /** Row, `0` = Sunday. */
  day: number;
}

/**
 * Lay out `{ date, value }` records on a GitHub-style calendar grid.
 *
 * Dates are parsed as UTC so the grid does not shift by a column for users east
 * of Greenwich — a calendar heatmap that moves when you fly is a bug report
 * nobody can reproduce.
 */
export function calendarCells(
  values: ReadonlyArray<{ date: string; value: number }>,
): CalendarCell[] {
  const parsed = values
    .map((v) => ({ ...v, time: Date.parse(`${v.date}T00:00:00Z`) }))
    .filter((v) => Number.isFinite(v.time))
    .sort((a, b) => a.time - b.time);
  const firstEntry = parsed[0];
  if (!firstEntry) return [];
  const firstDay = new Date(firstEntry.time).getUTCDay();
  const origin = firstEntry.time - firstDay * 86_400_000;
  return parsed.map((v) => {
    const offset = Math.floor((v.time - origin) / 86_400_000);
    return {
      date: v.date,
      value: Number.isFinite(v.value) ? v.value : 0,
      week: Math.floor(offset / 7),
      day: offset % 7,
    };
  });
}
