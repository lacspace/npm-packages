import { describe, it, expect } from "vitest";
import {
  rateForMethod,
  ShippingError,
  volumetricWeight,
  billableWeight,
  selectBand,
  baseCost,
  resolveLane,
  rateFromZoneTable,
  applyThreshold,
  rateBreakdown,
  quoteMethods,
  estimatedDays,
  type ShippingMethod,
  type ZoneLane,
  type RateBand,
} from "./index";

/* ------------------------------------------------------------------ *
 * Dimensional weight
 * ------------------------------------------------------------------ */
describe("dimensional weight", () => {
  it("computes volumetric weight rounded up (grams via divisor 5)", () => {
    // 30 × 20 × 10 = 6000 cm³; /5 = 1200 g
    expect(volumetricWeight({ length: 30, width: 20, height: 10 }, { divisor: 5 })).toBe(1200);
  });

  it("rounds volumetric weight up, never down", () => {
    // 10 × 10 × 10 = 1000; /5000 = 0.2 → ceil → 1
    expect(volumetricWeight({ length: 10, width: 10, height: 10 })).toBe(1);
  });

  it("billable weight is the max of actual and volumetric", () => {
    const dims = { length: 30, width: 20, height: 10 }; // 1200 g volumetric @ /5
    expect(billableWeight(500, dims, { divisor: 5 })).toBe(1200); // volumetric wins
    expect(billableWeight(2000, dims, { divisor: 5 })).toBe(2000); // actual wins
  });

  it("billable weight drives rate-band selection for a bulky-but-light parcel", () => {
    const m: ShippingMethod = {
      id: "std",
      label: "Standard",
      strategy: "weight",
      bands: [
        { min: 0, max: 1000, cost: 300 },
        { min: 1001, cost: 900 },
      ],
    };
    const dims = { length: 30, width: 20, height: 10 }; // 1200 g billable
    // actual 400 g would hit the 300 band, but volume pushes it to the 900 band.
    expect(rateForMethod(m, { weight: billableWeight(400, dims, { divisor: 5 }) }).cost).toBe(900);
  });

  it("throws on a non-positive divisor", () => {
    expect(() => volumetricWeight({ length: 1, width: 1, height: 1 }, { divisor: 0 })).toThrow(ShippingError);
  });
});

/* ------------------------------------------------------------------ *
 * selectBand / baseCost — boundary correctness
 * ------------------------------------------------------------------ */
describe("selectBand boundaries", () => {
  const bands: RateBand[] = [
    { min: 0, max: 500, cost: 300 },
    { min: 501, max: 2000, cost: 600 },
    { min: 2001, cost: 1200 },
  ];

  it("selects inclusive at both edges of a bracket", () => {
    expect(selectBand(bands, 0)?.cost).toBe(300);
    expect(selectBand(bands, 500)?.cost).toBe(300);
    expect(selectBand(bands, 501)?.cost).toBe(600);
    expect(selectBand(bands, 2000)?.cost).toBe(600);
    expect(selectBand(bands, 2001)?.cost).toBe(1200); // open-ended min edge
  });

  it("returns undefined for a value below every bracket", () => {
    expect(selectBand([{ min: 10, max: 20, cost: 100 }], 5)).toBeUndefined();
  });

  it("baseCost matches rateForMethod's base (no surcharge/handling)", () => {
    const m: ShippingMethod = { id: "w", label: "W", strategy: "weight", bands };
    expect(baseCost(m, { weight: 1500 })).toBe(600);
    expect(rateForMethod(m, { weight: 1500 }).cost).toBe(600);
  });
});

/* ------------------------------------------------------------------ *
 * Zone rate tables
 * ------------------------------------------------------------------ */
describe("zone rate tables", () => {
  const lanes: ZoneLane[] = [
    {
      to: "us",
      strategy: "weight",
      bands: [
        { min: 0, max: 500, cost: 400 },
        { min: 501, cost: 800 },
      ],
    },
    { from: "eu-hub", to: "us", strategy: "flat", flat: 250 }, // specific origin cheaper
    { to: "row", strategy: "item", bands: [{ min: 1, max: 2, cost: 900 }, { min: 3, cost: 1500 }] },
  ];

  it("resolves a wildcard-origin lane by destination", () => {
    expect(resolveLane(lanes, { toZone: "us" })?.to).toBe("us");
    expect(rateFromZoneTable(lanes, { toZone: "us", weight: 400 })).toBe(400);
    expect(rateFromZoneTable(lanes, { toZone: "us", weight: 501 })).toBe(800); // bracket boundary
  });

  it("prefers a specific origin lane over the wildcard", () => {
    const lane = resolveLane(lanes, { fromZone: "eu-hub", toZone: "us" });
    expect(lane?.flat).toBe(250);
    expect(rateFromZoneTable(lanes, { fromZone: "eu-hub", toZone: "us", weight: 999 })).toBe(250);
  });

  it("supports per-item lanes", () => {
    expect(rateFromZoneTable(lanes, { toZone: "row", itemCount: 2 })).toBe(900);
    expect(rateFromZoneTable(lanes, { toZone: "row", itemCount: 3 })).toBe(1500);
  });

  it("throws NO_LANE when no lane serves the destination", () => {
    try {
      rateFromZoneTable(lanes, { toZone: "jp", weight: 100 });
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ShippingError);
      expect((e as ShippingError).code).toBe("NO_LANE");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Free / discounted thresholds
 * ------------------------------------------------------------------ */
describe("free / discounted thresholds", () => {
  it("free-over triggers at/above the boundary and wins over discount", () => {
    const rule = { freeOver: 5000, discountOver: 3000, discountBps: 5000 };
    expect(applyThreshold(800, 4999, rule)).toEqual({ cost: 400, free: false, discounted: true }); // 50% off
    expect(applyThreshold(800, 5000, rule)).toEqual({ cost: 0, free: true, discounted: false }); // free wins
  });

  it("applies a bps discount then a flat discount, integer-safe", () => {
    // 999 - 33% (trunc) = 999 - 329 = 670, then -70 flat = 600
    const r = applyThreshold(999, 10000, { discountOver: 5000, discountBps: 3300, discountAmount: 70 });
    expect(r).toEqual({ cost: 600, free: false, discounted: true });
  });

  it("never goes negative and marks nothing discounted below the threshold", () => {
    expect(applyThreshold(500, 100, { discountOver: 5000, discountBps: 5000 })).toEqual({
      cost: 500,
      free: false,
      discounted: false,
    });
    expect(applyThreshold(100, 9999, { discountOver: 0, discountAmount: 999 })).toEqual({
      cost: 0,
      free: false,
      discounted: true,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Breakdown
 * ------------------------------------------------------------------ */
describe("rateBreakdown", () => {
  it("parts sum to the total exactly", () => {
    const m: ShippingMethod = {
      id: "std",
      label: "Standard",
      strategy: "weight",
      bands: [{ min: 0, cost: 700 }],
      surcharge: 100,
      handling: 50,
    };
    const b = rateBreakdown(m, { weight: 300 }, { fuelBps: 1000, remoteAreaFee: 200 });
    // base 700, handling 50, surcharges: method 100 + fuel 70 (10% of 700) + remote 200 = 370
    expect(b.base).toBe(700);
    expect(b.handling).toBe(50);
    expect(b.surchargeTotal).toBe(370);
    expect(b.surcharges.map((s) => s.label)).toEqual(["surcharge", "fuel", "remote area"]);
    expect(b.total).toBe(700 + 50 + 370);
    expect(b.base + b.handling + b.surchargeTotal).toBe(b.total);
  });

  it("total equals rateForMethod when no extra options are passed", () => {
    const m: ShippingMethod = {
      id: "std",
      label: "Standard",
      strategy: "flat",
      flat: 500,
      surcharge: 100,
      handling: 50,
      minCost: 700,
      freeOver: 5000,
    };
    for (const subtotal of [0, 4999, 5000]) {
      expect(rateBreakdown(m, { subtotal }).total).toBe(rateForMethod(m, { subtotal }).cost);
    }
  });

  it("reflects the free threshold and reports a discount", () => {
    const m: ShippingMethod = { id: "s", label: "S", strategy: "flat", flat: 800, freeOver: 5000 };
    const free = rateBreakdown(m, { subtotal: 5000 });
    expect(free.total).toBe(0);
    expect(free.free).toBe(true);
    expect(free.discount).toBe(0);

    const discounted = rateBreakdown(m, { subtotal: 3000 }, { threshold: { discountOver: 3000, discountBps: 5000 } });
    expect(discounted.total).toBe(400);
    expect(discounted.discount).toBe(400);
    expect(discounted.free).toBe(false);
  });

  it("clamps to maxCost and stays integer with a custom bps surcharge", () => {
    const m: ShippingMethod = { id: "c", label: "C", strategy: "flat", flat: 1000, maxCost: 1050 };
    const b = rateBreakdown(m, {}, { surcharges: [{ label: "insurance", bps: 333 }] });
    // insurance = trunc(1000 * 333 / 10000) = 33; gross 1033 < 1050 cap
    expect(b.surcharges).toEqual([{ label: "insurance", amount: 33 }]);
    expect(b.total).toBe(1033);
    expect(Number.isInteger(b.total)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Multi-method quoting with ETA
 * ------------------------------------------------------------------ */
describe("quoteMethods with ETA", () => {
  const methods: ShippingMethod[] = [
    { id: "std", label: "Standard", zoneId: "us", strategy: "flat", flat: 500, etaDays: [4, 6] },
    { id: "exp", label: "Express", zoneId: "us", strategy: "flat", flat: 1500, etaDays: [1, 2] },
    { id: "global", label: "Global", strategy: "flat", flat: 900, etaDays: [7, 10] },
  ];

  it("returns a cost-sorted list each with an estimatedDays midpoint", () => {
    const quotes = quoteMethods(methods, { zoneId: "us" });
    expect(quotes.map((q) => q.methodId)).toEqual(["std", "global", "exp"]);
    expect(quotes.find((q) => q.methodId === "std")?.estimatedDays).toBe(5); // (4+6)/2
    expect(quotes.find((q) => q.methodId === "exp")?.estimatedDays).toBe(2); // round(1.5)
  });

  it("sorts by speed when asked", () => {
    const quotes = quoteMethods(methods, { zoneId: "us" }, { sortBy: "speed" });
    expect(quotes.map((q) => q.methodId)).toEqual(["exp", "std", "global"]);
  });

  it("rates on billable weight when dimensions are supplied", () => {
    const weightMethods: ShippingMethod[] = [
      {
        id: "w",
        label: "W",
        strategy: "weight",
        bands: [
          { min: 0, max: 1000, cost: 300 },
          { min: 1001, cost: 900 },
        ],
      },
    ];
    const dims = { length: 30, width: 20, height: 10 }; // 1200 g billable @ /5
    const q = quoteMethods(weightMethods, { weight: 400 }, { dimensions: dims, divisor: 5 });
    expect(q[0]?.cost).toBe(900); // dim weight bumped it into the heavier band
  });

  it("excludeFree drops zero-cost quotes", () => {
    const withFree: ShippingMethod[] = [
      { id: "pickup", label: "Pickup", strategy: "flat", flat: 0 },
      { id: "std", label: "Standard", strategy: "flat", flat: 500 },
    ];
    expect(quoteMethods(withFree, {}).map((q) => q.methodId)).toEqual(["pickup", "std"]);
    expect(quoteMethods(withFree, {}, { excludeFree: true }).map((q) => q.methodId)).toEqual(["std"]);
  });

  it("estimatedDays helper returns the rounded midpoint or undefined", () => {
    expect(estimatedDays([2, 4])).toBe(3);
    expect(estimatedDays()).toBeUndefined();
  });
});
