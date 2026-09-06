import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePriceLevel,
  priceLevelValue,
  parseBusinessStatus,
  parseClaimed,
  parseOpenNow,
  parseCategoryTags,
} from "./parse.js";
import { filterLeads, subtractLeads } from "./filter.js";
import { toRows, rowsToLeads } from "./export.js";
import { summarize, formatSummary } from "./summary.js";
import { leadDomain, leadsToEnrichInput, leadDomains, pipeToEnrich, leadToEnrichInput } from "./pipe.js";
import {
  queryKey,
  pendingQueries,
  recordQuery,
  emptyCheckpoint,
  isDone,
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  checkpointPath,
} from "./checkpoint.js";
import type { Lead } from "./types.js";
import type { BatchQuery } from "./batch.js";

// ── Feature 1: new field parsers ──────────────────────────────────────────────
describe("parse — price level", () => {
  it("extracts a bare glyph token from an aria label", () => {
    expect(parsePriceLevel("Price: $$")).toBe("$$");
    expect(parsePriceLevel("₹₹₹")).toBe("₹₹₹");
    expect(parsePriceLevel("Moderately priced ($$)")).toBe("$$");
  });
  it("maps textual price descriptions", () => {
    expect(parsePriceLevel("Inexpensive")).toBe("$");
    expect(parsePriceLevel("Very expensive")).toBe("$$$$");
  });
  it("returns undefined when no price signal is present", () => {
    expect(parsePriceLevel("Open now")).toBeUndefined();
    expect(parsePriceLevel(undefined)).toBeUndefined();
  });
  it("priceLevelValue counts glyphs and clamps to 1–4", () => {
    expect(priceLevelValue("$$")).toBe(2);
    expect(priceLevelValue("$$$$$")).toBe(4);
    expect(priceLevelValue("")).toBeUndefined();
    expect(priceLevelValue(undefined)).toBeUndefined();
  });
});

describe("parse — business status", () => {
  it("detects permanently / temporarily closed", () => {
    expect(parseBusinessStatus("Permanently closed")).toBe("closed");
    expect(parseBusinessStatus("Temporarily closed · Opens Mon")).toBe("temporarily-closed");
  });
  it("returns undefined for an operational-looking listing", () => {
    expect(parseBusinessStatus("Open ⋅ Closes 10 PM")).toBeUndefined();
    expect(parseBusinessStatus(undefined)).toBeUndefined();
  });
});

describe("parse — claimed / verified", () => {
  it("marks a listing with a claim CTA as unclaimed", () => {
    expect(parseClaimed("Own this business? Claim this business")).toBe(false);
  });
  it("marks an explicitly verified listing as claimed", () => {
    expect(parseClaimed("Verified listing")).toBe(true);
  });
  it("returns undefined without a signal", () => {
    expect(parseClaimed("Restaurant in Kathmandu")).toBeUndefined();
  });
});

describe("parse — open now", () => {
  it("reads the leading word of the hours widget", () => {
    expect(parseOpenNow("Open ⋅ Closes 10 PM")).toBe(true);
    expect(parseOpenNow("Closed ⋅ Opens 9 AM")).toBe(false);
    expect(parseOpenNow("Open 24 hours")).toBe(true);
  });
  it("returns undefined when unclear", () => {
    expect(parseOpenNow("Hours might differ")).toBeUndefined();
    expect(parseOpenNow("")).toBeUndefined();
  });
});

describe("parse — category tags", () => {
  it("dedupes and tidies chip arrays", () => {
    expect(parseCategoryTags(["Cafe", " cafe ", "Bakery", null])).toEqual(["Cafe", "Bakery"]);
  });
  it("splits a delimited string", () => {
    expect(parseCategoryTags("Restaurant · Bar · Restaurant")).toEqual(["Restaurant", "Bar"]);
  });
  it("returns undefined when nothing usable", () => {
    expect(parseCategoryTags(["", "   "])).toBeUndefined();
    expect(parseCategoryTags(undefined)).toBeUndefined();
  });
});

// ── Feature 2: new filters ────────────────────────────────────────────────────
describe("filterLeads — new filters", () => {
  const leads: Lead[] = [
    { name: "Open Cheap Cafe", openNow: true, priceLevel: "$", category: "Cafe", businessStatus: "operational" },
    { name: "Closed Pricey Bar", openNow: false, priceLevel: "$$$", category: "Bar", businessStatus: "operational" },
    { name: "Shut Diner", openNow: false, priceLevel: "$$", category: "Diner", businessStatus: "closed" },
    { name: "Mystery Spot" }, // no fields
  ];
  it("--open-now keeps only open leads", () => {
    expect(filterLeads(leads, { openNow: true }).map((l) => l.name)).toEqual(["Open Cheap Cafe"]);
  });
  it("--price matches an exact tier", () => {
    expect(filterLeads(leads, { priceLevel: 3 }).map((l) => l.name)).toEqual(["Closed Pricey Bar"]);
    expect(filterLeads(leads, { priceLevel: 1 }).map((l) => l.name)).toEqual(["Open Cheap Cafe"]);
  });
  it("--category matches primary or tag category (substring, ci)", () => {
    const tagged: Lead[] = [{ name: "X", categories: ["Coffee shop", "Bakery"] }, { name: "Y", category: "Bar" }];
    expect(filterLeads(tagged, { category: "bak" }).map((l) => l.name)).toEqual(["X"]);
  });
  it("--business-status filters by status", () => {
    expect(filterLeads(leads, { businessStatus: "closed" }).map((l) => l.name)).toEqual(["Shut Diner"]);
    expect(filterLeads(leads, { businessStatus: "operational" }).map((l) => l.name)).toEqual([
      "Open Cheap Cafe", "Closed Pricey Bar",
    ]);
  });
  it("combines new filters with existing ones", () => {
    expect(filterLeads(leads, { openNow: true, priceLevel: 1 }).map((l) => l.name)).toEqual(["Open Cheap Cafe"]);
  });
});

// ── Feature 3: checkpoint / resume ────────────────────────────────────────────
describe("checkpoint — pure query keys + pending", () => {
  const q1: BatchQuery = { type: "Cafes", city: "Kathmandu", area: "Thamel" };
  const q2: BatchQuery = { type: "cafes", city: "kathmandu", area: "thamel" }; // same, diff case
  const q3: BatchQuery = { type: "gyms", city: "Pokhara" };
  it("normalises case/whitespace into one stable key", () => {
    expect(queryKey(q1)).toBe(queryKey(q2));
    expect(queryKey(q1)).not.toBe(queryKey(q3));
  });
  it("keys a verbatim query distinctly", () => {
    expect(queryKey({ query: "best momo KTM" })).toBe("q:best momo ktm");
  });
  it("pendingQueries skips done and returns the rest", () => {
    const cp = emptyCheckpoint();
    recordQuery(cp, q1, [{ name: "A" }]);
    expect(isDone(cp, q2)).toBe(true); // case-insensitive match
    expect(pendingQueries([q1, q3], cp).map((q) => q.type)).toEqual(["gyms"]);
  });
  it("recordQuery accumulates leads once per key", () => {
    const cp = emptyCheckpoint();
    recordQuery(cp, q1, [{ name: "A" }]);
    recordQuery(cp, q1, [{ name: "B" }]); // same key, ignored
    expect(cp.leads.map((l) => l.name)).toEqual(["A"]);
    expect(cp.done).toHaveLength(1);
  });
});

describe("checkpoint — save/load round-trip on disk", () => {
  it("persists and reloads, then clears", () => {
    const dir = mkdtempSync(join(tmpdir(), "lac-cp-"));
    const out = join(dir, "sweep.csv");
    const file = checkpointPath(out);
    expect(file).toBe(out + ".checkpoint.json");
    const cp = emptyCheckpoint();
    recordQuery(cp, { type: "cafes", city: "KTM" }, [{ name: "Himalayan Java", website: "https://hj.com" }]);
    saveCheckpoint(file, cp);
    const back = loadCheckpoint(file);
    expect(back?.done).toHaveLength(1);
    expect(back?.leads[0]?.name).toBe("Himalayan Java");
    clearCheckpoint(file);
    expect(existsSync(file)).toBe(false);
    expect(loadCheckpoint(file)).toBeUndefined();
  });
  it("returns undefined for a missing / bad checkpoint", () => {
    const dir = mkdtempSync(join(tmpdir(), "lac-cp-"));
    expect(loadCheckpoint(join(dir, "nope.json"))).toBeUndefined();
  });
});

// ── Feature 4: pipe-to-enrich ─────────────────────────────────────────────────
describe("pipe — enrich inputs", () => {
  const leads: Lead[] = [
    { name: "A", website: "https://www.acme.com/contact" },
    { name: "B", website: "http://acme.com" }, // same domain
    { name: "C", website: "https://beta.io" },
    { name: "D" }, // no website
  ];
  it("leadDomain strips scheme + www", () => {
    expect(leadDomain("https://www.Example.com/x")).toBe("example.com");
    expect(leadDomain("beta.io")).toBe("beta.io");
    expect(leadDomain(undefined)).toBeUndefined();
  });
  it("leadToEnrichInput carries name/website/domain, or undefined without a site", () => {
    expect(leadToEnrichInput(leads[0]!)).toEqual({ name: "A", website: "https://www.acme.com/contact", domain: "acme.com" });
    expect(leadToEnrichInput(leads[3]!)).toBeUndefined();
  });
  it("leadsToEnrichInput dedupes by domain and skips siteless leads", () => {
    expect(leadsToEnrichInput(leads).map((i) => i.domain)).toEqual(["acme.com", "beta.io"]);
    expect(leadDomains(leads)).toEqual(["acme.com", "beta.io"]);
  });
  it("pipeToEnrich returns an onLead-compatible, crash-safe handler", () => {
    const seen: string[] = [];
    const onLead = pipeToEnrich((input) => { seen.push(input.domain!); });
    for (const l of leads) onLead(l);
    expect(seen).toEqual(["acme.com", "acme.com", "beta.io"]); // per-lead, no cross-lead dedupe
    const throwing = pipeToEnrich(() => { throw new Error("boom"); });
    expect(() => throwing(leads[0]!)).not.toThrow();
  });
});

// ── Feature 5: summary + cross-file dedupe ────────────────────────────────────
describe("summarize", () => {
  const leads: Lead[] = [
    { name: "A", rating: 4.8, phone: "1", website: "https://a.com", email: "a@a.com", category: "Cafe", openNow: true },
    { name: "B", rating: 4.2, phone: "2", category: "Cafe" },
    { name: "C", rating: 2.5, website: "https://c.com", category: "Bar" },
    { name: "D" }, // unrated, no contact
  ];
  it("computes coverage counts + percentages", () => {
    const s = summarize(leads);
    expect(s.total).toBe(4);
    expect(s.withPhone).toBe(2);
    expect(s.withWebsite).toBe(2);
    expect(s.withEmail).toBe(1);
    expect(s.pctPhone).toBe(50);
    expect(s.openNow).toBe(1);
  });
  it("buckets into rating bands and finds top categories", () => {
    const s = summarize(leads);
    expect(s.ratingBands).toEqual([
      { band: "4.5+", count: 1 },
      { band: "4.0–4.4", count: 1 },
      { band: "<3.0", count: 1 },
      { band: "unrated", count: 1 },
    ]);
    expect(s.topCategories[0]).toEqual({ category: "Cafe", count: 2 });
    expect(s.avgRating).toBeCloseTo(3.8, 5);
  });
  it("formatSummary renders a header + stats lines", () => {
    const text = formatSummary(summarize(leads));
    expect(text).toMatch(/^Summary — 4 leads/);
    expect(text).toMatch(/top categories/);
  });
  it("handles an empty list without dividing by zero", () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(s.pctPhone).toBe(0);
    expect(s.avgRating).toBeUndefined();
  });
});

describe("subtractLeads — cross-file dedupe", () => {
  const fresh: Lead[] = [
    { name: "New One", website: "https://new.com" },
    { name: "Dup Web", website: "https://known.com" },
    { name: "Dup Phone", phone: "+9779800000000" },
    { name: "No Key" },
  ];
  const master: Lead[] = [
    { name: "Known", website: "http://www.known.com" },
    { name: "Phoney", phone: "9779800000000" },
  ];
  it("drops leads already present by smart key, keeps keyless", () => {
    expect(subtractLeads(fresh, master, "smart").map((l) => l.name)).toEqual(["New One", "No Key"]);
  });
  it("respects the chosen key", () => {
    expect(subtractLeads(fresh, master, "website").map((l) => l.name)).toEqual([
      "New One", "Dup Phone", "No Key",
    ]);
  });
  it("none returns everything", () => {
    expect(subtractLeads(fresh, master, "none")).toHaveLength(4);
  });
});

// ── Export round-trip for the new field shapes ────────────────────────────────
describe("export — arrays + booleans", () => {
  const lead: Lead = { name: "X", categories: ["Cafe", "Bakery"], claimed: true, openNow: false };
  it("toRows flattens arrays and booleans for spreadsheets", () => {
    const row = toRows([lead], ["name", "categories", "claimed", "openNow"])[0]!;
    expect(row["Categories"]).toBe("Cafe; Bakery");
    expect(row["Claimed"]).toBe("yes");
    expect(row["Open Now"]).toBe("no");
  });
  it("rowsToLeads reads booleans + array cells back", () => {
    const [back] = rowsToLeads([{ Name: "X", Categories: "Cafe; Bakery", Claimed: "yes", "Open Now": "no" }]);
    expect(back?.categories).toEqual(["Cafe", "Bakery"]);
    expect(back?.claimed).toBe(true);
    expect(back?.openNow).toBe(false);
  });
});
