import { forwardRef, useState } from "react";
import { cx } from "./util.js";
import {
  bandScale,
  colorAt,
  describeSeries,
  extent,
  formatNumber,
  linearScale,
  niceTicks,
  padDegenerate,
  plotArea,
  roundedBarPath,
  stackSeries,
} from "./scale.js";
import {
  ChartAxis,
  ChartDataTable,
  ChartFrame,
  ChartGrid,
  ChartLegend,
  ChartTooltip,
  type ChartBaseProps,
  type Series,
} from "./primitives.js";

export interface BarChartProps extends ChartBaseProps {
  /** One entry per series. Two or more series are grouped, or stacked. */
  series: Series[];
  /** Category labels — one per bar group. */
  labels?: string[];
  /** `vertical` for columns, `horizontal` for a ranked list of bars. */
  orientation?: "vertical" | "horizontal";
  /** Stack the series instead of standing them side by side. */
  stacked?: boolean;
  /** Corner radius on the cap end of each bar. */
  radius?: number;
  /** Gap between category groups, as a fraction of the slot. `0`–`0.95`. */
  gap?: number;
  /** Background grid lines. Default `true`. */
  grid?: boolean;
  /** Show the key. Default `true` when any series is named. */
  legend?: boolean;
  /** Hover card. Off by default. */
  tooltip?: boolean;
  /** Print the value on each bar. Best with a single series. */
  valueLabels?: boolean;
  /** Roughly how many value-axis ticks to aim for. */
  valueTicks?: number;
  /** Pin the value axis. */
  valueDomain?: [number, number];
  /** Format the numbers on the axis, the labels and the tooltip. */
  formatValue?: (value: number) => string;
}

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  value: number;
  series: number;
  category: number;
  /** Which end gets the rounded cap. */
  side: "top" | "bottom" | "left" | "right";
  cap: boolean;
}

/**
 * A bar chart: vertical or horizontal, grouped or stacked.
 *
 * Only the cap end of a bar is rounded — rounding all four corners makes short
 * bars read as shorter than they are, which is a lie the axis cannot correct.
 *
 * ```tsx
 * <BarChart
 *   labels={["Q1", "Q2", "Q3", "Q4"]}
 *   series={[{ name: "2025", data: [12, 19, 15, 22] }, { name: "2026", data: [18, 21, 17, 29] }]}
 *   tooltip
 * />
 * ```
 */
export const BarChart = forwardRef<HTMLDivElement, BarChartProps>(function BarChart(
  {
    series,
    labels = [],
    width = 560,
    height = 300,
    colors,
    orientation = "vertical",
    stacked = false,
    radius = 4,
    gap = 0.28,
    grid = true,
    legend,
    tooltip = false,
    valueLabels = false,
    valueTicks = 5,
    valueDomain,
    dataTable = false,
    responsive = false,
    margin,
    label,
    formatValue = (v) => formatNumber(v),
    className,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState<number | null>(null);
  const horizontal = orientation === "horizontal";
  const plot = plotArea(
    width,
    height,
    margin ?? (horizontal ? { left: 78, bottom: 26 } : undefined),
  );
  const count = Math.max(labels.length, ...series.map((s) => s.data.length), 1);
  const stacks = stacked ? stackSeries(series.map((s) => s.data)) : null;

  const values: number[] = stacks
    ? [0, ...stacks.flatMap((bands) => bands.flat())]
    : [0, ...series.flatMap((s) => s.data.filter((v) => Number.isFinite(v)))];
  const [rawMin, rawMax] = valueDomain ?? extent(values);
  const ticks = niceTicks(rawMin, rawMax, valueTicks);
  const domain: [number, number] = valueDomain ?? [
    Math.min(ticks[0] ?? rawMin, rawMin),
    Math.max(ticks[ticks.length - 1] ?? rawMax, rawMax),
  ];
  const [d0, d1] = padDegenerate(domain[0], domain[1]);
  const value = linearScale([d0, d1], horizontal ? [plot.x0, plot.x1] : [plot.y1, plot.y0]);
  const category = bandScale(count, horizontal ? [plot.y0, plot.y1] : [plot.x0, plot.x1], gap);
  const zero = value.scale(Math.max(d0, Math.min(0, d1)));

  // The topmost positive segment in each stack carries the rounded cap.
  const capIndex = Array.from({ length: count }, (_, i) => {
    let last = -1;
    series.forEach((s, si) => {
      const v = s.data[i];
      if (v !== undefined && Number.isFinite(v) && v > 0) last = si;
    });
    return last;
  });

  const bars: Bar[] = [];
  series.forEach((s, si) => {
    const color = s.color ?? colorAt(si, colors ?? undefined);
    const inner = stacks
      ? null
      : bandScale(Math.max(1, series.length), [0, category.bandwidth], series.length > 1 ? 0.14 : 0);
    for (let ci = 0; ci < count; ci++) {
      const raw = s.data[ci];
      if (raw === undefined || !Number.isFinite(raw)) continue;
      const band = stacks?.[si]?.[ci];
      const from = band ? band[0] : 0;
      const to = band ? band[1] : raw;
      const a = value.scale(from);
      const b = value.scale(to);
      const slotStart = category.at(ci) + (inner ? inner.at(si) : 0);
      const thickness = inner ? inner.bandwidth : category.bandwidth;
      const cap = stacks ? capIndex[ci] === si : true;
      const positive = to >= from;
      if (horizontal) {
        bars.push({
          x: Math.min(a, b),
          y: slotStart,
          width: Math.abs(b - a),
          height: thickness,
          color,
          value: raw,
          series: si,
          category: ci,
          side: positive ? "right" : "left",
          cap,
        });
      } else {
        bars.push({
          x: slotStart,
          y: Math.min(a, b),
          width: thickness,
          height: Math.abs(b - a),
          color,
          value: raw,
          series: si,
          category: ci,
          side: positive ? "top" : "bottom",
          cap,
        });
      }
    }
  });

  const ariaLabel =
    label ?? describeSeries(stacked ? "Stacked bar chart" : "Bar chart", series);
  const showLegend = legend ?? series.some((s) => s.name);
  const categoryTicks = labels
    .slice(0, count)
    .map((text, i) => ({ position: category.center(i), label: text }));
  const valueTickMarks = ticks.map((t) => ({ position: value.scale(t), label: formatValue(t) }));

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-bar", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
      overlay={
        tooltip && hover !== null ? (
          <ChartTooltip
            x={horizontal ? plot.x1 : category.center(hover)}
            y={horizontal ? category.center(hover) : plot.y0 + 8}
            width={width}
            height={height}
            title={labels[hover] ?? `#${hover + 1}`}
            rows={series.map((s, i) => {
              const v = s.data[hover];
              return {
                label: s.name ?? `Series ${i + 1}`,
                value: v === undefined || !Number.isFinite(v) ? "—" : formatValue(v),
                color: s.color ?? colorAt(i, colors ?? undefined),
              };
            })}
          />
        ) : null
      }
      footer={
        showLegend ? (
          <ChartLegend
            items={series.map((s, i) => ({
              label: s.name ?? `Series ${i + 1}`,
              color: s.color ?? colorAt(i, colors ?? undefined),
            }))}
          />
        ) : null
      }
      table={
        dataTable ? (
          <ChartDataTable
            caption={ariaLabel}
            columns={Array.from({ length: count }, (_, i) => labels[i] ?? `#${i + 1}`)}
            rows={series.map((s, i) => ({
              header: s.name ?? `Series ${i + 1}`,
              cells: Array.from({ length: count }, (_, j) => {
                const v = s.data[j];
                return v === undefined ? "—" : formatValue(v);
              }),
            }))}
          />
        ) : null
      }
      onPlotMove={
        tooltip ? (point) => setHover(category.indexAt(horizontal ? point.y : point.x)) : undefined
      }
      onPlotLeave={tooltip ? () => setHover(null) : undefined}
    >
      {grid ? (
        <ChartGrid
          plot={plot}
          y={horizontal ? [] : valueTickMarks.map((t) => t.position)}
          x={horizontal ? valueTickMarks.map((t) => t.position) : []}
          baselineY={horizontal || d0 >= 0 ? undefined : zero}
        />
      ) : null}

      {bars.map((bar, i) => (
        <path
          key={i}
          className="lac-chart-bar-shape"
          data-series={bar.series}
          data-category={bar.category}
          d={roundedBarPath(
            bar.x,
            bar.y,
            bar.width,
            bar.height,
            bar.cap ? radius : 0,
            bar.side,
          )}
          fill={bar.color}
          opacity={hover === null || hover === bar.category ? 1 : 0.45}
        />
      ))}

      {valueLabels
        ? bars.map((bar, i) => (
            <text
              key={i}
              className="lac-chart-value-label"
              x={horizontal ? bar.x + bar.width + 6 : bar.x + bar.width / 2}
              y={horizontal ? bar.y + bar.height / 2 : bar.y - 6}
              textAnchor={horizontal ? "start" : "middle"}
              dominantBaseline={horizontal ? "middle" : "auto"}
            >
              {formatValue(bar.value)}
            </text>
          ))
        : null}

      <ChartAxis
        orientation="left"
        plot={plot}
        ticks={horizontal ? categoryTicks : valueTickMarks}
      />
      <ChartAxis
        orientation="bottom"
        plot={plot}
        ticks={horizontal ? valueTickMarks : categoryTicks}
      />
    </ChartFrame>
  );
});
