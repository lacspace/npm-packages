import { describe, it, expect } from "vitest";
import { filterLeads } from "./filter.js";
import { assertConfig } from "./config.js";
import type { Lead } from "./types.js";

describe("filterLeads — hasContact + excludeNames", () => {
  const leads: Lead[] = [
    { name: "Reachable Phone", phone: "1" },
    { name: "Reachable Web", website: "https://x.com" },
    { name: "Reachable Email", email: "a@x.com" },
    { name: "Ghost Cafe" }, // no contact
    { name: "Spam Marketing Ltd", phone: "2" },
  ];
  it("hasContact keeps only reachable leads", () => {
    expect(filterLeads(leads, { hasContact: true }).map((l) => l.name)).toEqual([
      "Reachable Phone", "Reachable Web", "Reachable Email", "Spam Marketing Ltd",
    ]);
  });
  it("excludeNames drops matching names (case-insensitive, substring)", () => {
    expect(filterLeads(leads, { excludeNames: ["spam", "ghost"] }).map((l) => l.name)).toEqual([
      "Reachable Phone", "Reachable Web", "Reachable Email",
    ]);
  });
  it("combines with other filters", () => {
    expect(filterLeads(leads, { hasContact: true, excludeNames: ["spam"] }).map((l) => l.name)).toEqual([
      "Reachable Phone", "Reachable Web", "Reachable Email",
    ]);
  });
});

describe("assertConfig", () => {
  it("accepts a valid config", () => {
    expect(() => assertConfig({ searches: [{ type: "cafes", city: "KTM" }] })).not.toThrow();
  });
  it("rejects missing / empty searches", () => {
    expect(() => assertConfig({})).toThrow(/searches/);
    expect(() => assertConfig({ searches: [] })).toThrow(/searches/);
    expect(() => assertConfig(null)).toThrow(/object/);
  });
});
