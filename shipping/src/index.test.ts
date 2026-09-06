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
  type RateBand,
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

describe("cheapestQuote excludeFree", () => {
  it("skips zero-cost methods when excludeFree is set", () => {
    const methods = [
      { id: "pickup", label: "Store pickup", strategy: "flat" as const, flat: 0 },
      { id: "std", label: "Standard", strategy: "flat" as const, flat: 8000 },
      { id: "exp", label: "Express", strategy: "flat" as const, flat: 20000 },
    ];
    const input = { subtotal: 100000 };
    expect(cheapestQuote(methods, input)?.methodId).toBe("pickup");        // default: free wins
    expect(cheapestQuote(methods, input, { excludeFree: true })?.methodId).toBe("std"); // real rate
  });

  it("returns undefined when every method is free and excludeFree is set", () => {
    const methods: ShippingMethod[] = [
      { id: "pickup", label: "Pickup", strategy: "flat", flat: 0 },
      { id: "std", label: "Standard", strategy: "flat", flat: 800, freeOver: 5000 },
    ];
    // subtotal clears freeOver → std is free too, so nothing charges.
    expect(cheapestQuote(methods, { subtotal: 5000 }, { excludeFree: true })).toBeUndefined();
    expect(cheapestQuote([], { subtotal: 5000 })).toBeUndefined();
  });
});

describe("negative / zero cost hardening", () => {
  it("never returns a negative cost — a negative surcharge is clamped to 0", () => {
    const m: ShippingMethod = {
      id: "credit",
      label: "Credit",
      strategy: "flat",
      flat: 100,
      surcharge: -500, // would make base negative
    };
    expect(rateForMethod(m, {}).cost).toBe(0);
  });

  it("a zero flat cost is charged as 0 but not marked free", () => {
    const m: ShippingMethod = { id: "z", label: "Zero", strategy: "flat", flat: 0 };
    const q = rateForMethod(m, {});
    expect(q.cost).toBe(0);
    expect(q.free).toBe(false);
  });
});

describe("free threshold vs clamping precedence", () => {
  it("free-over-threshold wins over minCost (free means 0, not the floor)", () => {
    const m: ShippingMethod = {
      id: "floored",
      label: "Floored",
      strategy: "flat",
      flat: 100,
      minCost: 300,
      freeOver: 5000,
    };
    expect(rateForMethod(m, { subtotal: 4999 }).cost).toBe(300); // floor applies below threshold
    const q = rateForMethod(m, { subtotal: 5000 }); // at threshold
    expect(q.cost).toBe(0);
    expect(q.free).toBe(true);
  });

  it("free threshold is inclusive at the exact boundary", () => {
    const m: ShippingMethod = { id: "s", label: "S", strategy: "flat", flat: 800, freeOver: 5000 };
    expect(rateForMethod(m, { subtotal: 4999 }).free).toBe(false);
    expect(rateForMethod(m, { subtotal: 5000 }).free).toBe(true);
    expect(rateForMethod(m, { subtotal: 5001 }).free).toBe(true);
  });
});

describe("band edge cases", () => {
  const m: ShippingMethod = {
    id: "std",
    label: "Standard",
    strategy: "weight",
    bands: [
      { min: 0, max: 500, cost: 300 },
      { min: 501, max: 2000, cost: 600 },
      { min: 2001, cost: 1200 },
    ],
  };

  it("throws a coded NO_BAND error for a gap between bands", () => {
    const gapped: ShippingMethod = {
      id: "g",
      label: "G",
      strategy: "weight",
      bands: [
        { min: 0, max: 500, cost: 300 },
        { min: 600, max: 1000, cost: 600 }, // gap: 501..599 unmatched
      ],
    };
    try {
      rateForMethod(gapped, { weight: 550 });
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ShippingError);
      expect((e as ShippingError).code).toBe("NO_BAND");
    }
  });

  it("negative metric matches no band and throws", () => {
    expect(() => rateForMethod(m, { weight: -1 })).toThrow(ShippingError);
  });

  it("overlapping bands resolve to the first matching band (declaration order)", () => {
    const overlap: ShippingMethod = {
      id: "o",
      label: "O",
      strategy: "weight",
      bands: [
        { min: 0, max: 1000, cost: 300 },
        { min: 500, max: 1500, cost: 999 }, // overlaps 500..1000
      ],
    };
    expect(rateForMethod(overlap, { weight: 750 }).cost).toBe(300); // first wins
  });

  it("selects the open-ended top band exactly at its min boundary", () => {
    expect(rateForMethod(m, { weight: 2001 }).cost).toBe(1200);
  });
});

describe("freeShippingRemaining hardening", () => {
  it("is never negative once the subtotal exceeds the threshold", () => {
    const m: ShippingMethod = { id: "s", label: "S", strategy: "flat", flat: 800, freeOver: 5000 };
    expect(freeShippingRemaining(m, 9999)).toBe(0);
    expect(freeShippingRemaining(m, 5000)).toBe(0);
    expect(freeShippingRemaining(m, 4999)).toBe(1);
  });
});

describe("immutability of inputs", () => {
  it("quoteShipping does not reorder or mutate the input methods array", () => {
    const methods: ShippingMethod[] = [
      { id: "b", label: "B", strategy: "flat", flat: 1500 },
      { id: "a", label: "A", strategy: "flat", flat: 500 },
    ];
    const order = methods.map((m) => m.id);
    const quotes = quoteShipping(methods, {});
    expect(quotes.map((q) => q.methodId)).toEqual(["a", "b"]); // sorted output
    expect(methods.map((m) => m.id)).toEqual(order); // input untouched
  });

  it("works on deeply frozen methods without throwing", () => {
    const method: ShippingMethod = Object.freeze({
      id: "std",
      label: "Standard",
      strategy: "weight",
      bands: [Object.freeze({ min: 0, max: 500, cost: 300 })] as RateBand[],
    });
    const methods = Object.freeze([method]) as ShippingMethod[];
    expect(() => quoteShipping(methods, { weight: 100 })).not.toThrow();
    expect(cheapestQuote(methods, { weight: 100 })?.cost).toBe(300);
  });
});
