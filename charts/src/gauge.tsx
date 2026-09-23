import { forwardRef } from "react";
import type { ReactNode } from "react";
import { clamp, cx } from "./util.js";
import { arcPath, colorAt, formatNumber, gaugeAngle, polarPoint, polygonPath } from "./scale.js";
import { ChartFrame, type ChartBaseProps } from "./primitives.js";

/** A coloured stretch of the arc — "good", "watch", "critical". */
export interface GaugeBand {
  from: number;
  to: number;
  color: string;
  /** Used in the accessible summary when the value falls inside this band. */
  label?: string;
}

export interface GaugeProps extends Omit<ChartBaseProps, "margin"> {
  /** The reading. Clamped into `min`–`max`. */
  value: number;
  /** Bottom of the scale. Default `0`. */
  min?: number;
  /** Top of the scale. Default `100`. */
  max?: number;
  /** Threshold bands painted along the track. */
  bands?: GaugeBand[];
  /** `fill` sweeps the arc up to the value; `needle` points at it. */
  variant?: "fill" | "needle";
  /** Where the arc starts, in degrees from twelve o'clock. Default `-120`. */
  startAngle?: number;
  /** Where it ends. Default `120`. */
  endAngle?: number;
  /** Arc thickness as a fraction of the radius. */
  thickness?: number;
  /** The big number in the middle. Pass `null` to hide it. */
  center?: ReactNode;
  /** Small caption under the value — the unit, the target. */
  caption?: string;
  /** Format the value and the end labels. */
  formatValue?: (value: number) => string;
  /** Print the min and max at the ends of the arc. Default `true`. */
  endLabels?: boolean;
}

/**
 * A gauge: one number, against the range it is allowed to be in.
 *
 * `bands` is the part that earns its keep — a gauge without thresholds is a
 * number in a circle, while a gauge with them tells you whether to worry.
 *
 * ```tsx
 * <Gauge
 *   value={72}
 *   bands={[
 *     { from: 0, to: 60, color: "#16a34a", label: "healthy" },
 *     { from: 60, to: 85, color: "#f59e0b", label: "busy" },
 *     { from: 85, to: 100, color: "#ef4444", label: "critical" },
 *   ]}
 *   caption="CPU"
 * />
 * ```
 */
export const Gauge = forwardRef<HTMLDivElement, GaugeProps>(function Gauge(
  {
    value,
    min = 0,
    max = 100,
    bands,
    variant = "fill",
    startAngle = -120,
    endAngle = 120,
    thickness = 0.22,
    width = 260,
    height = 190,
    colors,
    center,
    caption,
    dataTable = false,
    responsive = false,
    label,
    formatValue = (v) => formatNumber(v),
    endLabels = true,
    className,
    ...rest
  },
  ref,
) {
  const cxc = width / 2;
  const outer = Math.max(0, Math.min(width / 2, height * 0.78) - 14);
  const ring = outer * clamp(thickness, 0.04, 0.6);
  const inner = outer - ring;
  // Sit the pivot low enough that the arc's ends and their labels stay inside
  // the viewBox — an arc centred on the box clips its own end labels.
  const cyc = height - Math.max(24, height * 0.22);
  const safe = clamp(value, Math.min(min, max), Math.max(min, max));
  const angle = gaugeAngle(safe, min, max, startAngle, endAngle);
  const accent = colorAt(0, colors ?? undefined);
  const activeBand = bands?.find((b) => safe >= Math.min(b.from, b.to) && safe <= Math.max(b.from, b.to));
  const fillColor = activeBand?.color ?? accent;

  const ariaLabel =
    label ??
    `Gauge: ${formatValue(safe)} of ${formatValue(max)}${
      activeBand?.label ? `, in the ${activeBand.label} band` : ""
    }.`;

  const needle = (() => {
    const tip = polarPoint(cxc, cyc, inner - 4, angle);
    const left = polarPoint(cxc, cyc, ring * 0.22, angle - 90);
    const right = polarPoint(cxc, cyc, ring * 0.22, angle + 90);
    return polygonPath([left, tip, right]);
  })();

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-gauge", className)}
      width={width}
      height={height}
      label={ariaLabel}
      responsive={responsive}
      table={
        dataTable ? (
          <div className="lac lac-chart-sr">
            <table>
              <caption>{ariaLabel}</caption>
              <tbody>
                <tr>
                  <th scope="row">Value</th>
                  <td>{formatValue(safe)}</td>
                </tr>
                <tr>
                  <th scope="row">Range</th>
                  <td>
                    {formatValue(min)} – {formatValue(max)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null
      }
    >
      <path
        className="lac-chart-gauge-track"
        d={arcPath(cxc, cyc, outer, inner, startAngle, endAngle)}
        fill="currentColor"
      />

      {bands?.map((band, i) => {
        const a = gaugeAngle(Math.min(band.from, band.to), min, max, startAngle, endAngle);
        const b = gaugeAngle(Math.max(band.from, band.to), min, max, startAngle, endAngle);
        const d = arcPath(cxc, cyc, outer, variant === "needle" ? inner : outer - ring * 0.32, a, b);
        if (!d) return null;
        return (
          <path
            key={i}
            className="lac-chart-gauge-band"
            d={d}
            fill={band.color}
            opacity={variant === "needle" ? 0.9 : 0.85}
          />
        );
      })}

      {variant === "fill" ? (
        <path
          className="lac-chart-gauge-fill"
          d={arcPath(cxc, cyc, outer - ring * 0.38, inner, startAngle, angle)}
          fill={fillColor}
        />
      ) : (
        <>
          <path className="lac-chart-gauge-needle" d={needle} fill="currentColor" />
          <circle
            className="lac-chart-gauge-pivot"
            cx={cxc}
            cy={cyc}
            r={Math.max(3, ring * 0.26)}
            fill="currentColor"
          />
        </>
      )}

      {endLabels ? (
        <>
          <text
            className="lac-chart-axis-label"
            x={polarPoint(cxc, cyc, outer + 10, startAngle).x}
            y={polarPoint(cxc, cyc, outer + 10, startAngle).y + 4}
            textAnchor="middle"
          >
            {formatValue(min)}
          </text>
          <text
            className="lac-chart-axis-label"
            x={polarPoint(cxc, cyc, outer + 10, endAngle).x}
            y={polarPoint(cxc, cyc, outer + 10, endAngle).y + 4}
            textAnchor="middle"
          >
            {formatValue(max)}
          </text>
        </>
      ) : null}

      {center === null ? null : (
        <text
          className="lac-chart-gauge-value"
          x={cxc}
          y={cyc - (variant === "needle" ? ring * 1.6 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {center ?? formatValue(safe)}
        </text>
      )}

      {caption ? (
        <text className="lac-chart-gauge-caption" x={cxc} y={cyc + 20} textAnchor="middle">
          {caption}
        </text>
      ) : null}
    </ChartFrame>
  );
});
