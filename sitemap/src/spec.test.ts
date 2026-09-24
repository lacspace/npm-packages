import { test, expect } from "vitest";
import { sitemap, sitemapIndex, toNextSitemap, splitSitemaps, SITEMAP_MAX_URLS } from "./index";

const urls = (n: number) => Array.from({ length: n }, (_, i) => ({ loc: `https://a.com/${i}` }));

// sitemaps.org caps one file at 50,000 URLs and Google rejects the WHOLE file
// past it, so emitting 50,001 was a silent total failure: valid XML, zero
// indexed pages, no error anywhere.
test("the 50,000-URL cap is enforced by default", () => {
  expect(() => sitemap(urls(SITEMAP_MAX_URLS))).not.toThrow();
  expect(() => sitemap(urls(SITEMAP_MAX_URLS + 1))).toThrow(RangeError);
  // The error has to name the way out, or it just moves the problem.
  expect(() => sitemap(urls(SITEMAP_MAX_URLS + 1))).toThrow(/splitSitemaps/);
});

test("allowOversize opts out for non-crawler consumers", () => {
  const out = sitemap(urls(SITEMAP_MAX_URLS + 1), { allowOversize: true });
  expect((out.match(/<loc>/g) ?? []).length).toBe(SITEMAP_MAX_URLS + 1);
});

test("a lower explicit maxUrls is still honoured", () => {
  expect(() => sitemap(urls(11), { maxUrls: 10 })).toThrow(/limit of 10/);
  expect(() => sitemap(urls(10), { maxUrls: 10 })).not.toThrow();
});

// changefreq has exactly seven legal values; anything else invalidates the file.
test("an unrecognised changefreq is dropped instead of invalidating the file", () => {
  const out = sitemap([{ loc: "https://a.com/x", changefreq: "often" as never }]);
  expect(out).not.toContain("<changefreq>");
  expect(out).toContain("<loc>https://a.com/x</loc>"); // URL still listed
});

test("all seven legal changefreq values still pass through", () => {
  for (const cf of ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] as const) {
    expect(sitemap([{ loc: "https://a.com/x", changefreq: cf }])).toContain(`<changefreq>${cf}</changefreq>`);
  }
});

// The XML path always clamped priority; the Next path passed it straight
// through, so one input produced two different answers and only one was valid.
test("toNextSitemap applies the same priority and changefreq rules as the XML", () => {
  const input = [{ loc: "https://a.com/x", priority: 1.7, changefreq: "often" as never }];
  expect(sitemap(input)).toContain("<priority>1.0</priority>");
  const next = toNextSitemap(input)[0]!;
  expect(next.priority).toBe(1);
  expect(next.changeFrequency).toBeUndefined();
});

test("toNextSitemap keeps valid values and omits absent ones", () => {
  const next = toNextSitemap([{ loc: "https://a.com/x", priority: 0.83, changefreq: "weekly" }])[0]!;
  expect(next.priority).toBe(0.8);
  expect(next.changeFrequency).toBe("weekly");
  const bare = toNextSitemap([{ loc: "https://a.com/y" }])[0]!;
  expect(bare.priority).toBeUndefined();
  expect(bare.changeFrequency).toBeUndefined();
});

test("negative and non-finite priorities are clamped, not emitted raw", () => {
  expect(sitemap([{ loc: "https://a.com/x", priority: -3 }])).toContain("<priority>0.0</priority>");
  expect(toNextSitemap([{ loc: "https://a.com/x", priority: -3 }])[0]!.priority).toBe(0);
  expect(toNextSitemap([{ loc: "https://a.com/x", priority: NaN }])[0]!.priority).toBe(0.5);
});

test("an Invalid Date names the package and field instead of 'Invalid time value'", () => {
  expect(() => sitemap([{ loc: "https://a.com/x", lastmod: new Date("nope") }])).toThrow(/@lacspace\/sitemap.*lastmod/);
});

test("empty input produces well-formed XML with no stray blank line", () => {
  expect(sitemap([])).toMatch(/<urlset [^>]*>\n<\/urlset>$/);
  expect(sitemap([])).not.toContain("\n\n");
  expect(sitemapIndex([])).toMatch(/<sitemapindex [^>]*>\n<\/sitemapindex>$/);
  expect(sitemapIndex([])).not.toContain("\n\n");
});

test("splitSitemaps shards on the boundary and still caps each file at the spec max", () => {
  const four = splitSitemaps(urls(4), { baseUrl: "https://a.com", perFile: 2 });
  expect(four.files.map((f) => f.name)).toEqual(["sitemap-0.xml", "sitemap-1.xml"]);
  expect((four.files[0]!.xml.match(/<loc>/g) ?? []).length).toBe(2);
  expect(four.index).toContain("<loc>https://a.com/sitemap-0.xml</loc>");
  // A perFile above the spec max must not produce an oversized shard.
  const big = splitSitemaps(urls(3), { baseUrl: "https://a.com", perFile: 999_999 });
  expect(big.files).toHaveLength(1);
});
