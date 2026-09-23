/**
 * @lacspace/charts — a dependency-free React chart library that draws real SVG.
 *
 * Bring the stylesheet in once, anywhere in your app:
 *   import "@lacspace/charts/styles.css";
 * then restyle every chart by redefining the --lac-* variables in your own CSS.
 * They are the same tokens @lacspace/components uses, so the two packages share
 * one theme.
 */

/* Utilities ---------------------------------------------------------------- */
export { cx, classes, clamp, percent, useStableId } from "./util.js";
export type { Size, Tone } from "./util.js";

export { LacspaceChartStyles, chartsCss } from "./styles-inject.js";

/* Scales, geometry and formatting — every chart's maths, as pure functions -- */
export {
  // numbers
  extent,
  padDegenerate,
  niceNum,
  niceTicks,
  niceDomain,
  roundToStep,
  sum,
  // scales + layout
  linearScale,
  bandScale,
  plotArea,
  DEFAULT_MARGIN,
  // series
  stackSeries,
  stackExtent,
  // paths
  linePath,
  smoothPath,
  areaPath,
  polygonPath,
  roundedBarPath,
  // arcs
  polarPoint,
  arcPath,
  pieSlices,
  gaugeAngle,
  // colour
  DEFAULT_PALETTE,
  colorAt,
  parseHex,
  mixColor,
  heatColor,
  // formatting
  formatNumber,
  formatPercent,
  describeSeries,
  // hit testing
  nearestPoint,
  // chart-specific
  ohlcExtent,
  candleDirection,
  funnelStages,
  calendarCells,
} from "./scale.js";
export type {
  Point,
  LinearScale,
  BandScale,
  Margin,
  Plot,
  StackBand,
  Slice,
  Hit,
  Candle,
  FunnelStage,
  CalendarCell,
} from "./scale.js";

/* Shared pieces ------------------------------------------------------------ */
export { ChartFrame, ChartGrid, ChartAxis, ChartLegend, ChartTooltip, ChartDataTable } from "./primitives.js";
export type {
  Series,
  ChartBaseProps,
  ChartFrameProps,
  ChartGridProps,
  ChartAxisProps,
  AxisTick,
  ChartLegendProps,
  LegendItem,
  ChartTooltipProps,
  TooltipRow,
  ChartDataTableProps,
} from "./primitives.js";

/* Line + area -------------------------------------------------------------- */
export { LineChart, AreaChart } from "./line.js";
export type { CartesianChartProps, AreaChartProps } from "./line.js";

/* Bars --------------------------------------------------------------------- */
export { BarChart } from "./bar.js";
export type { BarChartProps } from "./bar.js";

/* Pie + donut -------------------------------------------------------------- */
export { PieChart, DonutChart } from "./pie.js";
export type { PieChartProps, DonutChartProps, PieDatum } from "./pie.js";

/* Sparklines --------------------------------------------------------------- */
export { Sparkline, SparkBars } from "./spark.js";
export type { SparklineProps, SparkBarsProps } from "./spark.js";

/* Gauge -------------------------------------------------------------------- */
export { Gauge } from "./gauge.js";
export type { GaugeProps, GaugeBand } from "./gauge.js";

/* Heatmap ------------------------------------------------------------------ */
export { Heatmap } from "./heatmap.js";
export type { HeatmapProps } from "./heatmap.js";

/* Radar -------------------------------------------------------------------- */
export { RadarChart } from "./radar.js";
export type { RadarChartProps } from "./radar.js";

/* Funnel ------------------------------------------------------------------- */
export { FunnelChart } from "./funnel.js";
export type { FunnelChartProps, FunnelDatum } from "./funnel.js";

/* Candlestick -------------------------------------------------------------- */
export { CandlestickChart } from "./candlestick.js";
export type { CandlestickChartProps } from "./candlestick.js";
