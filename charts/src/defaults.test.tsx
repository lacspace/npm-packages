import { test, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import { AreaChart, LineChart, BarChart, RadarChart, CandlestickChart, PieChart, DonutChart, SparkBars, Sparkline, FunnelChart, ChartLegend, ChartDataTable, ChartAxis } from "./index";

// Every data-driven component used to crash with `Cannot read properties of
// undefined (reading 'map')` when its collection prop was omitted. A missing
// collection now renders an empty component — the type still requires the
// prop, so TypeScript users are told; JavaScript users are no longer crashed.
const render = (C: unknown) => renderToString(React.createElement(C as React.ComponentType));

test("AreaChart renders without its collection prop", () => {
  expect(() => render(AreaChart)).not.toThrow();
});

test("LineChart renders without its collection prop", () => {
  expect(() => render(LineChart)).not.toThrow();
});

test("BarChart renders without its collection prop", () => {
  expect(() => render(BarChart)).not.toThrow();
});

test("RadarChart renders without its collection prop", () => {
  expect(() => render(RadarChart)).not.toThrow();
});

test("CandlestickChart renders without its collection prop", () => {
  expect(() => render(CandlestickChart)).not.toThrow();
});

test("PieChart renders without its collection prop", () => {
  expect(() => render(PieChart)).not.toThrow();
});

test("DonutChart renders without its collection prop", () => {
  expect(() => render(DonutChart)).not.toThrow();
});

test("SparkBars renders without its collection prop", () => {
  expect(() => render(SparkBars)).not.toThrow();
});

test("Sparkline renders without its collection prop", () => {
  expect(() => render(Sparkline)).not.toThrow();
});

test("FunnelChart renders without its collection prop", () => {
  expect(() => render(FunnelChart)).not.toThrow();
});

test("ChartLegend renders without its collection prop", () => {
  expect(() => render(ChartLegend)).not.toThrow();
});

test("ChartDataTable renders without its collection prop", () => {
  expect(() => render(ChartDataTable)).not.toThrow();
});

test("ChartAxis renders without its collection prop", () => {
  expect(() => render(ChartAxis)).not.toThrow();
  // No plot geometry means nothing to draw, not a throw on `plot.x1`.
  expect(render(ChartAxis)).toBe("");
});

