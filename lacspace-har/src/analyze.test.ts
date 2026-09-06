import { describe, it, expect } from "vitest";
import { parseHar, HarParseError } from "./parse.js";
import { analyzeHar, categoryOf, registrableDomain, transferBytes, isCacheHit, fmtBytes } from "./analyze.js";
import { formatReport } from "./report.js";
import type { Har, HarEntry } from "./types.js";

/** Build a synthetic HAR entry with sensible defaults. */
function entry(p: Partial<HarEntry> & { url: string }): HarEntry {
  const { url, request, response, ...rest } = p;
  return {
    time: 0,
    request: { method: "GET", url, headers: [], ...request },
    response: { status: 200, content: { size: 0, mimeType: "" }, headers: [], ...response },
    ...rest,
  };
}

/** A 6-entry HAR spanning domains / types / status / cache / compression. */
function sampleHar(): Har {
  return {
    log: {
      version: "1.2",
      pages: [{ id: "p1", pageTimings: { onContentLoad: 800, onLoad: 1500 } }],
      entries: [
        // A — first-party document, compressed text (40k → 12k = 28k saved)
        entry({
          url: "https://example.com/",
          time: 300,
          _resourceType: "document",
          response: {
            status: 200,
            content: { size: 40000, mimeType: "text/html" },
            _transferSize: 12000,
            headers: [{ name: "Cache-Control", value: "max-age=3600" }],
          },
          timings: { blocked: 5, dns: 10, connect: 20, ssl: 15, send: 1, wait: 100, receive: 149 },
        }),
        // B — third-party script, uncompressed (50k) and no cache headers
        entry({
          url: "https://cdn.other.com/app.js",
          time: 150,
          _resourceType: "script",
          response: { status: 200, content: { size: 50000, mimeType: "application/javascript" }, _transferSize: 50000, headers: [] },
        }),
        // C — third-party image, large, slowest, no cache headers
        entry({
          url: "https://img.cdn.net/hero.png",
          time: 500,
          _resourceType: "image",
          response: { status: 200, content: { size: 600000, mimeType: "image/png" }, _transferSize: 600000, headers: [] },
        }),
        // D — first-party XHR that 404s
        entry({
          url: "https://example.com/api/data",
          time: 50,
          _resourceType: "xhr",
          response: { status: 404, content: { size: 100, mimeType: "application/json" }, _transferSize: 400, headers: [] },
        }),
        // E — first-party redirect (3xx)
        entry({
          url: "https://example.com/old",
          time: 20,
          response: { status: 301, content: { size: 0 }, _transferSize: 200, redirectURL: "/new", headers: [] },
        }),
        // F — first-party CSS served from cache
        entry({
          url: "https://example.com/style.css",
          time: 5,
          response: { status: 200, content: { size: 8000, mimeType: "text/css" }, _transferSize: 0, headers: [] },
          _fromCache: "disk",
        }),
      ],
    },
  };
}

describe("parseHar", () => {
  it("accepts a real HAR log", () => {
    const har = parseHar(JSON.stringify(sampleHar()));
    expect(har.log.entries.length).toBe(6);
  });
  it("rejects non-HAR JSON", () => {
    expect(() => parseHar('{"hello":"world"}')).toThrow(HarParseError);
    expect(() => parseHar("[1,2,3]")).toThrow(/HAR/);
    expect(() => parseHar('{"log":{}}')).toThrow(/entries/);
  });
  it("rejects invalid JSON", () => {
    expect(() => parseHar("not json {")).toThrow(/JSON/);
  });
});

describe("analyzeHar — totals", () => {
  const r = analyzeHar(sampleHar());
  it("counts requests", () => expect(r.totals.requests).toBe(6));
  it("sums transfer bytes", () => expect(r.totals.transferBytes).toBe(12000 + 50000 + 600000 + 400 + 200 + 0));
  it("sums content bytes", () => expect(r.totals.contentBytes).toBe(40000 + 50000 + 600000 + 100 + 0 + 8000));
  it("sums wall time", () => expect(r.totals.wallTimeMs).toBe(1025));
  it("reads page timings", () => {
    expect(r.totals.onContentLoadMs).toBe(800);
    expect(r.totals.onLoadMs).toBe(1500);
  });
  it("detects the first-party document url", () => {
    expect(r.totals.primaryUrl).toBe("https://example.com/");
    expect(r.totals.primaryDomain).toBe("example.com");
  });
});

describe("analyzeHar — orderings", () => {
  const r = analyzeHar(sampleHar());
  it("slowest is sorted by time desc", () => {
    expect(r.slowest[0]!.url).toBe("https://img.cdn.net/hero.png");
    expect(r.slowest.map((s) => s.ms)).toEqual([500, 300, 150, 50, 20, 5]);
  });
  it("largest is sorted by transfer bytes desc", () => {
    expect(r.largest[0]!.url).toBe("https://img.cdn.net/hero.png");
    expect(r.largest[1]!.url).toBe("https://cdn.other.com/app.js");
  });
  it("respects the top option", () => {
    expect(analyzeHar(sampleHar(), { top: 2 }).slowest.length).toBe(2);
  });
});

describe("analyzeHar — breakdowns", () => {
  const r = analyzeHar(sampleHar());
  it("splits first vs third party by domain", () => {
    const example = r.byDomain.find((d) => d.domain === "example.com")!;
    const cdn = r.byDomain.find((d) => d.domain === "cdn.net")!;
    const other = r.byDomain.find((d) => d.domain === "other.com")!;
    expect(example.thirdParty).toBe(false);
    expect(example.count).toBe(4);
    expect(cdn.thirdParty).toBe(true);
    expect(other.thirdParty).toBe(true);
  });
  it("buckets bytes by type", () => {
    const image = r.byType.find((t) => t.category === "image")!;
    const script = r.byType.find((t) => t.category === "script")!;
    expect(image.bytes).toBe(600000);
    expect(image.count).toBe(1);
    expect(script.bytes).toBe(50000);
  });
  it("buckets by status code", () => {
    const b = (name: string) => r.byStatus.find((s) => s.bucket === name);
    expect(b("2xx")!.count).toBe(4);
    expect(b("3xx")!.count).toBe(1);
    expect(b("4xx")!.count).toBe(1);
    expect(b("5xx")).toBeUndefined();
  });
});

describe("analyzeHar — wins & waste", () => {
  const r = analyzeHar(sampleHar());
  it("counts redirects, errors and cache hits", () => {
    expect(r.wins.redirects).toBe(1);
    expect(r.wins.errors).toBe(1);
    expect(r.wins.cacheHits).toBe(1);
  });
  it("sums compression savings on text assets", () => {
    expect(r.wins.compressionSavedBytes).toBe(28000);
  });
  it("aggregates timing phases", () => {
    expect(r.timings.wait).toBe(100);
    expect(r.timings.dns).toBe(10);
    expect(r.timings.receive).toBe(149);
  });
});

describe("analyzeHar — issues", () => {
  const r = analyzeHar(sampleHar());
  it("flags the large image", () => {
    expect(r.issues.some((i) => i.kind === "large-image")).toBe(true);
  });
  it("flags the uncompressed script", () => {
    expect(r.issues.some((i) => i.kind === "uncompressed-text")).toBe(true);
  });
  it("flags assets missing cache headers", () => {
    expect(r.issues.filter((i) => i.kind === "missing-cache-headers").length).toBe(2);
  });
});

describe("pure helpers", () => {
  it("registrableDomain collapses subdomains and known SLDs", () => {
    expect(registrableDomain("img.cdn.net")).toBe("cdn.net");
    expect(registrableDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("example.com")).toBe("example.com");
  });
  it("categoryOf uses resource type then mime/extension", () => {
    expect(categoryOf(entry({ url: "https://x/a.js", _resourceType: "script" }))).toBe("script");
    expect(categoryOf(entry({ url: "https://x/a.css", response: { status: 200, content: { size: 1, mimeType: "text/css" } } }))).toBe("css");
    expect(categoryOf(entry({ url: "https://x/pic", response: { status: 200, content: { size: 1, mimeType: "image/webp" } } }))).toBe("image");
  });
  it("transferBytes falls back to body + headers when no _transferSize", () => {
    const e = entry({ url: "https://x/", response: { status: 200, content: { size: 0 }, bodySize: 1000, headersSize: 200 } });
    expect(transferBytes(e)).toBe(1200);
  });
  it("isCacheHit sees _fromCache and 304", () => {
    expect(isCacheHit(entry({ url: "https://x/", _fromCache: "disk" }))).toBe(true);
    expect(isCacheHit(entry({ url: "https://x/", response: { status: 304, content: { size: 0 } } }))).toBe(true);
    expect(isCacheHit(entry({ url: "https://x/" }))).toBe(false);
  });
  it("fmtBytes is human readable", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(600000)).toContain("KB");
  });
});

describe("formatReport", () => {
  it("renders a sectioned report with all sections", () => {
    const out = formatReport(analyzeHar(sampleHar()), "domain");
    expect(out).toContain("Totals");
    expect(out).toContain("Slowest requests");
    expect(out).toContain("Largest requests");
    expect(out).toContain("By domain");
    expect(out).toContain("Wins & waste");
    expect(out).toContain("Issues");
  });
});
