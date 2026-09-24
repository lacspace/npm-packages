import { forwardRef } from "react";
import { cx } from "./util.js";
import {
  areaPath,
  bandScale,
  colorAt,
  extent,
  formatNumber,
  linePath,
  linearScale,
  padDegenerate,
  roundedBarPath,
  smoothPath,
  type Point,
} from "./scale.js";
import { ChartFrame, type ChartBaseProps } from "./primitives.js";

export interface SparklineProps extends Omit<ChartBaseProps, "margin" | "colors"> {
  /** The numbers. Non-finite values are skipped. */
  data: number[];
  /** Line colour. Defaults to the first palette hue. */
  color?: string;
  /** Fill the space under the line. */
  area?: boolean;
  /** Smooth the line. */
  curve?: boolean;
  /** Line thickness in viewBox units. */
  strokeWidth?: number;
  /** Dot on the final value — the "you are here" marker. */
  lastDot?: boolean;
  /** Pin the vertical range, to compare several sparklines against each other. */
  domain?: [number, number];
}

/**
 * A sparkline: a trend, at the size of a word.
 *
 * There are no axes and no labels on purpose — a sparkline lives in a table
 * cell or beside a number, and shape is all it has room to say. Pair it with
 * the actual value in text next to it.
 *
 * ```tsx
 * <Sparkline data={[3, 5, 4, 9, 7, 12]} area lastDot responsive />
 * ```
 */
export const Sparkline = forwardRef<HTMLDivElement, SparklineProps>(function Sparkline(
  {
    data = [],
    width = 120,
    height = 32,
    color,
    area = false,
    curve = false,
    strokeWidth = 1.75,
    lastDot = false,
    domain,
    responsive = false,
    label,
    className,
    ...rest
  },
  ref,
) {
  const stroke = color ?? colorAt(0);
  const pad = strokeWidth + (lastDot ? strokeWidth + 1 : 0);
  const [min, max] = padDegenerate(...(domain ?? extent(data.filter((v) => Number.isFinite(v)))));
  const y = linearScale([min, max], [height - pad, pad]);
  const x = bandScale(Math.max(1, data.length), [0, width], 0);
  const points: Point[] = [];
  data.forEach((v, i) => {
    if (Number.isFinite(v)) points.push({ x: x.center(i), y: y.scale(v) });
  });
  const last = points[points.length - 1];
  const first = data.find((v) => Number.isFinite(v));
  const latest = [...data].reverse().find((v) => Number.isFinite(v));
  const ariaLabel =
    label ??
    (points.length === 0
      ? "Sparkline with no data"
      : `Sparkline: ${data.length} points from ${formatNumber(first ?? 0)} to ${formatNumber(
          latest ?? 0,
        )}, low ${formatNumber(min)}, high ${formatNumber(max)}.`);

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-spark", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
    >
      {area && points.length > 0 ? (
        <path
          className="lac-chart-area"
          d={areaPath(points, height)}
          fill={stroke}
          fillOpacity={0.16}
          stroke="none"
        />
      ) : null}
      <path
        className="lac-chart-line-path"
        d={curve ? smoothPath(points) : linePath(points)}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastDot && last ? (
        <circle className="lac-chart-dot" cx={last.x} cy={last.y} r={strokeWidth + 1} fill={stroke} />
      ) : null}
    </ChartFrame>
  );
});

export interface SparkBarsProps extends Omit<ChartBaseProps, "margin" | "colors"> {
  /** The numbers. Negatives hang below the baseline. */
  data: number[];
  /** Bar colour. Defaults to the first palette hue. */
  color?: string;
  /** Colour for negative bars. Defaults to `color`. */
  negativeColor?: string;
  /** Gap between bars, as a fraction of the slot. */
  gap?: number;
  /** Corner radius on the cap end. */
  radius?: number;
  /** Highlight the last bar and mute the rest — "this week, in context". */
  highlightLast?: boolean;
  /** Pin the vertical range. */
  domain?: [number, number];
}

/**
 * The bar-shaped sparkline: same job, but for counts rather than a trend.
 *
 * Negative values draw downwards from a zero baseline, so a bars-only revenue
 * strip cannot quietly show a loss as a gain.
 */
export const SparkBars = forwardRef<HTMLDivElement, SparkBarsProps>(function SparkBars(
  {
    data = [],
    width = 120,
    height = 32,
    color,
    negativeColor,
    gap = 0.3,
    radius = 1.5,
    highlightLast = false,
    domain,
    responsive = false,
    label,
    className,
    ...rest
  },
  ref,
) {
  const fill = color ?? colorAt(0);
  const down = negativeColor ?? fill;
  const finite = data.filter((v) => Number.isFinite(v));
  const [rawMin, rawMax] = domain ?? extent(finite);
  const [min, max] = padDegenerate(Math.min(0, rawMin), Math.max(0, rawMax));
  const y = linearScale([min, max], [height, 0]);
  const x = bandScale(Math.max(1, data.length), [0, width], gap);
  const zero = y.scale(0);
  const ariaLabel =
    label ??
    (finite.length === 0
      ? "Bar sparkline with no data"
      : `Bar sparkline: ${data.length} bars from ${formatNumber(rawMin)} to ${formatNumber(rawMax)}.`);

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-sparkbars", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
    >
      {data.map((v, i) => {
        if (!Number.isFinite(v)) return null;
        const top = y.scale(v);
        const h = Math.max(1, Math.abs(top - zero));
        const isLast = i === data.length - 1;
        return (
          <path
            key={i}
            className="lac-chart-bar-shape"
            d={roundedBarPath(x.at(i), Math.min(top, zero), x.bandwidth, h, radius, v < 0 ? "bottom" : "top")}
            fill={v < 0 ? down : fill}
            opacity={highlightLast && !isLast ? 0.38 : 1}
          />
        );
      })}
    </ChartFrame>
  );
});
