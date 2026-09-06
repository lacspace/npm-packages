import { describe, it, expect } from "vitest";
import { composeQuery, mapsSearchUrl, normalizeFields, defaultFilename } from "./query.js";
import { serialize, toRows } from "./export.js";
import { parseRating, parseReviewCount } from "./scrape.js";
import { ALL_FIELDS, type Lead } from "./types.js";

describe("composeQuery", () => {
  it("composes type + area + city", () => {
    expect(composeQuery({ type: "restaurants", area: "Baneshwor", city: "Kathmandu" }))
      .toBe("restaurants in Baneshwor, Kathmandu");
  });
  it("drops empty where parts", () => {
    expect(composeQuery({ type: "cafes", city: "Pokhara" })).toBe("cafes in Pokhara");
    expect(composeQuery({ type: "cafes" })).toBe("cafes");
  });
  it("an explicit query wins", () => {
    expect(composeQuery({ type: "x", query: "dentists near me" })).toBe("dentists near me");
  });
  it("throws without a type or query", () => {
    expect(() => composeQuery({ type: "" })).toThrow(/required/);
  });
});

describe("mapsSearchUrl", () => {
  it("encodes the query", () => {
    expect(mapsSearchUrl("cafes in Kathmandu"))
      .toBe("https://www.google.com/maps/search/cafes%20in%20Kathmandu?hl=en");
  });
});

describe("normalizeFields", () => {
  it("defaults to all fields", () => {
    expect(normalizeFields()).toEqual(ALL_FIELDS);
  });
  it("parses a comma string, keeps canonical order, drops unknowns", () => {
    expect(normalizeFields("phone, name, bogus, website")).toEqual(["name", "phone", "website"]);
  });
  it("de-dupes and is case-insensitive", () => {
    expect(normalizeFields(["NAME", "name", "Phone"])).toEqual(["name", "phone"]);
  });
  it("falls back to all fields when nothing valid is given", () => {
    expect(normalizeFields("nonsense")).toEqual(ALL_FIELDS);
  });
});

describe("defaultFilename", () => {
  it("slugs the query and stamps the date + extension", () => {
    const name = defaultFilename("Cafes in Kathmandu!", "csv");
    expect(name).toMatch(/^cafes-in-kathmandu-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

const LEADS: Lead[] = [
  { name: "A Cafe", phone: "+977-1-000", website: "https://a.example", rating: 4.5, reviews: 120, address: "Baneshwor" },
  { name: "B Bistro", rating: 4.1, reviews: 8 },
];

describe("serialize", () => {
  it("json keeps only requested fields and omits undefined", () => {
    const { data, binary } = serialize(LEADS, "json", ["name", "phone"]);
    expect(binary).toBe(false);
    const parsed = JSON.parse(data as string);
    expect(parsed[0]).toEqual({ name: "A Cafe", phone: "+977-1-000" });
    expect(parsed[1]).toEqual({ name: "B Bistro" }); // no phone -> omitted
  });

  it("csv has a header row and one line per lead", () => {
    const { data } = serialize(LEADS, "csv", ["name", "rating"]);
    const csv = data as string;
    expect(csv.split("\r\n")[0]).toBe("Name,Rating");
    expect(csv).toContain("A Cafe");
    expect(csv).toContain("B Bistro");
  });

  it("xlsx returns non-empty bytes with the zip signature", () => {
    const { data, binary } = serialize(LEADS, "xlsx");
    expect(binary).toBe(true);
    const bytes = data as Uint8Array;
    expect(bytes.length).toBeGreaterThan(0);
    // .xlsx is a zip: first two bytes are "PK".
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("toRows projects header-keyed rows in field order with blanks for missing", () => {
    const rows = toRows(LEADS, ["name", "website"]);
    expect(rows[0]).toEqual({ Name: "A Cafe", Website: "https://a.example" });
    expect(rows[1]).toEqual({ Name: "B Bistro", Website: "" });
  });
});

describe("parsers", () => {
  it("parseRating handles dot and comma decimals, clamps to 0–5", () => {
    expect(parseRating("4.5")).toBe(4.5);
    expect(parseRating("4,1 stars")).toBe(4.1);
    expect(parseRating("nonsense")).toBeUndefined();
    expect(parseRating("9")).toBeUndefined(); // out of 0–5
  });
  it("parseReviewCount strips grouping and words", () => {
    expect(parseReviewCount("1,234 reviews")).toBe(1234);
    expect(parseReviewCount("(8)")).toBe(8);
    expect(parseReviewCount(null)).toBeUndefined();
    expect(parseReviewCount("no digits")).toBeUndefined();
  });
});
