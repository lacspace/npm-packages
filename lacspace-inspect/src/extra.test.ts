import { describe, it, expect } from "vitest";
import { analyzeHtml } from "./checks.js";
import { seoExtraChecks, contentExtraChecks, performanceExtraChecks, securityExtraChecks } from "./extra.js";
import { parseHTML } from "lacspace-scraper";
import type { AnalyzeContext, Finding, Report } from "./types.js";

const HTTPS = "https://example.com/";
const find = (r: Report, id: string): Finding | undefined =>
  r.categories.flatMap((c) => c.findings).find((f) => f.id === id);
const status = (r: Report, id: string): string | undefined => find(r, id)?.status;
const only = (fs: Finding[], id: string): Finding | undefined => fs.find((f) => f.id === id);

describe("seo extras", () => {
  it("flags a charset declared after the first 1024 bytes", () => {
    const pad = "<!-- " + "x".repeat(1100) + " -->";
    const html = `${pad}<meta charset="utf-8"><title>Some ordinary title here</title>`;
    expect(status(analyzeHtml(html, { url: HTTPS }), "seo.charsetPos")).toBe("warn");
  });

  it("passes an early charset and warns on a www/non-www canonical mismatch", () => {
    const root = parseHTML(`<head><meta charset="utf-8"><link rel="canonical" href="https://www.example.com/"></head>`);
    const fs = seoExtraChecks(root, `<meta charset="utf-8"><link rel="canonical" href="https://www.example.com/">`, { url: HTTPS });
    expect(only(fs, "seo.charsetPos")!.status).toBe("ok");
    expect(only(fs, "seo.canonicalHost")!.status).toBe("warn"); // www vs non-www
  });

  it("warns when apple-touch-icon is missing", () => {
    const fs = seoExtraChecks(parseHTML("<head></head>"), "<head></head>", { url: HTTPS });
    expect(only(fs, "seo.appleTouchIcon")!.status).toBe("warn");
  });
});

describe("content extras", () => {
  it("warns on thin content", () => {
    const fs = contentExtraChecks(parseHTML("<body><p>Just a few words here.</p></body>"));
    expect(only(fs, "content.words")!.status).toBe("warn");
  });

  it("fails on duplicate ids", () => {
    const fs = contentExtraChecks(parseHTML(`<div id="main"></div><section id="main"></section>`));
    const f = only(fs, "content.dupid")!;
    expect(f.status).toBe("fail");
    expect(f.detail).toContain("main");
  });
});

describe("performance extras", () => {
  it("grades response time and compression from ctx", () => {
    const ctx: AnalyzeContext = { url: HTTPS, headers: {}, responseTimeMs: 2000, contentEncoding: "br" };
    const fs = performanceExtraChecks(parseHTML("<body></body>"), ctx);
    expect(only(fs, "perf.responseTime")!.status).toBe("fail"); // 2000ms
    expect(only(fs, "perf.compression")!.status).toBe("ok");    // br
  });

  it("warns on images missing dimensions and no lazy loading", () => {
    const many = Array.from({ length: 6 }, (_, i) => `<img src="/${i}.png">`).join("");
    const fs = performanceExtraChecks(parseHTML(many), { url: HTTPS });
    expect(only(fs, "perf.imgDims")!.status).toBe("warn");
    expect(only(fs, "perf.imgLazy")!.status).toBe("warn");
    expect(only(fs, "perf.responseTime")!.status).toBe("info"); // not measured
  });
});

describe("security extras", () => {
  it("warns on external target=_blank without rel=noopener", () => {
    const html = `<a href="https://other.com/x" target="_blank">x</a>`;
    const fs = securityExtraChecks(parseHTML(html), { url: HTTPS });
    expect(only(fs, "sec.noopener")!.status).toBe("warn");
  });

  it("reports http→https redirect from ctx", () => {
    const yes = securityExtraChecks(parseHTML("<a></a>"), { url: HTTPS, httpsRedirect: true });
    const no = securityExtraChecks(parseHTML("<a></a>"), { url: HTTPS, httpsRedirect: false });
    expect(only(yes, "sec.httpsRedirect")!.status).toBe("ok");
    expect(only(no, "sec.httpsRedirect")!.status).toBe("warn");
    // Not probed → info (pure analyzeHtml)
    expect(status(analyzeHtml("<a></a>", { url: HTTPS }), "sec.httpsRedirect")).toBe("info");
  });
});
