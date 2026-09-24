import { forwardRef } from "react";
import { cx } from "./util.js";
import { colorAt, formatNumber, formatPercent, funnelStages, polygonPath } from "./scale.js";
import { ChartDataTable, ChartFrame, type ChartBaseProps } from "./primitives.js";

/** One step of the funnel. */
export interface FunnelDatum {
  label: string;
  value: number;
  /** Overrides the palette colour for this stage only. */
  color?: string;
}

export interface FunnelChartProps extends Omit<ChartBaseProps, "margin"> {
  /** The stages, widest first. */
  stages: FunnelDatum[];
  /** `trapezoid` tapers between stages; `bar` keeps flat rows. */
  variant?: "trapezoid" | "bar";
  /** Gap between stages in viewBox units. */
  gap?: number;
  /** Show the conversion rate against the previous stage. Default `true`. */
  conversion?: boolean;
  /** Show the share of the first stage on each row. Default `true`. */
  showShare?: boolean;
  /** Format the raw counts. */
  formatValue?: (value: number) => string;
}

/**
 * A funnel: how many made it to each step, and where they left.
 *
 * Width is proportional to the share of the *first* stage, so the shape cannot
 * flatter a bad funnel; the conversion figure beside each step is measured
 * against the *previous* one, because that is the number you can act on.
 *
 * ```tsx
 * <FunnelChart stages={[
 *   { label: "Visited", value: 12400 },
 *   { label: "Signed up", value: 3100 },
 *   { label: "Activated", value: 940 },
 *   { label: "Paid", value: 210 },
 * ]} />
 * ```
 */
export const FunnelChart = forwardRef<HTMLDivElement, FunnelChartProps>(function FunnelChart(
  {
    stages = [],
    width = 520,
    height,
    colors,
    variant = "trapezoid",
    gap = 6,
    conversion = true,
    showShare = true,
    dataTable = false,
    responsive = false,
    label,
    formatValue = (v) => formatNumber(v),
    className,
    ...rest
  },
  ref,
) {
  const computed = funnelStages(stages);
  const rowHeight = 54;
  const boxHeight = height ?? Math.max(rowHeight, computed.length * (rowHeight + gap) + 8);
  const gutter = conversion ? 96 : 12;
  const usable = Math.max(0, width - gutter * 2);
  const centre = width / 2;

  const ariaLabel =
    label ??
    (computed.length === 0
      ? "Funnel chart with no stages"
      : `Funnel chart: ${computed
          .map(
            (s) =>
              `${s.label} ${formatNumber(s.value)} (${formatPercent(s.ofFirst)} of the first stage)`,
          )
          .join(", ")}.`);

  const widthAt = (fraction: number): number => Math.max(2, usable * Math.max(0, fraction));

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-funnel", className)}
      width={width}
      height={boxHeight}
      label={ariaLabel}
      responsive={responsive}
      table={
        dataTable ? (
          <ChartDataTable
            caption={ariaLabel}
            columns={["Value", "Of first", "Of previous", "Drop-off"]}
            rows={computed.map((s) => ({
              header: s.label,
              cells: [
                formatValue(s.value),
                formatPercent(s.ofFirst, 1),
                formatPercent(s.ofPrevious, 1),
                formatValue(s.dropOff),
              ],
            }))}
          />
        ) : null
      }
    >
      {computed.map((stage, i) => {
        const color = stages[i]?.color ?? colorAt(i, colors ?? undefined);
        const y = 4 + i * (rowHeight + gap);
        const top = widthAt(stage.ofFirst);
        const next = computed[i + 1];
        const bottom =
          variant === "trapezoid" && next ? widthAt(next.ofFirst) : top;
        const d = polygonPath([
          { x: centre - top / 2, y },
          { x: centre + top / 2, y },
          { x: centre + bottom / 2, y: y + rowHeight },
          { x: centre - bottom / 2, y: y + rowHeight },
        ]);
        return (
          <g key={i} className="lac-chart-funnel-stage" data-stage={i}>
            <path className="lac-chart-funnel-shape" d={d} fill={color} fillOpacity={0.92} />
            <text
              className="lac-chart-funnel-label"
              x={centre}
              y={y + rowHeight / 2 - 6}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {stage.label}
            </text>
            <text
              className="lac-chart-funnel-value"
              x={centre}
              y={y + rowHeight / 2 + 12}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {formatValue(stage.value)}
              {showShare ? ` · ${formatPercent(stage.ofFirst)}` : ""}
            </text>
            {conversion && i > 0 ? (
              <text
                className="lac-chart-funnel-conversion"
                x={width - 10}
                y={y + rowHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatPercent(stage.ofPrevious)} of previous
              </text>
            ) : null}
          </g>
        );
      })}
    </ChartFrame>
  );
});
