import { describe, it, expect } from "vitest";
import { gridPoints, tilesForRings, ringsForTiles, planNamedSteps, MAX_PER_SEARCH, MIN_PER_STEP } from "./sweep.js";
import { groupLeads, groupSlug, addressMentions } from "./split.js";
import { filterLeads } from "./filter.js";
import { haversineMeters } from "./geo.js";
import type { Lead } from "./types.js";

const KTM = { lat: 27.7172, lng: 85.324 };

describe("map tiling", () => {
  it("puts the centre first, then expands ring by ring", () => {
    const pts = gridPoints(KTM, 2500, 1);
    expect(pts).toHaveLength(9);
    expect(pts[0]).toEqual({ lat: +KTM.lat.toFixed(6), lng: +KTM.lng.toFixed(6) });
    // Every ring-1 tile sits within one diagonal step of the centre.
    for (const p of pts.slice(1)) {
      const d = haversineMeters(KTM, p);
      expect(d).toBeGreaterThan(1000);
      expect(d).toBeLessThan(2500 * Math.SQRT2 + 200);
    }
  });

  it("spaces neighbouring tiles by roughly the step", () => {
    const pts = gridPoints(KTM, 3000, 1);
    const north = pts.find((p) => p.lng === pts[0]!.lng && p.lat > pts[0]!.lat)!;
    expect(haversineMeters(pts[0]!, north)).toBeGreaterThan(2800);
    expect(haversineMeters(pts[0]!, north)).toBeLessThan(3200);
  });

  it("counts tiles per ring and picks the smallest ring count that fits", () => {
    expect(tilesForRings(0)).toBe(1);
    expect(tilesForRings(1)).toBe(9);
    expect(tilesForRings(3)).toBe(49);
    expect(ringsForTiles(1)).toBe(0);
    expect(ringsForTiles(9)).toBe(1);
    expect(ringsForTiles(10)).toBe(2);
    expect(ringsForTiles(49)).toBe(3);
  });

  it("never returns duplicate tiles", () => {
    const pts = gridPoints(KTM, 2000, 3);
    const keys = new Set(pts.map((p) => `${p.lat},${p.lng}`));
    expect(keys.size).toBe(pts.length);
    expect(pts).toHaveLength(49);
  });

  it("survives a step of zero and a pole latitude", () => {
    expect(gridPoints(KTM, 0, 1)).toHaveLength(9);
    expect(() => gridPoints({ lat: 90, lng: 0 }, 2000, 1)).not.toThrow();
  });
});

describe("named steps", () => {
  it("crosses every city with every area", () => {
    const steps = planNamedSteps({ type: "restaurants", city: "Kathmandu, Pokhara", area: "Baneshwor, Thamel" });
    expect(steps).toHaveLength(4);
    expect(steps.every((s) => s.kind === "search")).toBe(true);
    expect(steps.map((s) => `${s.area}/${s.city}`)).toEqual([
      "Baneshwor/Kathmandu", "Thamel/Kathmandu", "Baneshwor/Pokhara", "Thamel/Pokhara",
    ]);
  });

  it("keeps an explicit query as a single step", () => {
    expect(planNamedSteps({ query: "dentists near me", city: "a,b" })).toHaveLength(1);
  });

  it("states the per-search ceiling", () => {
    expect(MAX_PER_SEARCH).toBeGreaterThan(100);
    expect(MAX_PER_SEARCH).toBeLessThan(200);
  });

  it("asks each step for a real batch, never just the few still missing", () => {
    // The bug this guards: with 10 leads to go, a tile that asks for 10 gets the
    // 10 most prominent listings — every one of them already collected — and the
    // sweep declares the map exhausted while thousands remain.
    expect(MIN_PER_STEP).toBeGreaterThanOrEqual(30);
    expect(MIN_PER_STEP).toBeLessThanOrEqual(MAX_PER_SEARCH);
  });
});

describe("splitting results", () => {
  const leads: Lead[] = [
    { name: "A", address: "Baneshwor, Kathmandu 44600, Nepal", category: "Restaurant" },
    { name: "B", address: "Thamel, Kathmandu, Nepal", category: "Cafe" },
    { name: "C", address: "Lakeside, Pokhara, Nepal", category: "Restaurant" },
    { name: "D", address: "Somewhere else", category: "Restaurant" },
  ];

  it("groups by requested city, largest first, with unmatched last", () => {
    const groups = groupLeads(leads, "city", ["Kathmandu", "Pokhara"]);
    expect([...groups.keys()]).toEqual(["Kathmandu", "Pokhara", "other"]);
    expect(groups.get("Kathmandu")).toHaveLength(2);
    expect(groups.get("other")!.map((l) => l.name)).toEqual(["D"]);
  });

  it("groups by area and by the lead's own category", () => {
    expect([...groupLeads(leads, "area", ["Thamel"]).keys()]).toEqual(["Thamel", "other"]);
    const byType = groupLeads(leads, "type");
    expect([...byType.keys()]).toEqual(["Restaurant", "Cafe"]);
  });

  it("loses no leads to grouping", () => {
    for (const key of ["city", "area", "type"] as const) {
      const total = [...groupLeads(leads, key, ["Kathmandu"]).values()].reduce((n, g) => n + g.length, 0);
      expect(total).toBe(leads.length);
    }
  });

  it("matches place names on word boundaries only", () => {
    expect(addressMentions("Lakeside, Pokhara, Nepal", "pokhara")).toBe(true);
    expect(addressMentions("Pokharagaun Road", "Pokhara")).toBe(false);
    expect(addressMentions(undefined, "Pokhara")).toBe(false);
  });

  it("slugs group names for filenames", () => {
    expect(groupSlug("New Baneshwor")).toBe("new-baneshwor");
    expect(groupSlug("!!!")).toBe("other");
  });
});

describe("no-website filter", () => {
  const leads: Lead[] = [
    { name: "has", website: "https://a.com" },
    { name: "none" },
  ];
  it("keeps only businesses without a website", () => {
    expect(filterLeads(leads, { noWebsite: true }).map((l) => l.name)).toEqual(["none"]);
  });
  it("still supports the opposite filter", () => {
    expect(filterLeads(leads, { hasWebsite: true }).map((l) => l.name)).toEqual(["has"]);
  });
});
