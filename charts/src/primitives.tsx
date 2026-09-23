import { forwardRef } from "react";
import type {
  CSSProperties,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SVGProps,
} from "react";
import { classes, cx } from "./util.js";
import type { Margin, Plot, Point } from "./scale.js";

/* ==========================================================================
   Shared prop shapes
   ========================================================================== */

/** One line, area or bar series. */
export interface Series {
  /** Shown in the legend, the tooltip and the accessible summary. */
  name?: string;
  /** One value per category. Non-finite values are treated as gaps. */
  data: number[];
  /** Overrides the palette colour for this series only. */
  color?: string;
  /** Draw the line dashed — for forecasts, targets and "last year". */
  dashed?: boolean;
  /** Fill the space under this line even when the chart is not an area chart. */
  area?: boolean;
}

/**
 * Props every chart in this package accepts.
 *
 * `width`/`height` are viewBox units, not a commitment to pixels: with
 * `responsive` the chart keeps that aspect ratio and fills its container, so
 * the same numbers describe the shape either way.
 */
export interface ChartBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** viewBox width. Default varies by chart. */
  width?: number;
  /** viewBox height. Default varies by chart. */
  height?: number;
  /** Series colours, cycled. Falls back to the built-in accessible palette. */
  colors?: string[];
  /** Accessible name. One is generated from the data when you leave it out. */
  label?: string;
  /** Fill the parent's width, keeping the `width`/`height` aspect ratio. */
  responsive?: boolean;
  /** Also render a visually hidden `<table>` of the data for screen readers. */
  dataTable?: boolean;
  /** Override the space reserved for axis labels. */
  margin?: Partial<Margin>;
}

/* ==========================================================================
   Frame
   ========================================================================== */

export interface ChartFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** viewBox width. */
  width: number;
  /** viewBox height. */
  height: number;
  /** The chart's accessible name — goes on the `role="img"` element. */
  label: string;
  /** Stretch to the parent's width instead of using `width` px. */
  responsive?: boolean;
  /** The SVG contents. */
  children: ReactNode;
  /** HTML drawn over the chart — the tooltip, usually. */
  overlay?: ReactNode;
  /** HTML drawn under the chart — the legend, usually. */
  footer?: ReactNode;
  /** A visually hidden table, from {@link ChartDataTable}. */
  table?: ReactNode;
  /** Pointer moved over the plot. Coordinates are already in viewBox units. */
  onPlotMove?: (point: Point, event: ReactMouseEvent<SVGSVGElement>) => void;
  /** Pointer left the plot. */
  onPlotLeave?: (event: ReactMouseEvent<SVGSVGElement>) => void;
}

/**
 * The wrapper every chart shares: a positioned `<div>`, one `role="img"` SVG
 * with a generated `aria-label`, and slots for a legend, a tooltip and a hidden
 * data table.
 *
 * The SVG is labelled rather than described element-by-element on purpose. A
 * screen reader that has to walk 200 `<rect>`s learns nothing; one sentence and
 * an optional real table is how a chart is actually read.
 */
export const ChartFrame = forwardRef<HTMLDivElement, ChartFrameProps>(function ChartFrame(
  {
    width,
    height,
    label,
    responsive = false,
    children,
    overlay,
    footer,
    table,
    onPlotMove,
    onPlotLeave,
    className,
    style,
    ...rest
  },
  ref,
) {
  const handleMove = onPlotMove
    ? (event: ReactMouseEvent<SVGSVGElement>) => {
        // getBoundingClientRect lives in the handler, never in render, so this
        // component is safe to render on the server.
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        onPlotMove(
          {
            x: ((event.clientX - rect.left) / rect.width) * width,
            y: ((event.clientY - rect.top) / rect.height) * height,
          },
          event,
        );
      }
    : undefined;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-chart", className)}
      data-responsive={responsive || undefined}
      style={style}
    >
      <svg
        className="lac-chart-svg"
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        width={responsive ? "100%" : width}
        height={responsive ? undefined : height}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMove}
        onMouseLeave={onPlotLeave}
      >
        {children}
      </svg>
      {overlay}
      {footer}
      {table}
    </div>
  );
});

/* ==========================================================================
   Grid
   ========================================================================== */

export interface ChartGridProps extends Omit<SVGProps<SVGGElement>, "x" | "y"> {
  /** The plot rectangle the lines span. */
  plot: Plot;
  /** y pixel positions for horizontal lines. */
  y?: number[];
  /** x pixel positions for vertical lines. */
  x?: number[];
  /** Draw a heavier line at this y — the zero baseline, normally. */
  baselineY?: number;
}

/** The background rules a value is read against. Purely decorative, so `aria-hidden`. */
export const ChartGrid = forwardRef<SVGGElement, ChartGridProps>(function ChartGrid(
  { plot, y = [], x = [], baselineY, className, ...rest },
  ref,
) {
  return (
    <g {...rest} ref={ref} className={cx("lac-chart-grid", className)} aria-hidden>
      {y.map((pos, i) => (
        <line key={`y${i}`} className="lac-chart-grid-line" x1={plot.x0} x2={plot.x1} y1={pos} y2={pos} />
      ))}
      {x.map((pos, i) => (
        <line key={`x${i}`} className="lac-chart-grid-line" x1={pos} x2={pos} y1={plot.y0} y2={plot.y1} />
      ))}
      {baselineY === undefined ? null : (
        <line className="lac-chart-baseline" x1={plot.x0} x2={plot.x1} y1={baselineY} y2={baselineY} />
      )}
    </g>
  );
});

/* ==========================================================================
   Axis
   ========================================================================== */

/** One tick: where it sits in pixels, and what it says. */
export interface AxisTick {
  position: number;
  label: string;
}

export interface ChartAxisProps extends SVGProps<SVGGElement> {
  /** Which edge of the plot the axis runs along. */
  orientation: "left" | "right" | "top" | "bottom";
  /** The plot rectangle. */
  plot: Plot;
  /** The ticks to draw. */
  ticks: AxisTick[];
  /** Draw the axis line itself. Default `false` — the grid usually says enough. */
  line?: boolean;
  /** Rotate the labels, for crowded category axes. Degrees. */
  labelAngle?: number;
}

/**
 * A labelled axis.
 *
 * Labels are placed inside the margin that {@link plotArea} reserved, so the
 * outermost one has room and never clips at the edge of the viewBox.
 */
export const ChartAxis = forwardRef<SVGGElement, ChartAxisProps>(function ChartAxis(
  { orientation, plot, ticks, line = false, labelAngle, className, ...rest },
  ref,
) {
  const vertical = orientation === "left" || orientation === "right";
  const anchor = orientation === "left" ? "end" : orientation === "right" ? "start" : "middle";
  const axisX = orientation === "left" ? plot.x0 : plot.x1;
  const axisY = orientation === "top" ? plot.y0 : plot.y1;

  return (
    <g
      {...rest}
      ref={ref}
      className={cx("lac-chart-axis", className)}
      data-orientation={orientation}
      aria-hidden
    >
      {line ? (
        <line
          className="lac-chart-axis-line"
          x1={vertical ? axisX : plot.x0}
          x2={vertical ? axisX : plot.x1}
          y1={vertical ? plot.y0 : axisY}
          y2={vertical ? plot.y1 : axisY}
        />
      ) : null}
      {ticks.map((tick, i) => {
        const x = vertical ? axisX + (orientation === "left" ? -8 : 8) : tick.position;
        const y = vertical ? tick.position : axisY + (orientation === "top" ? -8 : 17);
        return (
          <text
            key={i}
            className="lac-chart-axis-label"
            x={x}
            y={y}
            textAnchor={vertical ? anchor : labelAngle ? "end" : "middle"}
            dominantBaseline={vertical ? "middle" : "auto"}
            transform={labelAngle ? `rotate(${labelAngle} ${x} ${y})` : undefined}
          >
            {tick.label}
          </text>
        );
      })}
    </g>
  );
});

/* ==========================================================================
   Legend
   ========================================================================== */

/** One legend entry. */
export interface LegendItem {
  label: string;
  color: string;
  /** Optional value shown after the label — a total, a share. */
  value?: string;
  /** Render the swatch muted, for a series that is currently hidden. */
  muted?: boolean;
}

export interface ChartLegendProps extends Omit<HTMLAttributes<HTMLUListElement>, "onSelect"> {
  items: LegendItem[];
  /** Lay the entries out in a column instead of a row. */
  vertical?: boolean;
  /** Makes each entry a button — for toggling series on and off. */
  onSelect?: (index: number, item: LegendItem) => void;
}

/**
 * The key. Plain HTML rather than SVG `<text>`, so it wraps, selects and
 * zooms like the rest of the page.
 */
export const ChartLegend = forwardRef<HTMLUListElement, ChartLegendProps>(function ChartLegend(
  { items, vertical = false, onSelect, className, ...rest },
  ref,
) {
  return (
    <ul
      {...rest}
      ref={ref}
      className={classes("lac-chart-legend", className)}
      data-vertical={vertical || undefined}
    >
      {items.map((item, i) => {
        const content = (
          <>
            <span className="lac-chart-legend-swatch" style={{ background: item.color }} aria-hidden />
            <span className="lac-chart-legend-label">{item.label}</span>
            {item.value === undefined ? null : (
              <span className="lac-chart-legend-value">{item.value}</span>
            )}
          </>
        );
        return (
          <li key={i} className="lac-chart-legend-item" data-muted={item.muted || undefined}>
            {onSelect ? (
              <button
                type="button"
                className="lac-chart-legend-btn"
                aria-pressed={!item.muted}
                onClick={() => onSelect(i, item)}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
});

/* ==========================================================================
   Tooltip
   ========================================================================== */

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export interface ChartTooltipProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Anchor x, in viewBox units. */
  x: number;
  /** Anchor y, in viewBox units. */
  y: number;
  /** The chart's viewBox width, so the anchor can be expressed as a percentage. */
  width: number;
  /** The chart's viewBox height. */
  height: number;
  /** Heading — the category, the date. */
  title?: ReactNode;
  /** One row per series. */
  rows?: TooltipRow[];
}

/**
 * The hover card.
 *
 * Positioned in percentages of the chart box, so it follows the data whether
 * the chart is fixed-size or responsive, and flips to the left half when the
 * anchor is past the middle so it never hangs off the edge.
 */
export const ChartTooltip = forwardRef<HTMLDivElement, ChartTooltipProps>(function ChartTooltip(
  { x, y, width, height, title, rows = [], className, style, children, ...rest },
  ref,
) {
  const left = width === 0 ? 0 : (x / width) * 100;
  const top = height === 0 ? 0 : (y / height) * 100;
  const flip = left > 60;
  const placement: CSSProperties = {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(${flip ? "-100%" : "0"}, -100%) translate(${flip ? "-10px" : "10px"}, -10px)`,
  };
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-chart-tip", className)}
      role="tooltip"
      aria-hidden
      style={{ ...placement, ...style }}
    >
      {title === undefined ? null : <div className="lac-chart-tip-title">{title}</div>}
      {rows.map((row, i) => (
        <div key={i} className="lac-chart-tip-row">
          {row.color ? (
            <span className="lac-chart-tip-swatch" style={{ background: row.color }} aria-hidden />
          ) : null}
          <span className="lac-chart-tip-label">{row.label}</span>
          <span className="lac-chart-tip-value">{row.value}</span>
        </div>
      ))}
      {children}
    </div>
  );
});

/* ==========================================================================
   Screen-reader data table
   ========================================================================== */

export interface ChartDataTableProps extends HTMLAttributes<HTMLDivElement> {
  /** What the table is — usually the same sentence as the chart's aria-label. */
  caption: string;
  /** Column headers, excluding the leading row-header column. */
  columns: string[];
  /** One entry per row: its header, then one cell per column. */
  rows: Array<{ header: string; cells: Array<string | number> }>;
}

/**
 * The data behind the picture, as a real table, hidden visually but not from
 * assistive technology. Opt in with `dataTable` on any chart.
 */
export const ChartDataTable = forwardRef<HTMLDivElement, ChartDataTableProps>(
  function ChartDataTable({ caption, columns, rows, className, ...rest }, ref) {
    return (
      <div {...rest} ref={ref} className={classes("lac-chart-sr", className)}>
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{" "}</th>
              {columns.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <th scope="row">{row.header}</th>
                {row.cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
);
