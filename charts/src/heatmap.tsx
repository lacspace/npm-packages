import { forwardRef, useState } from "react";
import { cx } from "./util.js";
import {
  calendarCells,
  extent,
  formatNumber,
  heatColor,
  type CalendarCell,
} from "./scale.js";
import {
  ChartDataTable,
  ChartFrame,
  ChartTooltip,
  type ChartBaseProps,
} from "./primitives.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface HeatmapProps extends Omit<ChartBaseProps, "colors"> {
  /** `matrix` for a labelled grid, `calendar` for a contribution-graph year. */
  variant?: "matrix" | "calendar";
  /** Matrix mode: one array per row. */
  data?: number[][];
  /** Matrix mode: row labels, down the left. */
  rows?: string[];
  /** Matrix mode: column labels, along the bottom. */
  columns?: string[];
  /** Calendar mode: `{ date: "2026-03-14", value: 5 }` records, any order. */
  values?: Array<{ date: string; value: number }>;
  /** Cell size in viewBox units. */
  cellSize?: number;
  /** Gap between cells. */
  cellGap?: number;
  /** Cell corner radius. */
  radius?: number;
  /** Cold end of the colour ramp. */
  from?: string;
  /** Hot end of the colour ramp. */
  to?: string;
  /** Pin the colour scale, so two heatmaps can be compared. */
  domain?: [number, number];
  /** Hover card. Off by default. */
  tooltip?: boolean;
  /** Show the "less → more" ramp under the grid. Default `true`. */
  legend?: boolean;
  /** Format the numbers in the tooltip and the table. */
  formatValue?: (value: number) => string;
  /** Calendar mode: label every nth weekday row. Default `2` (Mon, Wed, Fri). */
  weekdayEvery?: number;
}

interface Cell {
  x: number;
  y: number;
  value: number;
  row: string;
  column: string;
}

/**
 * A heatmap, in both shapes people actually want: a labelled matrix
 * (cohorts, correlations, hour-by-weekday) and a calendar year of daily values.
 *
 * Colour is the only encoding here, so the ramp runs between two explicit hex
 * ends rather than a theme token — a `currentColor` heatmap is unreadable, and
 * a token that changes in dark mode would silently re-rank the data.
 *
 * ```tsx
 * <Heatmap rows={["Mon", "Tue"]} columns={["9am", "10am"]} data={[[3, 9], [5, 1]]} tooltip />
 * <Heatmap variant="calendar" values={days} />
 * ```
 */
export const Heatmap = forwardRef<HTMLDivElement, HeatmapProps>(function Heatmap(
  {
    variant = "matrix",
    data = [],
    rows = [],
    columns = [],
    values = [],
    width,
    height,
    cellSize = variant === "calendar" ? 13 : 34,
    cellGap = variant === "calendar" ? 3 : 4,
    radius = variant === "calendar" ? 2 : 4,
    from = "#e6f0ff",
    to = "#1d4ed8",
    domain,
    tooltip = false,
    legend = true,
    dataTable = false,
    responsive = false,
    margin,
    label,
    formatValue = (v) => formatNumber(v),
    weekdayEvery = 2,
    className,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState<Cell | null>(null);
  const step = cellSize + cellGap;
  const calendar: CalendarCell[] = variant === "calendar" ? calendarCells(values) : [];
  const weeks = calendar.reduce((max, c) => Math.max(max, c.week + 1), 0);

  const pad = {
    left: margin?.left ?? (variant === "calendar" ? 34 : 86),
    top: margin?.top ?? 8,
    right: margin?.right ?? 8,
    bottom: margin?.bottom ?? (variant === "calendar" ? 8 : 26),
  };

  const cols = variant === "calendar" ? weeks : Math.max(columns.length, ...data.map((r) => r.length), 0);
  const rowCount = variant === "calendar" ? 7 : Math.max(rows.length, data.length);
  const boxWidth = width ?? pad.left + cols * step + pad.right;
  const boxHeight = height ?? pad.top + rowCount * step + pad.bottom;

  const allValues =
    variant === "calendar" ? calendar.map((c) => c.value) : data.flat().filter((v) => Number.isFinite(v));
  const [min, max] = domain ?? extent(allValues);

  const cells: Cell[] =
    variant === "calendar"
      ? calendar.map((c) => ({
          x: pad.left + c.week * step,
          y: pad.top + c.day * step,
          value: c.value,
          row: WEEKDAYS[c.day] ?? "",
          column: c.date,
        }))
      : data.flatMap((row, r) =>
          row.map((value, c) => ({
            x: pad.left + c * step,
            y: pad.top + r * step,
            value,
            row: rows[r] ?? `Row ${r + 1}`,
            column: columns[c] ?? `Col ${c + 1}`,
          })),
        );

  const ariaLabel =
    label ??
    (cells.length === 0
      ? "Heatmap with no data"
      : `${variant === "calendar" ? "Calendar heatmap" : "Heatmap"} of ${cells.length} cells, from ${formatNumber(
          min,
        )} to ${formatNumber(max)}.`);

  const ramp = [0, 0.25, 0.5, 0.75, 1].map((t) => heatColor(min + t * (max - min), min, max, from, to));

  return (
    <ChartFrame
      {...rest}
      ref={ref}
      className={cx("lac-chart-heatmap", className)}
      width={boxWidth}
      height={boxHeight}
      label={ariaLabel}
      responsive={responsive}
      overlay={
        tooltip && hover ? (
          <ChartTooltip
            x={hover.x + cellSize / 2}
            y={hover.y}
            width={boxWidth}
            height={boxHeight}
            title={variant === "calendar" ? hover.column : `${hover.row} · ${hover.column}`}
            rows={[{ label: variant === "calendar" ? hover.row : "Value", value: formatValue(hover.value) }]}
          />
        ) : null
      }
      footer={
        legend ? (
          <div className="lac lac-chart-ramp">
            <span className="lac-chart-ramp-end">Less</span>
            {ramp.map((color, i) => (
              <span key={i} className="lac-chart-ramp-step" style={{ background: color }} aria-hidden />
            ))}
            <span className="lac-chart-ramp-end">More</span>
          </div>
        ) : null
      }
      table={
        dataTable && variant === "matrix" ? (
          <ChartDataTable
            caption={ariaLabel}
            columns={Array.from({ length: cols }, (_, i) => columns[i] ?? `Col ${i + 1}`)}
            rows={data.map((row, r) => ({
              header: rows[r] ?? `Row ${r + 1}`,
              cells: Array.from({ length: cols }, (_, c) => {
                const v = row[c];
                return v === undefined ? "—" : formatValue(v);
              }),
            }))}
          />
        ) : dataTable ? (
          <ChartDataTable
            caption={ariaLabel}
            columns={["Value"]}
            rows={calendar.map((c) => ({ header: c.date, cells: [formatValue(c.value)] }))}
          />
        ) : null
      }
    >
      {cells.map((cell, i) => (
        <rect
          key={i}
          className="lac-chart-cell"
          x={cell.x}
          y={cell.y}
          width={cellSize}
          height={cellSize}
          rx={radius}
          fill={heatColor(cell.value, min, max, from, to)}
          onMouseEnter={tooltip ? () => setHover(cell) : undefined}
          onMouseLeave={tooltip ? () => setHover(null) : undefined}
        />
      ))}

      {variant === "calendar"
        ? WEEKDAYS.map((day, i) =>
            i % Math.max(1, weekdayEvery) === 1 ? (
              <text
                key={day}
                className="lac-chart-axis-label"
                x={pad.left - 8}
                y={pad.top + i * step + cellSize / 2}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {day}
              </text>
            ) : null,
          )
        : rows.slice(0, rowCount).map((row, i) => (
            <text
              key={row + i}
              className="lac-chart-axis-label"
              x={pad.left - 10}
              y={pad.top + i * step + cellSize / 2}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {row}
            </text>
          ))}

      {variant === "matrix"
        ? columns.slice(0, cols).map((column, i) => (
            <text
              key={column + i}
              className="lac-chart-axis-label"
              x={pad.left + i * step + cellSize / 2}
              y={pad.top + rowCount * step + 16}
              textAnchor="middle"
            >
              {column}
            </text>
          ))
        : null}
    </ChartFrame>
  );
});
