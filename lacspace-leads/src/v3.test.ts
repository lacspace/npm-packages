import { describe, it, expect } from "vitest";
import {
  cleanWebsite,
  normalizePhone,
  callingCode,
  sortLeads,
} from "./normalize.js";
import { extractSocials } from "./enrich.js";
import { expandQueries, resolvePreset, mapsSearchUrl } from "./query.js";
import { serialize } from "./export.js";
import { FIELD_PRESETS } from "./types.js";
import type { Lead } from "./types.js";

describe("cleanWebsite", () => {
  it("returns undefined for empty input", () => {
    expect(cleanWebsite()).toBeUndefined();
    expect(cleanWebsite("   ")).toBeUndefined();
  });
  it("strips tracking params and fragments", () => {
    expect(cleanWebsite("https://ex.com/x?utm_source=maps&utm_medium=x&id=5#top")).toBe(
      "https://ex.com/x?id=5",
    );
    expect(cleanWebsite("https://ex.com/?fbclid=abc")).toBe("https://ex.com");
  });
  it("unwraps a Google redirect", () => {
    expect(
      cleanWebsite("https://www.google.com/url?q=https%3A%2F%2Fshop.example.com%2F&sa=U"),
    ).toBe("https://shop.example.com");
  });
  it("adds https:// and lower-cases the host", () => {
    expect(cleanWebsite("Example.COM/Path")).toBe("https://example.com/Path");
  });
  it("drops a bare root trailing slash only", () => {
    expect(cleanWebsite("https://ex.com/")).toBe("https://ex.com");
    expect(cleanWebsite("https://ex.com/a/")).toBe("https://ex.com/a/");
  });
  it("returns the raw string when unparseable", () => {
    expect(cleanWebsite("not a url with spaces")).toBe("not a url with spaces");
  });
});

describe("callingCode / normalizePhone", () => {
  it("resolves ISO-2 and raw calling codes", () => {
    expect(callingCode("NP")).toBe("977");
    expect(callingCode("np")).toBe("977");
    expect(callingCode("+1")).toBe("1");
    expect(callingCode("44")).toBe("44");
    expect(callingCode("ZZ")).toBeUndefined();
  });
  it("keeps already-international numbers", () => {
    expect(normalizePhone("+977 1 4444444", "NP")).toBe("+97714444444");
    expect(normalizePhone("00977-1-4444444")).toBe("+97714444444");
  });
  it("prefixes a local number with the country code, dropping trunk 0", () => {
    expect(normalizePhone("098-4111-2222", "NP")).toBe("+9779841112222");
    expect(normalizePhone("(020) 7946 0000", "GB")).toBe("+442079460000");
  });
  it("prefixes when the country code isn't present", () => {
    expect(normalizePhone("9841112222", "NP")).toBe("+9779841112222");
  });
  it("leaves numbers as-is without a country or when implausible", () => {
    expect(normalizePhone("9841112222")).toBe("9841112222");
    expect(normalizePhone("12", "NP")).toBe("12");
    expect(normalizePhone(undefined, "NP")).toBeUndefined();
  });
});

describe("sortLeads", () => {
  const leads: Lead[] = [
    { name: "B", rating: 4.5, reviews: 10, priceLevel: "$$" },
    { name: "A", rating: 4.9, reviews: 3 },
    { name: "C", reviews: 100, priceLevel: "$$$$" },
  ];
  it("sorts by rating desc by default, missing last", () => {
    expect(sortLeads(leads, "rating").map((l) => l.name)).toEqual(["A", "B", "C"]);
  });
  it("sorts by reviews asc when asked", () => {
    expect(sortLeads(leads, "reviews", "asc").map((l) => l.name)).toEqual(["A", "B", "C"]);
  });
  it("sorts by name ascending by default", () => {
    expect(sortLeads(leads, "name").map((l) => l.name)).toEqual(["A", "B", "C"]);
  });
  it("sorts by price level (count of currency glyphs)", () => {
    expect(sortLeads(leads, "priceLevel", "desc").map((l) => l.name)).toEqual(["C", "B", "A"]);
  });
  it("is a no-op without a key and never mutates", () => {
    const copy = sortLeads(leads);
    expect(copy).not.toBe(leads);
    expect(copy.map((l) => l.name)).toEqual(["B", "A", "C"]);
  });
});

describe("extractSocials — extended networks", () => {
  it("captures linkedin, x, youtube, tiktok, telegram", () => {
    const html = `
      <a href="https://linkedin.com/company/acme">in</a>
      <a href="https://x.com/acme">x</a>
      <a href="https://www.youtube.com/@acme">yt</a>
      <a href="https://www.tiktok.com/@acme">tt</a>
      <a href="https://t.me/acme">tg</a>
      <a href="https://facebook.com/acme">fb</a>
    `;
    const s = extractSocials(html);
    expect(s.linkedin).toBe("https://linkedin.com/company/acme");
    expect(s.twitter).toBe("https://x.com/acme");
    expect(s.youtube).toBe("https://www.youtube.com/@acme");
    expect(s.tiktok).toBe("https://www.tiktok.com/@acme");
    expect(s.telegram).toBe("https://t.me/acme");
    expect(s.facebook).toBe("https://facebook.com/acme");
  });
  it("skips share/intent links", () => {
    const html = `
      <a href="https://twitter.com/intent/tweet?url=x">tweet</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=x">share</a>
    `;
    const s = extractSocials(html);
    expect(s.twitter).toBeUndefined();
    expect(s.linkedin).toBeUndefined();
  });
});

describe("expandQueries", () => {
  it("returns a single verbatim query", () => {
    expect(expandQueries({ query: "coffee near me" })).toEqual([{ query: "coffee near me" }]);
  });
  it("cross-products types × cities × areas", () => {
    const q = expandQueries({ type: "cafes,gyms", city: "KTM", area: "Thamel,Patan" });
    expect(q).toHaveLength(4);
    expect(q).toContainEqual({ type: "cafes", city: "KTM", area: "Thamel" });
    expect(q).toContainEqual({ type: "gyms", city: "KTM", area: "Patan" });
  });
  it("drops empty parts", () => {
    expect(expandQueries({ type: "cafes" })).toEqual([{ type: "cafes" }]);
  });
});

describe("resolvePreset", () => {
  it("resolves known presets case-insensitively", () => {
    expect(resolvePreset("OUTREACH")).toEqual(FIELD_PRESETS.outreach);
    expect(resolvePreset("minimal")).toEqual(["name", "phone", "website"]);
  });
  it("returns undefined for unknown / missing", () => {
    expect(resolvePreset("nope")).toBeUndefined();
    expect(resolvePreset()).toBeUndefined();
  });
});

describe("mapsSearchUrl", () => {
  it("sets hl from a locale and gl from a region", () => {
    const url = mapsSearchUrl("cafes in KTM", { hl: "ne-NP", gl: "NP" });
    expect(url).toContain("hl=ne");
    expect(url).toContain("gl=np");
    expect(url).toContain("cafes%20in%20KTM");
  });
});

describe("serialize — ndjson", () => {
  const leads: Lead[] = [
    { name: "A", phone: "1" },
    { name: "B", phone: "2" },
  ];
  it("writes one JSON object per line", () => {
    const { data, binary } = serialize(leads, "ndjson", ["name", "phone"]);
    expect(binary).toBe(false);
    const lines = (data as string).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ name: "A", phone: "1" });
  });
  it("is empty for no leads", () => {
    expect(serialize([], "ndjson", ["name"]).data).toBe("");
  });
});
