import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterLeads, dedupeLeads } from "./filter.js";
import { extractEmails, extractSocials } from "./enrich.js";
import { parseLatLng } from "./scrape.js";
import { convertFile, readRows, serializeRows, detectFormat, columnsOf } from "./convert.js";
import type { Lead } from "./types.js";

const LEADS: Lead[] = [
  { name: "Alpha", rating: 4.8, reviews: 200, phone: "1", website: "https://alpha.com", email: "a@alpha.com" },
  { name: "Beta", rating: 3.9, reviews: 5, website: "http://www.beta.com" },
  { name: "Gamma", rating: 4.2, reviews: 60, phone: "3" },
  { name: "Alpha Dup", rating: 4.1, website: "https://alpha.com/" }, // same host as Alpha
];

describe("filterLeads", () => {
  it("minRating and minReviews", () => {
    expect(filterLeads(LEADS, { minRating: 4.2 }).map((l) => l.name)).toEqual(["Alpha", "Gamma"]);
    expect(filterLeads(LEADS, { minReviews: 50 }).map((l) => l.name)).toEqual(["Alpha", "Gamma"]);
  });
  it("hasPhone / hasWebsite / hasEmail", () => {
    expect(filterLeads(LEADS, { hasPhone: true }).map((l) => l.name)).toEqual(["Alpha", "Gamma"]);
    expect(filterLeads(LEADS, { hasWebsite: true }).map((l) => l.name)).toEqual(["Alpha", "Beta", "Alpha Dup"]);
    expect(filterLeads(LEADS, { hasEmail: true }).map((l) => l.name)).toEqual(["Alpha"]);
  });
  it("combines filters (AND)", () => {
    expect(filterLeads(LEADS, { minRating: 4, hasPhone: true }).map((l) => l.name)).toEqual(["Alpha", "Gamma"]);
  });
});

describe("dedupeLeads", () => {
  it("by website host ignores www and trailing slash", () => {
    expect(dedupeLeads(LEADS, "website").map((l) => l.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    // Gamma (no website) is kept; "Alpha Dup" is dropped as a same-host dupe.
  });
  it("by name", () => {
    const dups: Lead[] = [{ name: "X" }, { name: "x" }, { name: "Y" }];
    expect(dedupeLeads(dups, "name").map((l) => l.name)).toEqual(["X", "Y"]);
  });
  it("none keeps everything", () => {
    expect(dedupeLeads(LEADS, "none").length).toBe(LEADS.length);
  });
});

describe("extractEmails", () => {
  it("prefers info@/contact@ and reads mailto", () => {
    const html = `<a href="mailto:info@shop.com">mail</a> rand@shop.com`;
    expect(extractEmails(html)).toBe("info@shop.com");
  });
  it("ignores asset-hash and placeholder junk", () => {
    expect(extractEmails(`logo@2x.png sprite@sentry.io`)).toBeUndefined();
    expect(extractEmails(`<p>reach hello@cafe.np today</p>`)).toBe("hello@cafe.np");
  });
});

describe("extractSocials", () => {
  it("pulls facebook / instagram / whatsapp, skips share widgets", () => {
    const html = `
      <a href="https://facebook.com/mycafe">fb</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
      <a href="//instagram.com/mycafe">ig</a>
      <a href="https://wa.me/9779800000000">wa</a>`;
    const s = extractSocials(html);
    expect(s.facebook).toBe("https://facebook.com/mycafe");
    expect(s.instagram).toBe("https://instagram.com/mycafe");
    expect(s.whatsapp).toBe("https://wa.me/9779800000000");
  });
});

describe("parseLatLng", () => {
  it("prefers the !3d!4d place marker", () => {
    expect(parseLatLng("https://www.google.com/maps/place/X/@27.71,85.32,17z/data=!3d27.7172!4d85.3240"))
      .toEqual({ latitude: 27.7172, longitude: 85.324 });
  });
  it("falls back to @lat,lng", () => {
    expect(parseLatLng("https://maps.google.com/@27.5,85.1,12z")).toEqual({ latitude: 27.5, longitude: 85.1 });
  });
  it("returns empty when absent", () => {
    expect(parseLatLng("https://example.com")).toEqual({});
  });
});

describe("convert", () => {
  it("detectFormat by extension", () => {
    expect(detectFormat("a.json")).toBe("json");
    expect(detectFormat("a.CSV")).toBe("csv");
    expect(detectFormat("a.xlsx")).toBe("xlsx");
    expect(() => detectFormat("a.pdf")).toThrow();
  });
  it("columnsOf unions keys in first-seen order", () => {
    expect(columnsOf([{ a: 1 }, { b: 2, a: 3 }, { c: 4 }])).toEqual(["a", "b", "c"]);
  });
  it("serializeRows to csv/xlsx/json", () => {
    const rows = [{ Name: "A", N: 1 }, { Name: "B", N: 2 }];
    expect((serializeRows(rows, "csv").data as string).split("\r\n")[0]).toBe("Name,N");
    const xl = serializeRows(rows, "xlsx");
    expect(xl.binary).toBe(true);
    expect((xl.data as Uint8Array)[0]).toBe(0x50);
  });
  it("round-trips json -> xlsx -> json on disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lac-conv-"));
    const src = join(dir, "in.json");
    const data = [{ name: "Cafe", rating: 4.5 }, { name: "Bar", rating: 4.1 }];
    writeFileSync(src, JSON.stringify(data));
    const r1 = await convertFile(src, { out: join(dir, "out.xlsx") });
    expect(r1.count).toBe(2);
    const back = await readRows(join(dir, "out.xlsx"));
    expect(back.length).toBe(2);
    expect(String(back[0]!.name)).toBe("Cafe");
  });
});
