import { test, expect } from "vitest";
import { metric, si, unit, distance, weight, temperature } from "./index";

test("metric SI prefixes (lowercase k, distinct from compact)", () => {
  expect(metric(1500)).toBe("1.5k");
  expect(metric(1000)).toBe("1k");
  expect(metric(2500000)).toBe("2.5M");
  expect(metric(-1500)).toBe("-1.5k");
  expect(metric(750)).toBe("750");
});

test("metric with a base unit adds a space", () => {
  expect(metric(1500, { unit: "m" })).toBe("1.5 km");
  expect(si(0.002, { unit: "s" })).toBe("2 ms");
});

test("unit pluralizes the unit word", () => {
  expect(unit(3, "meter")).toBe("3 meters");
  expect(unit(1, "meter")).toBe("1 meter");
  expect(unit(2, "city")).toBe("2 cities");
});

test("unit can keep a symbol un-pluralized + group large values", () => {
  expect(unit(5, "kg", { plural: false })).toBe("5 kg");
  expect(unit(12000, "file")).toBe("12,000 files");
});

test("distance + weight", () => {
  expect(distance(1500)).toBe("1.5 km");
  expect(weight(1500)).toBe("1.5 kg");
  expect(distance(500)).toBe("500 m");
});

test("temperature", () => {
  expect(temperature(20)).toBe("20°C");
  expect(temperature(68, "F")).toBe("68°F");
  expect(temperature(300, "K")).toBe("300 K");
});
