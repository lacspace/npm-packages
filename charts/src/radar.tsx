import { forwardRef } from "react";
import { cx } from "./util.js";
import {
  colorAt,
  describeSeries,
  extent,
  formatNumber,
  polarPoint,
  polygonPath,
  type Point,
} from "./scale.js";
import {
  ChartDataTable,
  ChartFrame,
  ChartLegend,
  type ChartBaseProps,
  type Series,
} from "./primitives.js";

export interface RadarChartProps extends Omit<ChartBaseProps, "margin"> {
  /** One label per spoke, clockwise from the top. */
  axes: string[];
  /** One entry per shape. `data[i]` belongs to `axes[i]`. */
  series: Series[];
  /** Number of grid rings. Default `4`. */
  rings?: number;
  /** Top of the scale. Derived from the data when omitted. */
  maxValue?: number;
  /** Bottom of the scale. Default `0` — a radar with a non-zero floor lies. */
  minValue?: number;
  /** Draw the rings as circles instead of polygons. */
  circular?: boolean;
  /** Dot on each vertex. Default `true`. */
  dots?: boolean;
  /** Fill opacity for each shape. */
  fillOpacity?: number;
  /** Show the key. Default `true` when any series is named. */
  legend?: boolean;
  /** Format the numbers in the ring labels and table. */
  formatValue?: (value: number) => string;
  /** Print the value of each ring up the first spoke. */
  ringLabels?: boolean;
}

/**
 * A radar (spider) chart: several things scored on the same axes.
 *
 * The scale starts at zero unless you say otherwise. Radar charts exaggerate
 * differences by area, and a truncated floor turns a 5% gap into a shape twice
 * the size — that is not a chart, it is a sales deck.
 *
 * ```tsx
 * <RadarChart
 *   axes={["Speed", "Safety", "Cost", "DX", "Support"]}
 *   series={[{ name: "Us", data: [8, 9, 6, 9, 7] }, { name: "Them", data: [6, 7, 9, 5, 6] }]}
 * />
 * ```
 */
export const RadarChart = forwardRef<HTMLDivElement, RadarChartProps>(function RadarChart(
  {
    axes,
    series,
    width = 340,
    height = 340,
    colors,
    rings = 4,
    maxValue,
    minValue = 0,
    circular = false,
    dots = true,
    fillOpacity = 0.22,
    legend,
    dataTable = false,
    responsive = false,
    label,
    formatValue = (v) => formatNumber(v),
    ringLabels = false,
    className,
    ...rest
  },
  ref,
) {
  const count = Math.max(axes.length, 1);
  const cxc = width / 2;
  const cyc = height / 2;
  const radius = Math.max(0, Math.min(width, height) / 2 - 34);
  const dataMax = extent(series.flatMap((s) => s.data.filter((v) => Number.isFinite(v))))[1];
  const top = maxValue ?? (dataMax > minValue ? dataMax : minValue + 1);
  const span = top - minValue || 1;
  const ringCount = Math.max(1, Math.round(rings));

  const angleAt = (i: number): number => (360 / count) * i;
  const pointAt = (i: number, value: number): Point =>
    polarPoint(cxc, cyc, ((value - minValue) / span) * radius, angleAt(i));

  const ariaLabel = label ?? describeSeries("Radar chart", series);
  const showLegend = legend ?? series.some((s) => s.name);

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-radar", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
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
            columns={axes}
            rows={series.map((s, i) => ({
              header: s.name ?? `Series ${i + 1}`,
              cells: axes.map((_, j) => {
                const v = s.data[j];
                return v === undefined ? "—" : formatValue(v);
              }),
            }))}
          />
        ) : null
      }
    >
      <g className="lac-chart-radar-grid" aria-hidden>
        {Array.from({ length: ringCount }, (_, r) => {
          const t = (r + 1) / ringCount;
          if (circular) {
            return (
              <circle
                key={r}
                className="lac-chart-grid-line"
                cx={cxc}
                cy={cyc}
                r={radius * t}
                fill="none"
              />
            );
          }
          const pts = Array.from({ length: count }, (_, i) =>
            polarPoint(cxc, cyc, radius * t, angleAt(i)),
          );
          return <path key={r} className="lac-chart-grid-line" d={polygonPath(pts)} fill="none" />;
        })}
        {Array.from({ length: count }, (_, i) => {
          const end = polarPoint(cxc, cyc, radius, angleAt(i));
          return (
            <line key={i} className="lac-chart-grid-line" x1={cxc} y1={cyc} x2={end.x} y2={end.y} />
          );
        })}
      </g>

      {series.map((s, i) => {
        const color = s.color ?? colorAt(i, colors ?? undefined);
        const pts = Array.from({ length: count }, (_, j) => {
          const v = s.data[j];
          return pointAt(j, Number.isFinite(v) ? (v as number) : minValue);
        });
        return (
          <g key={i} className="lac-chart-series" data-series={i}>
            <path
              className="lac-chart-radar-shape"
              d={polygonPath(pts)}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "6 5" : undefined}
              strokeLinejoin="round"
            />
            {dots
              ? pts.map((p, j) => (
                  <circle key={j} className="lac-chart-dot" cx={p.x} cy={p.y} r={3} fill={color} />
                ))
              : null}
          </g>
        );
      })}

      {ringLabels
        ? Array.from({ length: ringCount }, (_, r) => {
            const t = (r + 1) / ringCount;
            return (
              <text
                key={r}
                className="lac-chart-axis-label"
                x={cxc + 4}
                y={cyc - radius * t}
                dominantBaseline="middle"
              >
                {formatValue(minValue + span * t)}
              </text>
            );
          })
        : null}

      {axes.map((axis, i) => {
        const p = polarPoint(cxc, cyc, radius + 16, angleAt(i));
        const anchor = p.x > cxc + 1 ? "start" : p.x < cxc - 1 ? "end" : "middle";
        return (
          <text
            key={axis + i}
            className="lac-chart-axis-label"
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {axis}
          </text>
        );
      })}
    </ChartFrame>
  );
});
