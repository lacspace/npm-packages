import { describe, it, expect } from "vitest";
import {
  resolveZone,
  rateForMethod,
  quoteShipping,
  cheapestQuote,
  freeShippingRemaining,
  ShippingError,
  type ShippingZone,
  type ShippingMethod,
} from "./index";

const zones: ShippingZone[] = [
  { id: "us", name: "United States", countries: ["US"] },
  { id: "ca-on", name: "Ontario", countries: ["CA"], regions: ["ON"] },
  { id: "row", name: "Rest of world", countries: ["GB", "DE"] },
];

describe("resolveZone", () => {
  it("matches by country (case-insensitive)", () => {
    expect(resolveZone({ country: "us" }, zones)?.id).toBe("us");
    expect(resolveZone({ country: "DE" }, zones)?.id).toBe("row");
  });

  it("prefers a region match over a country match", () => {
    // CA + ON should hit the region-specific zone, not the generic CA country.
    expect(resolveZone({ country: "CA", region: "on" }, zones)?.id).toBe("ca-on");
  });

  it("returns undefined for an unknown destination", () => {
    expect(resolveZone({ country: "JP" }, zones)).toBeUndefined();
    expect(resolveZone({}, zones)).toBeUndefined();
  });
});

describe("weight strategy bands", () => {
  const m: ShippingMethod = {
    id: "std",
    label: "Standard",
    strategy: "weight",
    bands: [
      { min: 0, max: 500, cost: 300 },
      { min: 501, max: 2000, cost: 600 },
      { min: 2001, cost: 1200 }, // open-ended top band
    ],
  };

  it("selects the correct band at min/max boundaries", () => {
    expect(rateForMethod(m, { weight: 0 }).cost).toBe(300); // min inclusive
    expect(rateForMethod(m, { weight: 500 }).cost).toBe(300); // max inclusive
    expect(rateForMethod(m, { weight: 501 }).cost).toBe(600); // next band min
    expect(rateForMethod(m, { weight: 2000 }).cost).toBe(600);
  });

  it("uses the open-ended top band for very heavy shipments", () => {
    expect(rateForMethod(m, { weight: 999999 }).cost).toBe(1200);
  });
});

describe("price & item strategies", () => {
  it("price strategy selects by subtotal", () => {
    const m: ShippingMethod = {
      id: "byprice",
      label: "By price",
      strategy: "price",
      bands: [
        { min: 0, max: 4999, cost: 500 },
        { min: 5000, cost: 250 },
      ],
    };
    expect(rateForMethod(m, { subtotal: 4999 }).cost).toBe(500);
    expect(rateForMethod(m, { subtotal: 5000 }).cost).toBe(250);
  });

  it("item strategy selects by item count", () => {
    const m: ShippingMethod = {
      id: "byitem",
      label: "By item",
      strategy: "item",
      bands: [
        { min: 1, max: 3, cost: 400 },
        { min: 4, cost: 700 },
      ],
    };
    expect(rateForMethod(m, { itemCount: 3 }).cost).toBe(400);
    expect(rateForMethod(m, { itemCount: 4 }).cost).toBe(700);
  });
});

describe("flat strategy", () => {
  it("returns flat + surcharge + handling", () => {
    const m: ShippingMethod = {
      id: "flat",
      label: "Flat",
      strategy: "flat",
      flat: 500,
      surcharge: 100,
      handling: 50,
    };
    expect(rateForMethod(m, {}).cost).toBe(650);
  });
});

describe("free-shipping thresholds", () => {
  const m: ShippingMethod = {
    id: "std",
    label: "Standard",
    strategy: "flat",
    flat: 800,
    freeOver: 5000,
  };

  it("is free at/above the threshold", () => {
    const q = rateForMethod(m, { subtotal: 5000 });
    expect(q.cost).toBe(0);
    expect(q.free).toBe(true);
  });

  it("charges normally below the threshold", () => {
    const q = rateForMethod(m, { subtotal: 4999 });
    expect(q.cost).toBe(800);
    expect(q.free).toBe(false);
  });

  it("freeShippingRemaining computes the gap", () => {
    expect(freeShippingRemaining(m, 3000)).toBe(2000);
    expect(freeShippingRemaining(m, 5000)).toBe(0);
    expect(freeShippingRemaining({ ...m, freeOver: undefined }, 0)).toBe(0);
  });
});

describe("minCost / maxCost clamping", () => {
  it("clamps the final cost into range", () => {
    const cheap: ShippingMethod = {
      id: "c",
      label: "c",
      strategy: "flat",
      flat: 100,
      minCost: 300,
    };
    const pricey: ShippingMethod = {
      id: "p",
      label: "p",
      strategy: "flat",
      flat: 5000,
      maxCost: 2000,
    };
    expect(rateForMethod(cheap, {}).cost).toBe(300);
    expect(rateForMethod(pricey, {}).cost).toBe(2000);
  });
});

describe("quoteShipping & cheapestQuote", () => {
  const methods: ShippingMethod[] = [
    { id: "express", label: "Express", zoneId: "us", strategy: "flat", flat: 1500 },
    { id: "std", label: "Standard", zoneId: "us", strategy: "flat", flat: 500 },
    { id: "eu", label: "EU only", zoneId: "eu", strategy: "flat", flat: 100 },
    { id: "global", label: "Global", strategy: "flat", flat: 900 }, // no zone → everywhere
  ];

  it("filters by zone and sorts ascending", () => {
    const quotes = quoteShipping(methods, { zoneId: "us" });
    expect(quotes.map((q) => q.methodId)).toEqual(["std", "global", "express"]);
  });

  it("cheapestQuote returns the lowest", () => {
    expect(cheapestQuote(methods, { zoneId: "us" })?.methodId).toBe("std");
    expect(cheapestQuote(methods, { zoneId: "jp" })?.methodId).toBe("global");
  });
});

describe("ShippingError", () => {
  it("throws when no band matches the metric", () => {
    const m: ShippingMethod = {
      id: "gap",
      label: "Gap",
      strategy: "weight",
      bands: [{ min: 0, max: 100, cost: 200 }],
    };
    expect(() => rateForMethod(m, { weight: 500 })).toThrow(ShippingError);
  });

  it("throws when the required metric is missing", () => {
    const m: ShippingMethod = {
      id: "nometric",
      label: "No metric",
      strategy: "weight",
      bands: [{ min: 0, cost: 200 }],
    };
    expect(() => rateForMethod(m, {})).toThrow(ShippingError);
  });
});
