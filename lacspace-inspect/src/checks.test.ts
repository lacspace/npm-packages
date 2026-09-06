import { describe, it, expect } from "vitest";
import { analyzeHtml } from "./checks.js";
import type { Finding, Report } from "./types.js";

const HTTPS = "https://example.com/";

function find(report: Report, id: string): Finding | undefined {
  for (const cat of report.categories) {
    const f = cat.findings.find((x) => x.id === id);
    if (f) return f;
  }
  return undefined;
}
function status(report: Report, id: string): string | undefined {
  return find(report, id)?.status;
}

describe("SEO / meta", () => {
  it("fails when the title is missing", () => {
    const r = analyzeHtml("<html><body><p>hi</p></body></html>", { url: HTTPS });
    expect(status(r, "seo.title")).toBe("fail");
  });

  it("passes a good title and description", () => {
    const html = `<html lang="en"><head>
      <title>A Perfectly Reasonable Page Title</title>
      <meta name="description" content="This description is comfortably within the fifty to one hundred sixty character sweet spot for search snippets.">
    </head><body></body></html>`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(status(r, "seo.title")).toBe("ok");
    expect(status(r, "seo.description")).toBe("ok");
    expect(status(r, "seo.lang")).toBe("ok");
  });

  it("warns on a too-short title", () => {
    const r = analyzeHtml("<title>Hi</title>", { url: HTTPS });
    expect(status(r, "seo.title")).toBe("warn");
  });

  it("fails when the mobile viewport meta is missing", () => {
    const r = analyzeHtml("<title>Some Ordinary Page</title>", { url: HTTPS });
    expect(status(r, "seo.viewport")).toBe("fail");
  });
});

describe("content & accessibility", () => {
  it("fails on multiple <h1>", () => {
    const r = analyzeHtml("<h1>One</h1><h1>Two</h1>", { url: HTTPS });
    expect(status(r, "content.h1")).toBe("fail");
  });

  it("passes exactly one <h1>", () => {
    const r = analyzeHtml("<h1>The One True Heading</h1>", { url: HTTPS });
    expect(status(r, "content.h1")).toBe("ok");
  });

  it("counts images missing alt text (fails when most lack alt)", () => {
    const html = `<h1>x</h1><img src="/a.png"><img src="/b.png" alt="b"><img src="/c.png">`;
    const r = analyzeHtml(html, { url: HTTPS });
    const f = find(r, "content.alt")!;
    expect(f.status).toBe("fail"); // 2 of 3 missing = 67% > 50%
    expect(f.message).toContain("2/3");
  });

  it("warns (not fails) when only a minority of images lack alt", () => {
    const html = `<h1>x</h1><img src="/a.png" alt="a"><img src="/b.png" alt="b"><img src="/c.png">`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(find(r, "content.alt")!.status).toBe("warn"); // 1 of 3 = 33%
  });
});

describe("social / Open Graph", () => {
  it("passes when Open Graph is complete", () => {
    const html = `
      <meta property="og:title" content="T">
      <meta property="og:description" content="D">
      <meta property="og:image" content="https://x/i.png">
      <meta property="og:url" content="https://x/">
      <meta property="og:type" content="website">`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(status(r, "social.og")).toBe("ok");
  });

  it("warns when Open Graph is incomplete", () => {
    const html = `<meta property="og:title" content="T">`;
    const r = analyzeHtml(html, { url: HTTPS });
    const f = find(r, "social.og")!;
    expect(f.status).toBe("warn");
    expect(f.message).toContain("og:image");
  });
});

describe("structured data", () => {
  it("passes valid JSON-LD with an @type", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(status(r, "structured.valid")).toBe("ok");
    expect(status(r, "structured.type")).toBe("ok");
    expect(find(r, "structured.type")!.message).toContain("Organization");
  });

  it("warns when no structured data is present", () => {
    const r = analyzeHtml("<h1>x</h1>", { url: HTTPS });
    expect(status(r, "structured.present")).toBe("warn");
  });

  it("fails on malformed JSON-LD", () => {
    const html = `<script type="application/ld+json">{ not valid json }</script>`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(status(r, "structured.valid")).toBe("fail");
  });
});

describe("security", () => {
  it("detects mixed content on an HTTPS page", () => {
    const html = `<img src="http://insecure.example/pixel.png">`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(status(r, "sec.mixed")).toBe("fail");
    expect(status(r, "sec.https")).toBe("ok");
  });

  it("reports no mixed content when subresources are HTTPS", () => {
    const html = `<img src="https://secure.example/pixel.png"><script src="https://secure.example/a.js"></script>`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(status(r, "sec.mixed")).toBe("ok");
  });

  it("fails HTTPS when served over http", () => {
    const r = analyzeHtml("<h1>x</h1>", { url: "http://example.com/" });
    expect(status(r, "sec.https")).toBe("fail");
  });

  it("grades response security headers from ctx.headers", () => {
    const r = analyzeHtml("<h1>x</h1>", {
      url: HTTPS,
      headers: {
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
      },
    });
    expect(status(r, "sec.csp")).toBe("ok");
    expect(status(r, "sec.xcto")).toBe("ok");
    expect(status(r, "sec.frame")).toBe("ok"); // via CSP frame-ancestors
    expect(status(r, "sec.hsts")).toBe("warn"); // missing
    expect(status(r, "sec.referrer")).toBe("warn"); // missing
  });

  it("skips header checks when no headers are supplied", () => {
    const r = analyzeHtml("<h1>x</h1>", { url: HTTPS });
    expect(status(r, "sec.headers")).toBe("info");
  });
});

describe("links + tech + overall", () => {
  it("counts internal vs external links", () => {
    const html = `<a href="/about">a</a><a href="https://other.com/x">b</a>`;
    const r = analyzeHtml(html, { url: HTTPS });
    const f = find(r, "links.count")!;
    expect(f.message).toContain("1 internal");
    expect(f.message).toContain("1 external");
    expect(r.stats.internalLinks).toBe(1);
    expect(r.stats.externalLinks).toBe(1);
  });

  it("detects the tech stack informationally", () => {
    const html = `<meta name="generator" content="WordPress 6.5"><script src="/wp-content/x.js"></script>`;
    const r = analyzeHtml(html, { url: HTTPS });
    expect(r.tech).toContain("WordPress");
  });

  it("produces an overall score and grade", () => {
    const r = analyzeHtml("<h1>x</h1>", { url: HTTPS });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D", "F"]).toContain(r.grade);
    expect(r.categories.length).toBeGreaterThan(5);
  });
});
