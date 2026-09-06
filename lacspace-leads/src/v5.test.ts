import { describe, it, expect } from "vitest";
import { haversineMeters, parseLatLngPair, parseDistance, zoomForRadius } from "./geo.js";
import { sortLeads } from "./normalize.js";
import { mapsSearchUrl } from "./query.js";
import type { Lead } from "./types.js";

describe("haversineMeters", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMeters({ lat: 27.7, lng: 85.3 }, { lat: 27.7, lng: 85.3 })).toBeCloseTo(0, 3);
  });
  it("measures a known short distance", () => {
    // Thamel → Baneshwor, Kathmandu ≈ 4.2 km as the crow flies.
    const d = haversineMeters({ lat: 27.7154, lng: 85.3123 }, { lat: 27.6935, lng: 85.3420 });
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(5500);
  });
  it("matches a 1-degree latitude step (~111 km)", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("parseLatLngPair", () => {
  it("parses comma and space forms and an @ prefix", () => {
    expect(parseLatLngPair("27.7172,85.3240")).toEqual({ lat: 27.7172, lng: 85.324 });
    expect(parseLatLngPair("  27.7172 , 85.3240 ")).toEqual({ lat: 27.7172, lng: 85.324 });
    expect(parseLatLngPair("@27.7172,85.3240")).toEqual({ lat: 27.7172, lng: 85.324 });
    expect(parseLatLngPair("-33.8688,151.2093")).toEqual({ lat: -33.8688, lng: 151.2093 });
  });
  it("rejects junk and out-of-range values", () => {
    expect(parseLatLngPair("nope")).toBeUndefined();
    expect(parseLatLngPair("91,0")).toBeUndefined();
    expect(parseLatLngPair("0,181")).toBeUndefined();
    expect(parseLatLngPair(undefined)).toBeUndefined();
  });
});

describe("parseDistance", () => {
  it("parses units to metres", () => {
    expect(parseDistance("2km")).toBe(2000);
    expect(parseDistance("500m")).toBe(500);
    expect(parseDistance("1.5km")).toBe(1500);
    expect(parseDistance("1mi")).toBeCloseTo(1609.344, 2);
    expect(parseDistance("800")).toBe(800); // bare = metres
    expect(parseDistance("2 km")).toBe(2000);
  });
  it("rejects junk and non-positive", () => {
    expect(parseDistance("far")).toBeUndefined();
    expect(parseDistance("0km")).toBeUndefined();
    expect(parseDistance("-5m")).toBeUndefined();
    expect(parseDistance(undefined)).toBeUndefined();
  });
});

describe("zoomForRadius", () => {
  it("gives a smaller zoom for a larger radius", () => {
    const near = zoomForRadius(500, 27.7);
    const far = zoomForRadius(10_000, 27.7);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThanOrEqual(3);
    expect(near).toBeLessThanOrEqual(19);
  });
});

describe("mapsSearchUrl — centre", () => {
  it("embeds @lat,lng,zoomz when a centre is given", () => {
    const url = mapsSearchUrl("cafes", { center: { lat: 27.71, lng: 85.32, zoom: 15 } });
    expect(url).toContain("/@27.71,85.32,15z");
    expect(url).toContain("hl=en");
  });
});

describe("sortLeads — distance", () => {
  const leads: Lead[] = [
    { name: "Far", distanceKm: 5.2 },
    { name: "Near", distanceKm: 0.4 },
    { name: "Mid", distanceKm: 2.1 },
    { name: "Unknown" }, // no distance → last
  ];
  it("defaults to nearest-first, missing last", () => {
    expect(sortLeads(leads, "distance").map((l) => l.name)).toEqual(["Near", "Mid", "Far", "Unknown"]);
  });
  it("can reverse to farthest-first", () => {
    expect(sortLeads(leads, "distance", "desc").map((l) => l.name)).toEqual(["Far", "Mid", "Near", "Unknown"]);
  });
});
