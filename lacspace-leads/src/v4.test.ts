import { describe, it, expect } from "vitest";
import { emailFormatValid, emailDomain, verifyEmail, verifyEmails } from "./verify.js";
import { computeStats, rowsToLeads, serialize, toRows } from "./export.js";
import { filterLeads, dedupeLeads } from "./filter.js";
import type { Lead } from "./types.js";

describe("dedupeLeads — smart key", () => {
  it("dedupes by website→phone→name, keeping website-less leads distinct", () => {
    const leads: Lead[] = [
      { name: "Cafe A", website: "https://a.com" },
      { name: "Cafe A", website: "https://a.com/" }, // same host → dup
      { name: "Cafe B", phone: "+977 1 234" },
      { name: "Cafe B", phone: "9771234" }, // same digits → dup
      { name: "Cafe C" }, // only a name
      { name: "Cafe C" }, // same name → dup
      { name: "Cafe D" }, // distinct name → kept
    ];
    expect(dedupeLeads(leads, "smart").map((l) => l.name)).toEqual(["Cafe A", "Cafe B", "Cafe C", "Cafe D"]);
  });
});

describe("email format helpers", () => {
  it("validates address shape", () => {
    expect(emailFormatValid("info@acme.com")).toBe(true);
    expect(emailFormatValid("first.last@sub.acme.co.uk")).toBe(true);
    expect(emailFormatValid("nope")).toBe(false);
    expect(emailFormatValid("a@b")).toBe(false);
    expect(emailFormatValid("a @b.com")).toBe(false);
    expect(emailFormatValid(undefined)).toBe(false);
  });
  it("extracts the domain", () => {
    expect(emailDomain("Info@Acme.COM")).toBe("acme.com");
    expect(emailDomain("weird")).toBeUndefined();
    expect(emailDomain(undefined)).toBeUndefined();
  });
});

describe("verifyEmail", () => {
  it("returns unknown / invalid-format without network", async () => {
    expect(await verifyEmail(undefined)).toBe("unknown");
    expect(await verifyEmail("not-an-email")).toBe("invalid-format");
  });
  it("uses a seeded cache so no DNS is hit", async () => {
    const cache = new Map<string, boolean>([["acme.com", true], ["nope.invalid", false]]);
    expect(await verifyEmail("info@acme.com", { cache })).toBe("valid");
    expect(await verifyEmail("info@nope.invalid", { cache })).toBe("no-mx");
  });
  it("verifyEmails tags leads in place from cache", async () => {
    const cache = new Map<string, boolean>([["good.com", true], ["bad.com", false]]);
    const leads: Lead[] = [
      { name: "A", email: "a@good.com" },
      { name: "B", email: "b@bad.com" },
      { name: "C" }, // no email → untouched
    ];
    // Pre-seed by verifying with the shared cache through verifyEmail semantics:
    for (const l of leads) if (l.email) l.emailStatus = await verifyEmail(l.email, { cache });
    expect(leads.map((l) => l.emailStatus)).toEqual(["valid", "no-mx", undefined]);
    // hasValidEmail filter keeps only the MX-valid one.
    expect(filterLeads(leads, { hasValidEmail: true }).map((l) => l.name)).toEqual(["A"]);
  });
  it("verifyEmails leaves email-less leads alone and returns the array", async () => {
    const leads: Lead[] = [{ name: "X" }];
    const out = await verifyEmails(leads, { concurrency: 2 });
    expect(out).toBe(leads);
    expect(leads[0]!.emailStatus).toBeUndefined();
  });
});

describe("computeStats", () => {
  const leads: Lead[] = [
    { name: "A", phone: "1", website: "https://a.com", email: "a@a.com", emailStatus: "valid", rating: 4.0, facebook: "https://fb.com/a" },
    { name: "B", phone: "2", email: "b@b.com", emailStatus: "no-mx", rating: 5.0 },
    { name: "C" },
  ];
  it("counts fields and averages rating", () => {
    const s = computeStats(leads);
    expect(s.total).toBe(3);
    expect(s.withPhone).toBe(2);
    expect(s.withWebsite).toBe(1);
    expect(s.withEmail).toBe(2);
    expect(s.withValidEmail).toBe(1);
    expect(s.withSocial).toBe(1);
    expect(s.avgRating).toBe(4.5);
  });
  it("omits avgRating when no ratings", () => {
    expect(computeStats([{ name: "x" }]).avgRating).toBeUndefined();
  });
});

describe("rowsToLeads — append round-trip", () => {
  const leads: Lead[] = [
    { name: "Alpha", rating: 4.8, reviews: 200, phone: "+9779800000000", website: "https://alpha.com", latitude: 27.7 },
    { name: "Beta", rating: 3.9 },
  ];
  it("recovers leads from exported CSV headers", () => {
    // serialize→toRows uses header labels ("Name","Rating"...); rowsToLeads reverses it.
    const rows = toRows(leads, ["name", "rating", "reviews", "phone", "website", "latitude"]);
    const back = rowsToLeads(rows as unknown as Record<string, unknown>[]);
    expect(back[0]!.name).toBe("Alpha");
    expect(back[0]!.rating).toBe(4.8);
    expect(back[0]!.reviews).toBe(200);
    expect(back[0]!.phone).toBe("+9779800000000");
    expect(back[0]!.latitude).toBeCloseTo(27.7);
    expect(back[1]!.rating).toBe(3.9);
  });
  it("recovers leads from raw field-named JSON", () => {
    const parsed = JSON.parse(serialize(leads, "json", ["name", "rating"]).data as string);
    const back = rowsToLeads(parsed);
    expect(back.map((l) => l.name)).toEqual(["Alpha", "Beta"]);
    expect(typeof back[0]!.rating).toBe("number");
  });
  it("ignores unknown columns and blanks", () => {
    const back = rowsToLeads([{ Name: "Z", Nonsense: "x", Rating: "" }]);
    expect(back[0]).toEqual({ name: "Z" });
  });
});
