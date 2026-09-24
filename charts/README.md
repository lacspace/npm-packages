<div align="center">

# @lacspace/charts

**Real SVG charts for React. No canvas, no D3, no chart engine, no dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/charts?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/charts)
[![install size](https://packagephobia.com/badge?p=@lacspace/charts)](https://packagephobia.com/result?p=@lacspace/charts)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/charts?label=minzip)](https://bundlephobia.com/package/@lacspace/charts)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/charts)
[![license](https://img.shields.io/npm/l/@lacspace/charts?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

### 1.1.0 — every chart renders empty without data instead of crashing

`AreaChart`, `LineChart`, `BarChart`, `RadarChart`, `CandlestickChart`,
`PieChart`, `DonutChart`, `SparkBars`, `Sparkline`, `FunnelChart`,
`ChartLegend` and `ChartDataTable` threw `Cannot read properties of undefined`
when `series` / `data` / `stages` / `items` was omitted — which is exactly the
state a dashboard is in while its data loads. They now render an empty chart.
`ChartAxis` with no `plot` geometry renders nothing rather than throwing on
`plot.x1`. The props stay required in the types.

> Line, area, bar, donut, sparkline, gauge, heatmap, radar, funnel and candlestick — **every mark is an element you can style, every scale is a pure function you can test**. React is the only peer dependency. Server-render safe, themed by the same `--lac-*` variables as [`@lacspace/components`](https://www.npmjs.com/package/@lacspace/components), and accessible by construction.

## Install

```bash
npm i @lacspace/charts
```

```tsx
import "@lacspace/charts/styles.css";
import { LineChart } from "@lacspace/charts";

export function Traffic() {
  return (
    <LineChart
      labels={["Mon", "Tue", "Wed", "Thu", "Fri"]}
      series={[
        { name: "Visits", data: [1200, 1640, 1480, 2100, 2460] },
        { name: "Signups", data: [90, 140, 120, 190, 260], dashed: true },
      ]}
      curve
      dots
      tooltip
      responsive
      dataTable
    />
  );
}
```

The package ships `"use client"`, so you can import it straight into a Server Component.

## Why this one

- **No chart engine.** The whole library is `<path>`, `<rect>`, `<circle>` and `<text>`. Open devtools and every mark is right there, with a class and a `data-*` you can style.
- **The maths is exported.** Scales, ticks, stacking, path strings, arc geometry and hit-testing are pure functions — no React, no DOM. Draw your own SVG with them, or test them in your own suite.
- **Server-render safe.** Nothing touches `window` or measures the DOM during render. Charts appear in the first HTML response, not after a hydration flash.
- **Accessible on purpose.** Every chart is one `role="img"` with a sentence-long generated `aria-label`, plus an opt-in visually hidden `<table>` of the real numbers.
- **Themed by variables.** All chart text and every grid line reads from `--lac-*` tokens, so light and dark just work. Series colours come from an accessible eight-hue palette you can replace.
- **Nothing clips.** The viewBox reserves room for the outermost axis labels, and every drawn shape gets an explicit `fill`.

## Every chart

Props below are per chart. **All of them** also take the shared props in [Common props](#common-props).

### LineChart

```tsx
<LineChart labels={months} series={[{ name: "MRR", data: mrr, area: true }]} curve dots tooltip />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `series` | `Series[]` | — | `{ name?, data, color?, dashed?, area? }` per line |
| `labels` | `string[]` | `[]` | Category labels along the x axis |
| `curve` | `boolean` | `false` | Smooth the line — still passes through every point |
| `dots` | `boolean` | `false` | Draw a dot on each value |
| `strokeWidth` | `number` | `2` | Line thickness in viewBox units |
| `yTicks` | `number` | `5` | Roughly how many y ticks to aim for |
| `yDomain` | `[number, number]` | auto | Pin the y axis |
| `grid` | `boolean` | `true` | Background rules |
| `legend` | `boolean` | auto | Shown when any series is named |
| `tooltip` | `boolean` | `false` | Hover card with nearest-point detection |
| `labelEvery` | `number` | `1` | Show every nth category label |
| `formatValue` | `(n: number) => string` | compact | Axis and tooltip numbers |

Non-finite values (`NaN`) are skipped, not drawn as zero.

### AreaChart

```tsx
<AreaChart labels={months} series={channels} stacked />
```

Everything `LineChart` takes, plus:

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `stacked` | `boolean` | `false` | Stack the series instead of overlapping them |
| `fillOpacity` | `number` | `0.85` stacked / `0.28` overlapping | Fill strength |

Stacked answers "what makes up the total"; overlapping answers "how do these compare".

### BarChart

```tsx
<BarChart labels={quarters} series={[y2025, y2026]} />
<BarChart labels={pages} series={[views]} orientation="horizontal" valueLabels />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `series` | `Series[]` | — | Two or more are grouped, or stacked |
| `labels` | `string[]` | `[]` | One per bar group |
| `orientation` | `"vertical" \| "horizontal"` | `"vertical"` | Columns, or a ranked list |
| `stacked` | `boolean` | `false` | Stack instead of grouping |
| `radius` | `number` | `4` | Rounded cap — on the cap end only |
| `gap` | `number` | `0.28` | Gap between groups, as a fraction of the slot |
| `valueLabels` | `boolean` | `false` | Print the value on each bar |
| `valueDomain` / `valueTicks` | `[number, number]` / `number` | auto / `5` | The value axis |
| `grid`, `legend`, `tooltip`, `formatValue` | | | as `LineChart` |

Negative values stack away from zero independently, so losses draw below the axis.

### PieChart · DonutChart

```tsx
<PieChart data={[{ label: "Direct", value: 62 }, { label: "Search", value: 38 }]} sliceLabels />
<DonutChart data={sources} center={<><strong>1,248</strong><span>orders</span></>} tooltip />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `data` | `PieDatum[]` | — | `{ label, value, color? }` |
| `innerRadius` | `number` | `0` (pie) / `0.62` (donut) | Hole size, as a fraction of the radius |
| `padAngle` | `number` | `0.6` | Gap between slices, in degrees |
| `startAngle` | `number` | `0` | Where the first slice starts |
| `center` | `ReactNode` | — | The centre slot — a total, a delta, an icon |
| `sliceLabels` | `boolean` | `false` | Percentage on slices big enough to hold one |
| `legend` / `legendValues` | `boolean` | `true` / `true` | The key, with each slice's share |
| `tooltip`, `formatValue` | | | as above |

A single 100% slice draws as a real closed ring; zero-value slices draw nothing.

### Sparkline · SparkBars

```tsx
<Sparkline data={last30} area lastDot responsive />
<SparkBars data={weekly} highlightLast negativeColor="#dc2626" />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `data` | `number[]` | — | The numbers |
| `color` | `string` | palette `0` | Line or bar colour |
| `domain` | `[number, number]` | auto | Pin the range to compare sparklines |
| `area` / `curve` / `lastDot` | `boolean` | `false` | Sparkline only |
| `gap` / `radius` / `highlightLast` / `negativeColor` | | `0.3` / `1.5` / `false` / — | SparkBars only |

No axes, no labels — they are sized by the parent (`responsive`) and meant to sit beside the number they describe. `SparkBars` hangs negatives below a zero baseline.

### Gauge

```tsx
<Gauge
  value={72}
  caption="CPU"
  bands={[
    { from: 0, to: 60, color: "#16a34a", label: "healthy" },
    { from: 60, to: 85, color: "#f59e0b", label: "busy" },
    { from: 85, to: 100, color: "#ef4444", label: "critical" },
  ]}
/>
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `number` | — | The reading, clamped into range |
| `min` / `max` | `number` | `0` / `100` | The scale |
| `bands` | `GaugeBand[]` | — | `{ from, to, color, label? }` thresholds |
| `variant` | `"fill" \| "needle"` | `"fill"` | Sweep the arc, or point at it |
| `startAngle` / `endAngle` | `number` | `-120` / `120` | The sweep |
| `thickness` | `number` | `0.22` | Arc thickness, as a fraction of the radius |
| `center` / `caption` | `ReactNode` / `string` | value / — | The big number, and its label |
| `endLabels` | `boolean` | `true` | Print `min` and `max` at the arc's ends |

The active band's colour drives the fill, and its `label` goes into the accessible summary.

### Heatmap

```tsx
<Heatmap rows={weekdays} columns={hours} data={matrix} tooltip />
<Heatmap variant="calendar" values={[{ date: "2026-03-14", value: 5 }]} />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `variant` | `"matrix" \| "calendar"` | `"matrix"` | Labelled grid, or a contribution-graph year |
| `data` / `rows` / `columns` | `number[][]` / `string[]` / `string[]` | `[]` | Matrix mode |
| `values` | `{ date, value }[]` | `[]` | Calendar mode, any order, `YYYY-MM-DD` |
| `cellSize` / `cellGap` / `radius` | `number` | per variant | Cell geometry |
| `from` / `to` | `string` | `#e6f0ff` / `#1d4ed8` | Ends of the colour ramp |
| `domain` | `[number, number]` | auto | Pin the colour scale |
| `legend` | `boolean` | `true` | The "less → more" ramp |

Dates are parsed as UTC, so the calendar grid does not shift a column by timezone.

### RadarChart

```tsx
<RadarChart axes={["Speed", "Safety", "Cost", "DX"]} series={[us, them]} />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `axes` | `string[]` | — | One label per spoke, clockwise from the top |
| `series` | `Series[]` | — | `data[i]` belongs to `axes[i]` |
| `rings` | `number` | `4` | Grid rings |
| `minValue` / `maxValue` | `number` | `0` / auto | The scale — the floor stays at zero unless you move it |
| `circular` | `boolean` | `false` | Circular rings instead of polygons |
| `dots` / `fillOpacity` / `ringLabels` | | `true` / `0.22` / `false` | Shape detail |

### FunnelChart

```tsx
<FunnelChart stages={[
  { label: "Visited", value: 12400 },
  { label: "Signed up", value: 3100 },
  { label: "Paid", value: 210 },
]} />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `stages` | `FunnelDatum[]` | — | `{ label, value, color? }`, widest first |
| `variant` | `"trapezoid" \| "bar"` | `"trapezoid"` | Taper between stages, or flat rows |
| `conversion` | `boolean` | `true` | "x% of previous" beside each stage |
| `showShare` | `boolean` | `true` | Share of the first stage, on the stage |
| `gap` | `number` | `6` | Space between stages |

Width is proportional to the share of the **first** stage; the conversion figure is measured against the **previous** one.

### CandlestickChart

```tsx
<CandlestickChart data={ohlc} tooltip labelEvery={5} />
```

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `data` | `Candle[]` | — | `{ label?, open, high, low, close }`, oldest first |
| `upColor` / `downColor` | `string` | `#16a34a` / `#dc2626` | Body colours |
| `wickWidth` / `gap` | `number` | `1.5` / `0.32` | Candle geometry |
| `priceTicks` / `labelEvery` | `number` | `5` / `1` | Axis density |

The price axis folds in opens and closes as well as highs and lows, so a bad feed cannot clip a candle. A doji still draws a hairline body.

## Common props

Every chart accepts these, plus any `<div>` attribute (`id`, `onClick`, `data-*`, …).

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `width` / `height` | `number` | per chart | viewBox units — the shape, not a pixel commitment |
| `responsive` | `boolean` | `false` | Fill the parent's width, keeping that aspect ratio |
| `colors` | `string[]` | built-in palette | Series colours, cycled |
| `label` | `string` | generated | The `aria-label`. One is written from your data if you leave it out |
| `dataTable` | `boolean` | `false` | Also render a visually hidden `<table>` of the numbers |
| `margin` | `Partial<Margin>` | `{ top: 12, right: 16, bottom: 26, left: 44 }` | Room reserved for axis labels |
| `className` / `style` | | | Yours lands last and wins — no `!important` needed |

## Shared pieces

Build your own chart out of the same parts:

```tsx
import { ChartFrame, ChartGrid, ChartAxis, ChartLegend, ChartTooltip, ChartDataTable } from "@lacspace/charts";
```

| | |
| --- | --- |
| `ChartFrame` | The `role="img"` SVG, the tooltip/legend/table slots, and pointer coordinates already converted into viewBox units |
| `ChartGrid` | Horizontal and vertical rules, plus an optional heavier zero baseline |
| `ChartAxis` | Ticks and labels on any edge, placed inside the reserved margin |
| `ChartLegend` | The key, as real HTML — optionally buttons, for toggling series |
| `ChartTooltip` | A hover card positioned in percentages, flipping side near the edge |
| `ChartDataTable` | The visually hidden `<table>` behind `dataTable` |

## Pure helpers

Every number the charts draw comes from one of these. No React, no DOM — import them to draw your own SVG, or to test your own dashboard maths.

```ts
import {
  extent, padDegenerate, niceNum, niceTicks, niceDomain, roundToStep, sum,
  linearScale, bandScale, plotArea, DEFAULT_MARGIN,
  stackSeries, stackExtent,
  linePath, smoothPath, areaPath, polygonPath, roundedBarPath,
  polarPoint, arcPath, pieSlices, gaugeAngle,
  DEFAULT_PALETTE, colorAt, parseHex, mixColor, heatColor,
  formatNumber, formatPercent, describeSeries,
  nearestPoint, ohlcExtent, candleDirection, funnelStages, calendarCells,
} from "@lacspace/charts";

niceTicks(0, 95, 5);                       // [0, 20, 40, 60, 80, 100]
niceTicks(5, 5);                           // brackets a single point instead of one tick
linearScale([0, 10], [200, 0]).invert(100) // 5  — y axes run downwards
bandScale(4, [0, 400], 0.2).center(0);     // 50
stackSeries([[5], [-3], [2]]);             // [[[0,5]], [[0,-3]], [[5,7]]] — losses stack downwards
arcPath(50, 50, 40, 20, 0, 360);           // a real closed ring, not an empty circle
pieSlices([1, 1, 2]).map((s) => s.fraction); // [0.25, 0.25, 0.5]
nearestPoint(points, pointerX);            // x-only match, so flat series stay hoverable
formatNumber(1_500);                       // "1.5K"
formatPercent(0.4212, 1);                  // "42.1%"
```

| | |
| --- | --- |
| `extent` · `padDegenerate` · `sum` | data range, widened when min equals max |
| `niceNum` · `niceTicks` · `niceDomain` · `roundToStep` | readable axis ticks — handles equal min/max, negative ranges and a single point |
| `linearScale` · `bandScale` · `plotArea` | value↔pixel, categorical slots, and the plot rectangle inside the margins |
| `stackSeries` · `stackExtent` | cumulative bands, positives and negatives stacked separately |
| `linePath` · `smoothPath` · `areaPath` · `polygonPath` · `roundedBarPath` | SVG `d` strings |
| `polarPoint` · `arcPath` · `pieSlices` · `gaugeAngle` | arc maths, including the 0%, 100% and single-slice cases |
| `DEFAULT_PALETTE` · `colorAt` · `parseHex` · `mixColor` · `heatColor` | palette cycling and ramp interpolation |
| `formatNumber` · `formatPercent` · `describeSeries` | compact numbers, percentages, and the generated `aria-label` |
| `nearestPoint` | tooltip hit-testing, on `x` alone or in two dimensions |
| `ohlcExtent` · `candleDirection` · `funnelStages` · `calendarCells` | the chart-specific maths |

## Theming

Charts read the same `--lac-*` tokens as `@lacspace/components`, and this package never redefines them. Load both and your theme is already applied; load this one alone and every variable falls back to a sensible default.

```css
:root {
  --lac-accent: #7c3aed;     /* first palette hue is independent — see `colors` */
  --lac-fg-muted: #64748b;   /* all axis and legend text */
  --lac-border: #e2e8f0;     /* grid lines */
  --lac-surface-raised: #fff;/* tooltip background */
  --lac-radius: 12px;        /* tooltip corners */
  --lac-font: "Inter", system-ui, sans-serif;
}
```

Scope them to restyle one dashboard instead of the whole app:

```css
.report { --lac-border: #f1f5f9; --lac-text-xs: 11px; }
```

Series colours are data, not theme, so they are a prop:

```tsx
<BarChart colors={["#0f766e", "#f59e0b", "#7c3aed"]} series={series} labels={labels} />
```

Every mark has a class and `data-*` attributes, so your own CSS can reach any of them:

```css
.lac-chart-bar-shape[data-series="1"] { fill-opacity: 0.7; }
.lac-chart-grid-line { stroke-dasharray: 3 4; }
```

### If you cannot import CSS

```tsx
import { LacspaceChartStyles } from "@lacspace/charts";

<LacspaceChartStyles />; // injects once, no-op if already present
```

## Accessibility

- One `role="img"` per chart with a generated `aria-label` — *"Line chart. Visits: 5 points from 1.2K to 2.5K, ending at 2.5K."* Override it with `label`.
- `dataTable` adds a real, visually hidden `<table>`: row headers per series, column headers per category.
- Grids, axes and hover decorations are `aria-hidden` — a screen reader walking 200 `<rect>`s learns nothing.
- All text colour comes from theme tokens, so contrast holds in light and dark.
- Transitions respect `prefers-reduced-motion`.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/charts` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/charts
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
