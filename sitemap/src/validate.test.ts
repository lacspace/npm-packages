import { describe, it, expect } from "vitest";
import {
  sitemap,
  splitSitemaps,
  sitemapIndex,
  SITEMAP_MAX_URLS,
  CHANGEFREQS,
  isValidChangefreq,
  clampPriority,
  formatLastmod,
  assertUrlCount,
  validateSitemapUrl,
} from "./index";

describe("SITEMAP_MAX_URLS / CHANGEFREQS", () => {
  it("exposes the spec limit and the seven changefreq values", () => {
    expect(SITEMAP_MAX_URLS).toBe(50000);
    expect(CHANGEFREQS).toEqual([
      "always",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "yearly",
      "never",
    ]);
  });
});

describe("isValidChangefreq()", () => {
  it("accepts valid enum values", () => {
    expect(isValidChangefreq("daily")).toBe(true);
    expect(isValidChangefreq("never")).toBe(true);
  });
  it("rejects invalid / non-string values", () => {
    expect(isValidChangefreq("often")).toBe(false);
    expect(isValidChangefreq("Daily")).toBe(false);
    expect(isValidChangefreq(undefined)).toBe(false);
    expect(isValidChangefreq(3)).toBe(false);
  });
});

describe("clampPriority()", () => {
  it("clamps above 1.0 and below 0.0", () => {
    expect(clampPriority(1.7)).toBe(1);
    expect(clampPriority(-3)).toBe(0);
  });
  it("rounds to one decimal like the emitted value", () => {
    expect(clampPriority(0.83)).toBe(0.8);
    expect(clampPriority(0.55)).toBe(0.6);
  });
  it("falls back to 0.5 for non-finite input", () => {
    expect(clampPriority(NaN)).toBe(0.5);
    expect(clampPriority(Infinity)).toBe(0.5);
  });
});

describe("formatLastmod()", () => {
  it("formats a Date as ISO 8601", () => {
    expect(formatLastmod(new Date("2026-09-05T00:00:00.000Z"))).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });
  it("passes a string through unchanged", () => {
    expect(formatLastmod("2026-09-05")).toBe("2026-09-05");
  });
  it("throws on an Invalid Date", () => {
    expect(() => formatLastmod(new Date("nonsense"))).toThrow(/Invalid Date/);
  });
});

describe("assertUrlCount()", () => {
  it("passes when within the limit", () => {
    expect(() => assertUrlCount(10, 50)).not.toThrow();
  });
  it("throws a clear RangeError past the cap", () => {
    expect(() => assertUrlCount(3, 2)).toThrow(RangeError);
    expect(() => assertUrlCount(3, 2)).toThrow(/exceeds the limit of 2/);
  });
  it("never allows more than the spec max even if cap is higher", () => {
    expect(() => assertUrlCount(50001, 99999)).toThrow(/limit of 50000/);
  });
});

describe("sitemap({ maxUrls }) guard", () => {
  const urls = [
    { loc: "https://x.com/a" },
    { loc: "https://x.com/b" },
    { loc: "https://x.com/c" },
  ];
  it("is off by default (no throw)", () => {
    expect(() => sitemap(urls)).not.toThrow();
  });
  it("throws when the count exceeds maxUrls", () => {
    expect(() => sitemap(urls, { maxUrls: 2 })).toThrow(/exceeds the limit of 2/);
  });
  it("does not throw when exactly at the cap", () => {
    expect(() => sitemap(urls, { maxUrls: 3 })).not.toThrow();
  });
});

describe("validateSitemapUrl()", () => {
  it("returns no issues for a valid entry", () => {
    expect(
      validateSitemapUrl({ loc: "https://x.com/", priority: 0.8, changefreq: "daily" }),
    ).toEqual([]);
  });
  it("flags a missing / relative loc", () => {
    expect(validateSitemapUrl({}).some((i) => i.field === "loc")).toBe(true);
    expect(validateSitemapUrl({ loc: "/rel" }).some((i) => i.field === "loc")).toBe(true);
  });
  it("flags an out-of-range priority and bad changefreq together", () => {
    const issues = validateSitemapUrl({
      loc: "https://x.com/",
      priority: 2,
      changefreq: "often",
    });
    expect(issues.map((i) => i.field).sort()).toEqual(["changefreq", "priority"]);
  });
  it("flags an Invalid Date lastmod", () => {
    const issues = validateSitemapUrl({ loc: "https://x.com/", lastmod: new Date("x") });
    expect(issues.some((i) => i.field === "lastmod")).toBe(true);
  });
});

describe("splitSitemaps() sharding (brief: 3 URLs, cap 2 → 2 files + index)", () => {
  const urls = [
    { loc: "https://x.com/a" },
    { loc: "https://x.com/b" },
    { loc: "https://x.com/c" },
  ];
  it("produces 2 child sitemaps and an index referencing both", () => {
    const { index, files } = splitSitemaps(urls, {
      baseUrl: "https://x.com",
      perFile: 2,
    });
    expect(files).toHaveLength(2);
    expect(files[0]!.xml).toContain("<loc>https://x.com/a</loc>");
    expect(files[1]!.xml).toContain("<loc>https://x.com/c</loc>");
    expect(index).toContain("<sitemapindex");
    expect(index).toContain("<loc>https://x.com/sitemap-0.xml</loc>");
    expect(index).toContain("<loc>https://x.com/sitemap-1.xml</loc>");
  });
});

describe("XML escaping of ampersands", () => {
  it("escapes & in a URL loc", () => {
    const xml = sitemap([{ loc: "https://x.com/s?a=1&b=2" }]);
    expect(xml).toContain("<loc>https://x.com/s?a=1&amp;b=2</loc>");
    expect(xml).not.toContain("a=1&b=2");
  });
  it("escapes & inside a sitemap index loc too", () => {
    const xml = sitemapIndex([{ loc: "https://x.com/s.xml?v=1&t=2" }]);
    expect(xml).toContain("v=1&amp;t=2");
  });
});
