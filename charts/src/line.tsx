import { forwardRef, useState } from "react";
import { cx } from "./util.js";
import {
  areaPath,
  bandScale,
  colorAt,
  describeSeries,
  extent,
  formatNumber,
  linePath,
  linearScale,
  nearestPoint,
  niceTicks,
  padDegenerate,
  plotArea,
  smoothPath,
  stackSeries,
  type Point,
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

/** Props shared by the line and area charts. */
export interface CartesianChartProps extends ChartBaseProps {
  /** One entry per line. Every series should have the same number of values. */
  series: Series[];
  /** Category labels for the x axis — dates, months, buckets. */
  labels?: string[];
  /** Smooth the line into a curve that still passes through every point. */
  curve?: boolean;
  /** Draw a dot on each data point. */
  dots?: boolean;
  /** Line thickness in viewBox units. */
  strokeWidth?: number;
  /** Roughly how many y-axis ticks to aim for. */
  yTicks?: number;
  /** Pin the y axis instead of deriving it from the data. */
  yDomain?: [number, number];
  /** Background grid lines. Default `true`. */
  grid?: boolean;
  /** Show the key under the chart. Default `true` when any series is named. */
  legend?: boolean;
  /** Follow the pointer with a hover card. Off by default — it costs a listener. */
  tooltip?: boolean;
  /** Format the numbers on the axis and in the tooltip. */
  formatValue?: (value: number) => string;
  /** Show every nth category label, to stop a crowded axis overlapping. */
  labelEvery?: number;
}

interface HoverState {
  index: number;
  x: number;
  y: number;
}

function seriesColor(series: Series | undefined, index: number, colors?: string[]): string {
  return series?.color ?? colorAt(index, colors ?? undefined);
}

function finitePoints(points: Array<Point | null>): Point[] {
  const out: Point[] = [];
  for (const p of points) if (p) out.push(p);
  return out;
}

/**
 * A multi-series line chart.
 *
 * Gaps in the data (`NaN`, `null` cast to a number) are skipped rather than
 * drawn as zero, because a missing reading is not a reading of nothing.
 *
 * ```tsx
 * <LineChart
 *   labels={["Mon", "Tue", "Wed"]}
 *   series={[{ name: "Signups", data: [12, 19, 15] }]}
 *   curve
 *   dots
 *   tooltip
 * />
 * ```
 */
export const LineChart = forwardRef<HTMLDivElement, CartesianChartProps>(function LineChart(
  {
    series = [],
    labels = [],
    width = 560,
    height = 280,
    colors,
    curve = false,
    dots = false,
    strokeWidth = 2,
    yTicks = 5,
    yDomain,
    grid = true,
    legend,
    tooltip = false,
    dataTable = false,
    responsive = false,
    margin,
    label,
    formatValue = (v) => formatNumber(v),
    labelEvery = 1,
    className,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const plot = plotArea(width, height, margin);
  const count = Math.max(labels.length, ...series.map((s) => s.data.length), 1);
  const all = series.flatMap((s) => s.data.filter((v) => Number.isFinite(v)));
  const [rawMin, rawMax] = yDomain ?? extent(all);
  const ticks = niceTicks(rawMin, rawMax, yTicks);
  const domain: [number, number] = yDomain ?? [
    Math.min(ticks[0] ?? rawMin, rawMin),
    Math.max(ticks[ticks.length - 1] ?? rawMax, rawMax),
  ];
  const y = linearScale(padDegenerate(domain[0], domain[1]), [plot.y1, plot.y0]);
  const x = bandScale(count, [plot.x0, plot.x1], 0);
  const centers: Point[] = Array.from({ length: count }, (_, i) => ({
    x: x.center(i),
    y: plot.y0,
  }));

  const geometry = series.map((s) =>
    Array.from({ length: count }, (_, i): Point | null => {
      const v = s.data[i];
      return v === undefined || !Number.isFinite(v) ? null : { x: x.center(i), y: y.scale(v) };
    }),
  );

  const ariaLabel = label ?? describeSeries("Line chart", series);
  const showLegend = legend ?? series.some((s) => s.name);

  const tip =
    tooltip && hover
      ? (() => {
          const rows = series.map((s, i) => {
            const v = s.data[hover.index];
            return {
              label: s.name ?? `Series ${i + 1}`,
              value: v === undefined || !Number.isFinite(v) ? "—" : formatValue(v),
              color: seriesColor(s, i, colors),
            };
          });
          return (
            <ChartTooltip
              x={hover.x}
              y={hover.y}
              width={width}
              height={height}
              title={labels[hover.index] ?? `#${hover.index + 1}`}
              rows={rows}
            />
          );
        })()
      : null;

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-line", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
      overlay={tip}
      footer={
        showLegend ? (
          <ChartLegend
            items={series.map((s, i) => ({
              label: s.name ?? `Series ${i + 1}`,
              color: seriesColor(s, i, colors),
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
        tooltip
          ? (point) => {
              const hit = nearestPoint(centers, point.x);
              if (!hit) return;
              const first = geometry.find((g) => g[hit.index]);
              const anchor = first?.[hit.index];
              setHover({ index: hit.index, x: hit.point.x, y: anchor?.y ?? plot.y0 });
            }
          : undefined
      }
      onPlotLeave={tooltip ? () => setHover(null) : undefined}
    >
      {grid ? (
        <ChartGrid plot={plot} y={ticks.map((t) => y.scale(t))} baselineY={domain[0] < 0 ? y.scale(0) : undefined} />
      ) : null}

      {series.map((s, i) => {
        const points = finitePoints(geometry[i] ?? []);
        if (points.length === 0) return null;
        const color = seriesColor(s, i, colors);
        const d = curve ? smoothPath(points) : linePath(points);
        return (
          <g key={i} className="lac-chart-series" data-series={i}>
            {s.area ? (
              <path
                className="lac-chart-area"
                d={areaPath(points, plot.y1, curve)}
                fill={color}
                fillOpacity={0.14}
                stroke="none"
              />
            ) : null}
            <path
              className="lac-chart-line-path"
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "6 5" : undefined}
            />
            {dots
              ? points.map((p, j) => (
                  <circle
                    key={j}
                    className="lac-chart-dot"
                    cx={p.x}
                    cy={p.y}
                    r={strokeWidth + 1}
                    fill={color}
                  />
                ))
              : null}
          </g>
        );
      })}

      {hover ? (
        <g className="lac-chart-hover" aria-hidden>
          <line
            className="lac-chart-hover-line"
            x1={centers[hover.index]?.x ?? 0}
            x2={centers[hover.index]?.x ?? 0}
            y1={plot.y0}
            y2={plot.y1}
          />
          {series.map((s, i) => {
            const p = geometry[i]?.[hover.index];
            if (!p) return null;
            return (
              <circle
                key={i}
                className="lac-chart-dot"
                cx={p.x}
                cy={p.y}
                r={strokeWidth + 2}
                fill={seriesColor(s, i, colors)}
              />
            );
          })}
        </g>
      ) : null}

      <ChartAxis
        orientation="left"
        plot={plot}
        ticks={ticks.map((t) => ({ position: y.scale(t), label: formatValue(t) }))}
      />
      <ChartAxis
        orientation="bottom"
        plot={plot}
        ticks={labels
          .slice(0, count)
          .map((text, i) => ({ position: x.center(i), label: text }))
          .filter((_, i) => i % Math.max(1, labelEvery) === 0)}
      />
    </ChartFrame>
  );
});

/** Props for the area chart. */
export interface AreaChartProps extends CartesianChartProps {
  /** Stack the series on top of each other instead of overlapping them. */
  stacked?: boolean;
  /** Fill opacity for the overlapping mode, where fills sit on top of each other. */
  fillOpacity?: number;
}

/**
 * An area chart, stacked or overlapping.
 *
 * Stacked answers "what makes up the total"; overlapping answers "how do these
 * compare". They are different questions, so this is a prop and not a guess —
 * and in overlapping mode the fills are deliberately translucent, because an
 * opaque area chart hides the series behind it.
 */
export const AreaChart = forwardRef<HTMLDivElement, AreaChartProps>(function AreaChart(
  {
    series = [],
    labels = [],
    width = 560,
    height = 280,
    colors,
    stacked = false,
    fillOpacity,
    curve = false,
    dots = false,
    strokeWidth = 2,
    yTicks = 5,
    yDomain,
    grid = true,
    legend,
    tooltip = false,
    dataTable = false,
    responsive = false,
    margin,
    label,
    formatValue = (v) => formatNumber(v),
    labelEvery = 1,
    className,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const plot = plotArea(width, height, margin);
  const count = Math.max(labels.length, ...series.map((s) => s.data.length), 1);
  const stacks = stacked ? stackSeries(series.map((s) => s.data)) : null;

  const values: number[] = stacks
    ? [0, ...stacks.flatMap((bands) => bands.map(([, to]) => to))]
    : [0, ...series.flatMap((s) => s.data.filter((v) => Number.isFinite(v)))];
  const [rawMin, rawMax] = yDomain ?? extent(values);
  const ticks = niceTicks(rawMin, rawMax, yTicks);
  const domain: [number, number] = yDomain ?? [
    Math.min(ticks[0] ?? rawMin, rawMin),
    Math.max(ticks[ticks.length - 1] ?? rawMax, rawMax),
  ];
  const y = linearScale(padDegenerate(domain[0], domain[1]), [plot.y1, plot.y0]);
  const x = bandScale(count, [plot.x0, plot.x1], 0);
  const centers: Point[] = Array.from({ length: count }, (_, i) => ({ x: x.center(i), y: plot.y0 }));
  const zeroY = y.scale(0);

  const tops = series.map((s, si) =>
    Array.from({ length: count }, (_, i): Point | null => {
      const raw = s.data[i];
      if (raw === undefined || !Number.isFinite(raw)) return stacks ? { x: x.center(i), y: zeroY } : null;
      const top = stacks ? (stacks[si]?.[i]?.[1] ?? 0) : raw;
      return { x: x.center(i), y: y.scale(top) };
    }),
  );
  const bottoms = series.map((_, si) =>
    Array.from({ length: count }, (_, i): Point => ({
      x: x.center(i),
      y: stacks ? y.scale(stacks[si]?.[i]?.[0] ?? 0) : zeroY,
    })),
  );

  const ariaLabel = label ?? describeSeries(stacked ? "Stacked area chart" : "Area chart", series);
  const showLegend = legend ?? series.some((s) => s.name);
  const opacity = fillOpacity ?? (stacked ? 0.85 : 0.28);

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-area-chart", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
      overlay={
        tooltip && hover ? (
          <ChartTooltip
            x={hover.x}
            y={hover.y}
            width={width}
            height={height}
            title={labels[hover.index] ?? `#${hover.index + 1}`}
            rows={series.map((s, i) => {
              const v = s.data[hover.index];
              return {
                label: s.name ?? `Series ${i + 1}`,
                value: v === undefined || !Number.isFinite(v) ? "—" : formatValue(v),
                color: seriesColor(s, i, colors),
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
              color: seriesColor(s, i, colors),
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
        tooltip
          ? (point) => {
              const hit = nearestPoint(centers, point.x);
              if (!hit) return;
              const anchor = tops[0]?.[hit.index];
              setHover({ index: hit.index, x: hit.point.x, y: anchor?.y ?? plot.y0 });
            }
          : undefined
      }
      onPlotLeave={tooltip ? () => setHover(null) : undefined}
    >
      {grid ? (
        <ChartGrid plot={plot} y={ticks.map((t) => y.scale(t))} baselineY={domain[0] < 0 ? zeroY : undefined} />
      ) : null}

      {series.map((s, i) => {
        const top = finitePoints(tops[i] ?? []);
        if (top.length === 0) return null;
        const color = seriesColor(s, i, colors);
        const base = bottoms[i] ?? [];
        const lower = [...base].reverse();
        const d = stacks
          ? `${curve ? smoothPath(top) : linePath(top)} L${lower
              .map((p) => `${p.x} ${p.y}`)
              .join(" L")} Z`
          : areaPath(top, plot.y1, curve);
        return (
          <g key={i} className="lac-chart-series" data-series={i}>
            <path className="lac-chart-area" d={d} fill={color} fillOpacity={opacity} stroke="none" />
            <path
              className="lac-chart-line-path"
              d={curve ? smoothPath(top) : linePath(top)}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "6 5" : undefined}
            />
            {dots
              ? top.map((p, j) => (
                  <circle key={j} className="lac-chart-dot" cx={p.x} cy={p.y} r={strokeWidth + 1} fill={color} />
                ))
              : null}
          </g>
        );
      })}

      <ChartAxis
        orientation="left"
        plot={plot}
        ticks={ticks.map((t) => ({ position: y.scale(t), label: formatValue(t) }))}
      />
      <ChartAxis
        orientation="bottom"
        plot={plot}
        ticks={labels
          .slice(0, count)
          .map((text, i) => ({ position: x.center(i), label: text }))
          .filter((_, i) => i % Math.max(1, labelEvery) === 0)}
      />
    </ChartFrame>
  );
});
