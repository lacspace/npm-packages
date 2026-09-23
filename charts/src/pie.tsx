import { forwardRef, useState } from "react";
import type { ReactNode } from "react";
import { cx } from "./util.js";
import {
  arcPath,
  colorAt,
  formatNumber,
  formatPercent,
  pieSlices,
  polarPoint,
  sum,
} from "./scale.js";
import {
  ChartDataTable,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  type ChartBaseProps,
} from "./primitives.js";

/** One slice of a pie or donut. */
export interface PieDatum {
  label: string;
  value: number;
  /** Overrides the palette colour for this slice only. */
  color?: string;
}

export interface PieChartProps extends Omit<ChartBaseProps, "margin"> {
  /** The slices, in drawing order, starting at twelve o'clock. */
  data: PieDatum[];
  /** Hole size as a fraction of the radius. `0` is a pie, `0.6` a donut. */
  innerRadius?: number;
  /** Gap between slices, in degrees. A hairline of background, not a stroke. */
  padAngle?: number;
  /** Where the first slice starts, in degrees clockwise from twelve o'clock. */
  startAngle?: number;
  /** Show the key. Default `true`. */
  legend?: boolean;
  /** Put each slice's share in the legend. Default `true`. */
  legendValues?: boolean;
  /** Hover card. Off by default. */
  tooltip?: boolean;
  /** Print the percentage on slices big enough to hold it. */
  sliceLabels?: boolean;
  /** Anything to sit in the middle of a donut — a total, a delta, an icon. */
  center?: ReactNode;
  /** Format the raw values shown in the legend and tooltip. */
  formatValue?: (value: number) => string;
}

/**
 * A pie chart, and with `innerRadius` the donut it grew into.
 *
 * A single 100% slice draws as a real closed ring rather than the empty circle
 * most naive arc maths produces, and zero-value slices draw nothing at all
 * instead of leaving a hairline seam.
 *
 * ```tsx
 * <PieChart data={[{ label: "Direct", value: 62 }, { label: "Search", value: 38 }]} tooltip />
 * ```
 */
export const PieChart = forwardRef<HTMLDivElement, PieChartProps>(function PieChart(
  {
    data,
    width = 320,
    height = 320,
    colors,
    innerRadius = 0,
    padAngle = 0.6,
    startAngle = 0,
    legend = true,
    legendValues = true,
    tooltip = false,
    sliceLabels = false,
    center,
    dataTable = false,
    responsive = false,
    label,
    formatValue = (v) => formatNumber(v),
    className,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState<number | null>(null);
  const cx0 = width / 2;
  const cy0 = height / 2;
  const outer = Math.max(0, Math.min(width, height) / 2 - 10);
  const inner = Math.max(0, Math.min(0.92, innerRadius)) * outer;
  const slices = pieSlices(
    data.map((d) => d.value),
    startAngle,
    startAngle + 360,
  );
  const total = sum(data.map((d) => d.value));
  const onlyOne = slices.filter((s) => s.fraction > 0).length === 1;

  const colorOf = (index: number): string => data[index]?.color ?? colorAt(index, colors ?? undefined);

  const ariaLabel =
    label ??
    (data.length === 0
      ? `${inner > 0 ? "Donut" : "Pie"} chart with no data`
      : `${inner > 0 ? "Donut" : "Pie"} chart of ${formatNumber(total)} across ${data.length} ${
          data.length === 1 ? "slice" : "slices"
        }: ${data
          .map((d, i) => `${d.label} ${formatPercent(slices[i]?.fraction ?? 0)}`)
          .join(", ")}.`);

  const hovered = hover === null ? null : slices[hover];
  const tipAnchor = hovered
    ? polarPoint(cx0, cy0, (outer + inner) / 2, hovered.midAngle)
    : { x: cx0, y: cy0 };

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx(inner > 0 ? "lac-chart-donut" : "lac-chart-pie", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
      overlay={
        tooltip && hover !== null ? (
          <ChartTooltip
            x={tipAnchor.x}
            y={tipAnchor.y}
            width={width}
            height={height}
            title={data[hover]?.label}
            rows={[
              {
                label: formatValue(data[hover]?.value ?? 0),
                value: formatPercent(slices[hover]?.fraction ?? 0, 1),
                color: colorOf(hover),
              },
            ]}
          />
        ) : null
      }
      footer={
        legend ? (
          <ChartLegend
            items={data.map((d, i) => ({
              label: d.label,
              color: colorOf(i),
              value: legendValues ? formatPercent(slices[i]?.fraction ?? 0) : undefined,
            }))}
          />
        ) : null
      }
      table={
        dataTable ? (
          <ChartDataTable
            caption={ariaLabel}
            columns={["Value", "Share"]}
            rows={data.map((d, i) => ({
              header: d.label,
              cells: [formatValue(d.value), formatPercent(slices[i]?.fraction ?? 0, 1)],
            }))}
          />
        ) : null
      }
    >
      <g className="lac-chart-slices">
        {slices.map((slice, i) => {
          if (slice.fraction <= 0) return null;
          // A lone slice keeps its full sweep: padding a 360° arc would cut a
          // visible notch out of a chart that is, honestly, one whole thing.
          const pad = onlyOne ? 0 : Math.min(padAngle, (slice.endAngle - slice.startAngle) / 4);
          const d = arcPath(
            cx0,
            cy0,
            outer,
            inner,
            slice.startAngle + pad / 2,
            slice.endAngle - pad / 2,
          );
          if (!d) return null;
          return (
            <path
              key={i}
              className="lac-chart-slice"
              data-index={i}
              d={d}
              fill={colorOf(i)}
              opacity={hover === null || hover === i ? 1 : 0.55}
              onMouseEnter={tooltip ? () => setHover(i) : undefined}
              onMouseLeave={tooltip ? () => setHover(null) : undefined}
            />
          );
        })}
      </g>

      {sliceLabels
        ? slices.map((slice, i) => {
            if (slice.fraction < 0.06) return null;
            const p = polarPoint(cx0, cy0, inner > 0 ? (outer + inner) / 2 : outer * 0.68, slice.midAngle);
            return (
              <text
                key={i}
                className="lac-chart-slice-label"
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {formatPercent(slice.fraction)}
              </text>
            );
          })
        : null}

      {center === undefined || center === null ? null : typeof center === "string" ||
        typeof center === "number" ? (
        <text
          className="lac-chart-center-text"
          x={cx0}
          y={cy0}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {center}
        </text>
      ) : (
        <foreignObject
          x={cx0 - inner * 0.86}
          y={cy0 - inner * 0.86}
          width={Math.max(0, inner * 1.72)}
          height={Math.max(0, inner * 1.72)}
        >
          <div className="lac lac-chart-center">{center}</div>
        </foreignObject>
      )}
    </ChartFrame>
  );
});

export interface DonutChartProps extends PieChartProps {
  /** Hole size as a fraction of the radius. Default `0.62`. */
  innerRadius?: number;
}

/**
 * A donut chart — a pie with its middle given back to you.
 *
 * Use the `center` slot for the number the chart is really about; a donut with
 * an empty hole is a pie that wasted its best real estate.
 *
 * ```tsx
 * <DonutChart data={data} center={<><strong>1,248</strong><span>orders</span></>} />
 * ```
 */
export const DonutChart = forwardRef<HTMLDivElement, DonutChartProps>(function DonutChart(
  { innerRadius = 0.62, ...rest },
  ref,
) {
  return <PieChart {...rest} ref={ref} innerRadius={innerRadius} />;
});
