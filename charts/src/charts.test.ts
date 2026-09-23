import { describe, it, expect } from "vitest";
import {
  arcPath,
  areaPath,
  bandScale,
  calendarCells,
  candleDirection,
  colorAt,
  DEFAULT_PALETTE,
  describeSeries,
  extent,
  formatNumber,
  formatPercent,
  funnelStages,
  gaugeAngle,
  heatColor,
  linearScale,
  linePath,
  mixColor,
  nearestPoint,
  niceDomain,
  niceNum,
  niceTicks,
  ohlcExtent,
  padDegenerate,
  parseHex,
  pieSlices,
  plotArea,
  polarPoint,
  polygonPath,
  roundedBarPath,
  roundToStep,
  smoothPath,
  stackExtent,
  stackSeries,
  sum,
} from "./scale.js";
import { clamp, cx, classes, percent } from "./util.js";

describe("extent and degenerate domains", () => {
  it("falls back to 0..1 when there is nothing finite to measure", () => {
    expect(extent([])).toEqual([0, 1]);
    expect(extent([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([0, 1]);
  });

  it("ignores holes in the data when finding the range", () => {
    expect(extent([3, Number.NaN, 1, 7])).toEqual([1, 7]);
  });

  it("widens a domain whose ends are equal so a single point is not drawn on the floor", () => {
    expect(padDegenerate(5, 5)).toEqual([2.5, 7.5]);
    expect(padDegenerate(0, 0)).toEqual([-1, 1]);
    expect(padDegenerate(1, 3)).toEqual([1, 3]);
  });
});

describe("nice ticks", () => {
  it("rounds a span up to a 1/2/5/10 multiple", () => {
    expect(niceNum(95, false)).toBe(100);
    expect(niceNum(25, true)).toBe(20);
  });

  it("gives round numbers across a plain positive range", () => {
    expect(niceTicks(0, 95, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("brackets a single data point instead of returning one tick", () => {
    const ticks = niceTicks(5, 5, 5);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks[0]).toBeLessThanOrEqual(5);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(5);
  });

  it("puts a tick on zero when the data is all zero", () => {
    expect(niceTicks(0, 0)).toContain(0);
  });

  it("handles a wholly negative range without flipping it", () => {
    const ticks = niceTicks(-50, -10, 5);
    expect(ticks[0]).toBe(-50);
    expect(ticks[ticks.length - 1]).toBe(-10);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("crosses zero cleanly when the data spans both signs", () => {
    expect(niceTicks(-30, 60, 4)).toContain(0);
  });

  it("strips binary float noise from the tick values", () => {
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("reports the domain the ticks actually cover", () => {
    expect(niceDomain(3, 97, 5)).toEqual([0, 100]);
  });
});

describe("linear scale", () => {
  it("maps a value through the range and back again", () => {
    const s = linearScale([0, 100], [0, 200]);
    expect(s.scale(50)).toBe(100);
    expect(s.invert(100)).toBe(50);
  });

  it("inverts for a y axis, where the range runs downwards", () => {
    const y = linearScale([0, 10], [200, 0]);
    expect(y.scale(0)).toBe(200);
    expect(y.scale(10)).toBe(0);
    expect(y.invert(100)).toBe(5);
  });

  it("centres the value when the domain has no width", () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(s.scale(5)).toBe(50);
  });
});

describe("band scale", () => {
  it("splits the range into padded slots", () => {
    const b = bandScale(4, [0, 400], 0.2);
    expect(b.step).toBe(100);
    expect(b.bandwidth).toBe(80);
    expect(b.at(0)).toBe(10);
    expect(b.center(0)).toBe(50);
    expect(b.center(3)).toBe(350);
  });

  it("keeps the cells touching when padding is zero", () => {
    const b = bandScale(5, [0, 100], 0);
    expect(b.bandwidth).toBe(20);
    expect(b.at(1)).toBe(20);
  });

  it("clamps a pixel outside the range to the first or last band", () => {
    const b = bandScale(4, [0, 400], 0.2);
    expect(b.indexAt(150)).toBe(1);
    expect(b.indexAt(-40)).toBe(0);
    expect(b.indexAt(9999)).toBe(3);
  });
});

describe("plot area", () => {
  it("leaves room for the axis labels inside the viewBox", () => {
    const p = plotArea(300, 200);
    expect(p.width).toBe(240);
    expect(p.height).toBe(162);
    expect(p.x1).toBe(284);
    expect(p.y1).toBe(174);
  });

  it("never returns a negative plot for a tiny chart", () => {
    const p = plotArea(10, 10);
    expect(p.width).toBe(0);
    expect(p.height).toBe(0);
  });
});

describe("stacking", () => {
  it("stacks series into cumulative bands", () => {
    expect(stackSeries([[1, 2], [3, 4]])).toEqual([
      [[0, 1], [0, 2]],
      [[1, 4], [2, 6]],
    ]);
  });

  it("stacks losses below the axis instead of cancelling the gains", () => {
    expect(stackSeries([[5], [-3], [2]])).toEqual([[[0, 5]], [[0, -3]], [[5, 7]]]);
  });

  it("treats a gap in the data as zero so the stack above it does not move", () => {
    expect(stackSeries([[Number.NaN, 2], [1, 1]])).toEqual([
      [[0, 0], [0, 2]],
      [[0, 1], [2, 3]],
    ]);
  });

  it("includes the zero baseline in a stacked chart's extent", () => {
    expect(stackExtent([[1, 2], [3, 4]])).toEqual([0, 6]);
    expect(sum([1, Number.NaN, 2])).toBe(3);
  });
});

describe("paths", () => {
  it("draws a polyline through every point", () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe("M0 0 L10 20");
    expect(linePath([])).toBe("");
  });

  it("falls back to straight lines when there is nothing to smooth", () => {
    const two = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(smoothPath(two)).toBe(linePath(two));
  });

  it("smooths with cubic curves that still start on the first point", () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 0 }]);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d).toContain(" C");
    expect(d).toContain("20 0");
  });

  it("closes an area down to the baseline", () => {
    const d = areaPath([{ x: 0, y: 10 }, { x: 10, y: 4 }], 50);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("L10 50");
    expect(d).toContain("L0 50");
  });

  it("closes a polygon for radar and funnel shapes", () => {
    expect(polygonPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 4 }])).toBe(
      "M0 0 L4 0 L2 4 Z",
    );
    expect(polygonPath([])).toBe("");
  });

  it("rounds only the cap end of a bar, and never more than half its width", () => {
    const square = roundedBarPath(0, 0, 10, 40, 0, "top");
    expect(square).toBe("M0 0 h10 v40 h-10 Z");
    const rounded = roundedBarPath(0, 0, 10, 40, 999, "top");
    expect(rounded).toContain("Q");
    expect(rounded).toContain("M0 40");
  });
});

describe("arcs", () => {
  it("places 0 degrees at twelve o'clock and runs clockwise", () => {
    const top = polarPoint(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polarPoint(100, 100, 50, 90);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
  });

  it("draws nothing for a zero-length slice rather than a hairline", () => {
    expect(arcPath(50, 50, 40, 20, 90, 90)).toBe("");
  });

  it("draws a full ring as two arcs so a 100% donut is not empty", () => {
    const d = arcPath(50, 50, 40, 20, 0, 360);
    expect(d).not.toBe("");
    expect(d.match(/A/g)?.length).toBe(4);
    expect(d.match(/M/g)?.length).toBe(2);
  });

  it("draws a full pie with no hole as a single closed circle", () => {
    const d = arcPath(50, 50, 40, 0, 0, 360);
    expect(d.match(/M/g)?.length).toBe(1);
    expect(d).toContain("A40 40");
  });

  it("draws a pie wedge from the centre and a donut segment from the rim", () => {
    expect(arcPath(50, 50, 40, 0, 0, 90).startsWith("M50 50")).toBe(true);
    expect(arcPath(50, 50, 40, 20, 0, 90).startsWith("M50 10")).toBe(true);
  });

  it("sets the large-arc flag past half a turn", () => {
    expect(arcPath(50, 50, 40, 0, 0, 200)).toContain("0 1 1");
    expect(arcPath(50, 50, 40, 0, 0, 100)).toContain("0 0 1");
  });
});

describe("pie slices", () => {
  it("turns values into fractions that fill the circle exactly once", () => {
    const slices = pieSlices([1, 1, 2]);
    expect(slices.map((s) => s.fraction)).toEqual([0.25, 0.25, 0.5]);
    expect(slices[2]?.endAngle).toBe(360);
  });

  it("gives a single value the whole circle", () => {
    const [only] = pieSlices([7]);
    expect(only?.fraction).toBe(1);
    expect(only?.startAngle).toBe(0);
    expect(only?.endAngle).toBe(360);
  });

  it("collapses to nothing when every value is zero", () => {
    const slices = pieSlices([0, 0]);
    expect(slices.every((s) => s.fraction === 0)).toBe(true);
    expect(arcPath(50, 50, 40, 20, slices[0]?.startAngle ?? 0, slices[0]?.endAngle ?? 0)).toBe("");
  });

  it("drops negative and non-finite values instead of drawing them backwards", () => {
    const slices = pieSlices([10, -10, Number.NaN]);
    expect(slices[0]?.fraction).toBe(1);
    expect(slices[1]?.fraction).toBe(0);
  });

  it("hangs a label off the middle of each slice", () => {
    const slices = pieSlices([1, 1]);
    expect(slices[0]?.midAngle).toBe(90);
    expect(slices[1]?.midAngle).toBe(270);
  });
});

describe("gauge", () => {
  it("points the needle at the middle of the sweep for a mid-range value", () => {
    expect(gaugeAngle(50, 0, 100, -120, 120)).toBe(0);
  });

  it("clamps a value outside the range to the ends of the arc", () => {
    expect(gaugeAngle(-5, 0, 100, -120, 120)).toBe(-120);
    expect(gaugeAngle(200, 0, 100, -120, 120)).toBe(120);
  });

  it("parks the needle at the start when min and max are equal", () => {
    expect(gaugeAngle(3, 3, 3, -90, 90)).toBe(-90);
  });
});

describe("colour", () => {
  it("cycles the palette so a ninth series still gets a colour", () => {
    expect(colorAt(0)).toBe(DEFAULT_PALETTE[0]);
    expect(colorAt(8)).toBe(colorAt(0));
    expect(colorAt(-1)).toBe(DEFAULT_PALETTE[DEFAULT_PALETTE.length - 1]);
  });

  it("uses the caller's palette and falls back when it is empty", () => {
    expect(colorAt(1, ["#111111", "#222222"])).toBe("#222222");
    expect(colorAt(2, ["#111111", "#222222"])).toBe("#111111");
    expect(colorAt(0, [])).toBe(DEFAULT_PALETTE[0]);
  });

  it("parses both hex shorthands and rejects anything else", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("4d9fff")).toEqual([77, 159, 255]);
    expect(parseHex("rebeccapurple")).toBeNull();
  });

  it("blends two colours for a heatmap ramp", () => {
    expect(mixColor("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColor("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(heatColor(5, 0, 10, "#000000", "#ffffff")).toBe("#808080");
  });

  it("paints every cell the top colour when the whole matrix is one value", () => {
    expect(heatColor(4, 4, 4, "#000000", "#ffffff")).toBe("#ffffff");
  });
});

describe("formatting", () => {
  it("prints a fraction as a percentage", () => {
    expect(formatPercent(0.4212)).toBe("42%");
    expect(formatPercent(0.4212, 1)).toBe("42.1%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("compacts large numbers and leaves small ones readable", () => {
    expect(formatNumber(1500)).toBe("1.5K");
    expect(formatNumber(1_000_000)).toBe("1M");
    expect(formatNumber(-2_400_000)).toBe("-2.4M");
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(3.14159)).toBe("3.14");
  });

  it("summarises the series for the chart's accessible name", () => {
    const label = describeSeries("Revenue", [{ name: "2026", data: [10, 40, 30] }]);
    expect(label).toContain("Revenue");
    expect(label).toContain("2026");
    expect(label).toContain("3 points");
    expect(label).toContain("ending at 30");
  });

  it("says so plainly when there is no data to describe", () => {
    expect(describeSeries("Revenue", [])).toBe("Revenue with no data");
  });
});

describe("nearest point", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 50 },
    { x: 20, y: 5 },
  ];

  it("matches on x alone so a flat series is still hoverable", () => {
    expect(nearestPoint(points, 11)?.index).toBe(1);
    expect(nearestPoint(points, 19)?.index).toBe(2);
  });

  it("uses real distance once a y is supplied", () => {
    expect(nearestPoint(points, 10, 0)?.index).toBe(0);
  });

  it("returns nothing when the pointer is too far away or there is no data", () => {
    expect(nearestPoint(points, 500, undefined, 50)).toBeNull();
    expect(nearestPoint([], 0)).toBeNull();
  });
});

describe("candlesticks", () => {
  it("covers opens and closes that fall outside the reported high and low", () => {
    expect(
      ohlcExtent([
        { open: 10, high: 12, low: 9, close: 13 },
        { open: 11, high: 14, low: 8, close: 9 },
      ]),
    ).toEqual([8, 14]);
  });

  it("has a usable range with no candles at all", () => {
    expect(ohlcExtent([])).toEqual([0, 1]);
  });

  it("calls a candle up, down or flat by its open and close", () => {
    expect(candleDirection({ open: 1, high: 2, low: 0, close: 2 })).toBe("up");
    expect(candleDirection({ open: 2, high: 2, low: 0, close: 1 })).toBe("down");
    expect(candleDirection({ open: 2, high: 2, low: 0, close: 2 })).toBe("flat");
  });
});

describe("funnel", () => {
  it("reports conversion against both the first and the previous stage", () => {
    const stages = funnelStages([
      { label: "Visits", value: 100 },
      { label: "Signups", value: 50 },
      { label: "Paid", value: 25 },
    ]);
    expect(stages.map((s) => s.ofFirst)).toEqual([1, 0.5, 0.25]);
    expect(stages.map((s) => s.ofPrevious)).toEqual([1, 0.5, 0.5]);
    expect(stages.map((s) => s.dropOff)).toEqual([0, 50, 25]);
  });

  it("does not divide by zero when a stage empties out", () => {
    const stages = funnelStages([
      { label: "Visits", value: 0 },
      { label: "Signups", value: 0 },
    ]);
    expect(stages[0]?.ofFirst).toBe(0);
    expect(stages[1]?.ofPrevious).toBe(0);
  });
});

describe("calendar heatmap", () => {
  it("lays dates out in week columns starting from the Sunday before the first", () => {
    const cells = calendarCells([
      { date: "2026-01-01", value: 3 },
      { date: "2026-01-05", value: 1 },
    ]);
    expect(cells[0]).toEqual({ date: "2026-01-01", value: 3, week: 0, day: 4 });
    expect(cells[1]).toEqual({ date: "2026-01-05", value: 1, week: 1, day: 1 });
  });

  it("sorts the input and drops dates it cannot parse", () => {
    const cells = calendarCells([
      { date: "2026-01-05", value: 1 },
      { date: "not-a-date", value: 9 },
      { date: "2026-01-01", value: 3 },
    ]);
    expect(cells.map((c) => c.date)).toEqual(["2026-01-01", "2026-01-05"]);
    expect(calendarCells([])).toEqual([]);
  });
});

describe("class and number helpers", () => {
  it("puts the caller's className last so their rules win", () => {
    expect(classes("lac-chart", "mt-4")).toBe("lac lac-chart mt-4");
    expect(cx("a", false, undefined, "b")).toBe("a b");
  });

  it("clamps values and refuses to trust a non-finite one", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
    expect(percent(25, 0, 50)).toBe(50);
  });
});
