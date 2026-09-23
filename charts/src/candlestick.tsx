import { forwardRef, useState } from "react";
import { cx } from "./util.js";
import {
  bandScale,
  candleDirection,
  formatNumber,
  linearScale,
  niceTicks,
  ohlcExtent,
  padDegenerate,
  plotArea,
  type Candle,
} from "./scale.js";
import {
  ChartAxis,
  ChartDataTable,
  ChartFrame,
  ChartGrid,
  ChartTooltip,
  type ChartBaseProps,
} from "./primitives.js";

export type { Candle };

export interface CandlestickChartProps extends Omit<ChartBaseProps, "colors"> {
  /** One entry per period, oldest first. */
  data: Candle[];
  /** Body colour for a period that closed up. */
  upColor?: string;
  /** Body colour for a period that closed down. */
  downColor?: string;
  /** Wick thickness in viewBox units. */
  wickWidth?: number;
  /** Gap between candles, as a fraction of the slot. */
  gap?: number;
  /** Background grid lines. Default `true`. */
  grid?: boolean;
  /** Hover card with the full OHLC. Off by default. */
  tooltip?: boolean;
  /** Roughly how many price ticks to aim for. */
  priceTicks?: number;
  /** Show every nth period label. */
  labelEvery?: number;
  /** Format prices. */
  formatValue?: (value: number) => string;
}

/**
 * A candlestick chart for OHLC data.
 *
 * The price axis is derived from opens and closes as well as highs and lows,
 * because real market feeds do occasionally ship a close outside the reported
 * range, and a chart that trusts the high/low silently clips the candle.
 *
 * ```tsx
 * <CandlestickChart
 *   data={[{ label: "Mon", open: 101, high: 108, low: 99, close: 106 }]}
 *   tooltip
 * />
 * ```
 */
export const CandlestickChart = forwardRef<HTMLDivElement, CandlestickChartProps>(
  function CandlestickChart(
    {
      data,
      width = 620,
      height = 320,
      upColor = "#16a34a",
      downColor = "#dc2626",
      wickWidth = 1.5,
      gap = 0.32,
      grid = true,
      tooltip = false,
      priceTicks = 5,
      labelEvery = 1,
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
    const plot = plotArea(width, height, margin ?? { left: 54 });
    const count = Math.max(1, data.length);
    const [rawMin, rawMax] = ohlcExtent(data);
    const ticks = niceTicks(rawMin, rawMax, priceTicks);
    const [d0, d1] = padDegenerate(
      Math.min(ticks[0] ?? rawMin, rawMin),
      Math.max(ticks[ticks.length - 1] ?? rawMax, rawMax),
    );
    const y = linearScale([d0, d1], [plot.y1, plot.y0]);
    const x = bandScale(count, [plot.x0, plot.x1], gap);
    const first = data[0];
    const last = data[data.length - 1];

    const ariaLabel =
      label ??
      (data.length === 0
        ? "Candlestick chart with no data"
        : `Candlestick chart: ${data.length} periods, opening at ${formatNumber(
            first?.open ?? 0,
          )} and closing at ${formatNumber(last?.close ?? 0)}, low ${formatNumber(
            rawMin,
          )}, high ${formatNumber(rawMax)}.`);

    const hovered = hover === null ? undefined : data[hover];

    return (
      <ChartFrame
        {...rest}
        ref={ref}
        className={cx("lac-chart-candles", className)}
        width={width}
        height={height}
        label={ariaLabel}
        responsive={responsive}
        overlay={
          tooltip && hovered && hover !== null ? (
            <ChartTooltip
              x={x.center(hover)}
              y={y.scale(hovered.high)}
              width={width}
              height={height}
              title={hovered.label ?? `#${hover + 1}`}
              rows={[
                { label: "Open", value: formatValue(hovered.open) },
                { label: "High", value: formatValue(hovered.high) },
                { label: "Low", value: formatValue(hovered.low) },
                {
                  label: "Close",
                  value: formatValue(hovered.close),
                  color: candleDirection(hovered) === "down" ? downColor : upColor,
                },
              ]}
            />
          ) : null
        }
        table={
          dataTable ? (
            <ChartDataTable
              caption={ariaLabel}
              columns={["Open", "High", "Low", "Close"]}
              rows={data.map((c, i) => ({
                header: c.label ?? `#${i + 1}`,
                cells: [
                  formatValue(c.open),
                  formatValue(c.high),
                  formatValue(c.low),
                  formatValue(c.close),
                ],
              }))}
            />
          ) : null
        }
        onPlotMove={tooltip ? (point) => setHover(x.indexAt(point.x)) : undefined}
        onPlotLeave={tooltip ? () => setHover(null) : undefined}
      >
        {grid ? <ChartGrid plot={plot} y={ticks.map((t) => y.scale(t))} /> : null}

        {data.map((candle, i) => {
          const direction = candleDirection(candle);
          const color = direction === "down" ? downColor : upColor;
          const centre = x.center(i);
          const openY = y.scale(candle.open);
          const closeY = y.scale(candle.close);
          const bodyTop = Math.min(openY, closeY);
          // A doji has no body: give it a hairline so the period is still visible.
          const bodyHeight = Math.max(1, Math.abs(closeY - openY));
          return (
            <g key={i} className="lac-chart-candle" data-direction={direction} data-index={i}>
              <rect
                className="lac-chart-candle-wick"
                x={centre - wickWidth / 2}
                y={y.scale(candle.high)}
                width={wickWidth}
                height={Math.max(0, y.scale(candle.low) - y.scale(candle.high))}
                fill={color}
              />
              <rect
                className="lac-chart-candle-body"
                x={x.at(i)}
                y={bodyTop}
                width={x.bandwidth}
                height={bodyHeight}
                rx={1.5}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.5}
              />
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
          ticks={data
            .map((c, i) => ({ position: x.center(i), label: c.label ?? "" }))
            .filter((t, i) => t.label !== "" && i % Math.max(1, labelEvery) === 0)}
        />
      </ChartFrame>
    );
  },
);
