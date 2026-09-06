import { describe, it, expect } from "vitest";
import type { Har, HarEntry } from "./types.js";
import { analyzeHar } from "./analyze.js";
import { buildTimeline } from "./timeline.js";
import { toWaterfall } from "./waterfall.js";
import { toHtml } from "./html.js";
import { diffHars, formatDiff } from "./diff.js";
import { budgetCheck, parseBudget, actualFor } from "./budget.js";
import { filterEntries, parseFilter, parseSize, matchRule } from "./filter.js";
import { recommend } from "./recommend.js";
import { estimateVitals } from "./vitals.js";
import { redactHar } from "./redact.js";
import { exportRequests, summarize } from "./export.js";

/** Build a synthetic HAR entry with sensible defaults + startedDateTime. */
function entry(p: Partial<HarEntry> & { url: string; startMs?: number }): HarEntry {
  const { url, request, response, startMs = 0, ...rest } = p;
  return {
    startedDateTime: new Date(1_700_000_000_000 + startMs).toISOString(),
    time: 0,
    request: { method: "GET", url, headers: [], ...request },
    response: { status: 200, content: { size: 0, mimeType: "" }, headers: [], ...response },
    ...rest,
  };
}

/** A realistic session with phases, domains, types, cache + compression. */
function sampleHar(): Har {
  return {
    log: {
      version: "1.2",
      pages: [{ id: "p1", pageTimings: { onContentLoad: 900, onLoad: 1800 } }],
      entries: [
        entry({
          url: "https://example.com/", startMs: 0, time: 320, _resourceType: "document",
          response: { status: 200, content: { size: 42000, mimeType: "text/html" }, _transferSize: 12000, headers: [{ name: "Cache-Control", value: "max-age=60" }] },
          timings: { blocked: 5, dns: 12, connect: 25, ssl: 18, send: 2, wait: 180, receive: 78 },
        }),
        entry({
          url: "https://example.com/app.js", startMs: 340, time: 240, _resourceType: "script",
          response: { status: 200, content: { size: 180000, mimeType: "application/javascript" }, _transferSize: 180000, headers: [] },
          timings: { blocked: 2, dns: 0, connect: 0, ssl: 0, send: 1, wait: 60, receive: 177 },
        }),
        entry({
          url: "https://img.cdn.net/hero.png", startMs: 600, time: 540, _resourceType: "image",
          response: { status: 200, content: { size: 820000, mimeType: "image/png" }, _transferSize: 820000, headers: [] },
          timings: { blocked: 3, dns: 8, connect: 16, ssl: 12, send: 1, wait: 90, receive: 410 },
        }),
        entry({
          url: "https://example.com/api/data?token=SECRET123&q=hi", startMs: 700, time: 60, _resourceType: "xhr",
          request: {
            method: "POST", url: "https://example.com/api/data?token=SECRET123&q=hi",
            headers: [{ name: "Authorization", value: "Bearer abc.def" }, { name: "Cookie", value: "sid=xyz" }, { name: "Accept", value: "*/*" }],
            queryString: [{ name: "token", value: "SECRET123" }, { name: "q", value: "hi" }],
            cookies: [{ name: "sid", value: "xyz" }],
            postData: { mimeType: "application/json", text: "{\"password\":\"p@ss\"}" },
          },
          response: { status: 500, content: { size: 1200, mimeType: "application/json", text: "err" }, _transferSize: 1600, headers: [{ name: "Set-Cookie", value: "sid=abc" }] },
        }),
      ],
    },
  };
}

/** An "after" HAR: image optimized, script compressed, xhr gone. */
function optimizedHar(): Har {
  return {
    log: {
      version: "1.2",
      entries: [
        entry({
          url: "https://example.com/", startMs: 0, time: 300, _resourceType: "document",
          response: { status: 200, content: { size: 42000, mimeType: "text/html" }, _transferSize: 11000, headers: [] },
          timings: { blocked: 5, dns: 12, connect: 25, ssl: 18, send: 2, wait: 160, receive: 78 },
        }),
        entry({
          url: "https://example.com/app.js", startMs: 330, time: 130, _resourceType: "script",
          response: { status: 200, content: { size: 180000, mimeType: "application/javascript" }, _transferSize: 52000, headers: [{ name: "Cache-Control", value: "max-age=31536000" }] },
          timings: { blocked: 2, dns: 0, connect: 0, ssl: 0, send: 1, wait: 40, receive: 87 },
        }),
        entry({
          url: "https://img.cdn.net/hero.webp", startMs: 560, time: 180, _resourceType: "image",
          response: { status: 200, content: { size: 190000, mimeType: "image/webp" }, _transferSize: 190000, headers: [] },
          timings: { blocked: 3, dns: 8, connect: 16, ssl: 12, send: 1, wait: 60, receive: 80 },
        }),
      ],
    },
  };
}

// ── timeline ─────────────────────────────────────────────────────────────────
describe("buildTimeline", () => {
  const { rows, spanMs } = buildTimeline(sampleHar());
  it("positions requests by startedDateTime", () => {
    expect(rows[0]!.startMs).toBe(0);
    expect(rows[1]!.startMs).toBe(340);
    expect(rows[2]!.startMs).toBe(600);
  });
  it("computes a wall-clock span (max endMs)", () => {
    expect(spanMs).toBe(600 + 540); // hero.png starts at 600, takes 540
  });
  it("falls back to sequential layout when dates are missing", () => {
    const har: Har = { log: { entries: [
      { time: 100, request: { method: "GET", url: "https://a/1" }, response: { status: 200, content: { size: 0 } } },
      { time: 50, request: { method: "GET", url: "https://a/2" }, response: { status: 200, content: { size: 0 } } },
    ] } };
    const t = buildTimeline(har);
    expect(t.rows[0]!.startMs).toBe(0);
    expect(t.rows[1]!.startMs).toBe(100);
  });
});

// ── waterfall ─────────────────────────────────────────────────────────────────
describe("toWaterfall", () => {
  it("renders a bar per request with a legend", () => {
    const out = toWaterfall(sampleHar(), { color: false, width: 30 });
    expect(out).toContain("Waterfall");
    expect(out).toContain("example.com/");
    expect(out).toContain("blocked");
    expect(out).toContain("wait (TTFB)");
    // one row line per request (status shown)
    expect(out.split("\n").filter((l) => /\b(200|500)\b/.test(l)).length).toBe(4);
  });
  it("honors top and sort", () => {
    const out = toWaterfall(sampleHar(), { color: false, top: 2, sort: "time" });
    const rows = out.split("\n").filter((l) => /\b(200|500)\b/.test(l));
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain("hero.png"); // slowest first
  });
});

// ── html ──────────────────────────────────────────────────────────────────────
describe("toHtml", () => {
  const report = analyzeHar(sampleHar());
  report.vitals = estimateVitals(sampleHar());
  const html = toHtml(report, sampleHar());
  it("is a self-contained document with a visual waterfall", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).not.toContain("<script"); // no external/inline scripts needed
    expect(html).toContain('class="seg"');
    expect(html).toContain("Waterfall");
  });
  it("escapes URLs and includes breakdown + vitals sections", () => {
    expect(html).toContain("Breakdowns");
    expect(html).toContain("Estimates");
    expect(html).not.toContain("<script>alert");
  });
});

// ── diff ──────────────────────────────────────────────────────────────────────
describe("diffHars", () => {
  const diff = diffHars(sampleHar(), optimizedHar());
  it("computes signed metric deltas", () => {
    expect(diff.requests.delta).toBe(-1);
    expect(diff.transferBytes.delta).toBeLessThan(0);
    expect(diff.wallTimeMs.before).toBeGreaterThan(diff.wallTimeMs.after);
  });
  it("classifies added / removed / faster", () => {
    expect(diff.added.some((r) => r.url.includes("hero.webp"))).toBe(true);
    expect(diff.removed.some((r) => r.url.includes("hero.png"))).toBe(true);
    expect(diff.removed.some((r) => r.url.includes("api/data"))).toBe(true);
    expect(diff.faster.some((r) => r.url.includes("app.js"))).toBe(true);
  });
  it("formats a readable diff", () => {
    const out = formatDiff(diff, { color: false });
    expect(out).toContain("lacspace-har diff");
    expect(out).toContain("Totals");
    expect(out).toContain("Faster");
  });
});

// ── budgets ───────────────────────────────────────────────────────────────────
describe("budgetCheck", () => {
  const report = analyzeHar(sampleHar());
  it("parses a spec and passes/fails per metric", () => {
    const res = budgetCheck(report, "js<100kb,requests<50,total<2mb");
    expect(res.pass).toBe(false);
    const js = res.items.find((i) => i.rule.key === "js")!;
    expect(js.pass).toBe(false);
    expect(res.items.find((i) => i.rule.key === "requests")!.pass).toBe(true);
  });
  it("passes when everything is within budget", () => {
    const res = budgetCheck(report, "js<500kb,images<1mb,requests<10,total<2mb");
    expect(res.pass).toBe(true);
  });
  it("maps keys to the right measured values", () => {
    expect(actualFor(report, "requests")).toBe(4);
    expect(actualFor(report, "total")).toBe(report.totals.transferBytes);
    expect(actualFor(report, "thirdparty")).toBe(1); // only img.cdn.net
    expect(parseBudget("images<=500kb")[0]!.limit).toBe(500 * 1024);
  });
});

// ── filter ────────────────────────────────────────────────────────────────────
describe("filterEntries", () => {
  it("parses sizes and clauses", () => {
    expect(parseSize("100kb")).toBe(102400);
    expect(parseSize("2mb")).toBe(2 * 1024 * 1024);
    expect(parseFilter("type=image,size>100kb").length).toBe(2);
  });
  it("keeps only matching entries (AND across clauses)", () => {
    const only = filterEntries(sampleHar(), "type=image,size>100kb");
    expect(only.log.entries.length).toBe(1);
    expect(only.log.entries[0]!.request.url).toContain("hero.png");
  });
  it("supports status, domain and url operators", () => {
    expect(filterEntries(sampleHar(), "status>=400").log.entries.length).toBe(1);
    expect(filterEntries(sampleHar(), "domain=cdn.net").log.entries.length).toBe(1);
    expect(filterEntries(sampleHar(), "url~=/api/").log.entries.length).toBe(1);
    const e = sampleHar().log.entries[0]!;
    expect(matchRule(e, parseFilter("method=GET")[0]!)).toBe(true);
  });
});

// ── recommendations ───────────────────────────────────────────────────────────
describe("recommend", () => {
  const recs = recommend(sampleHar());
  it("flags compressible text, oversized images and missing cache headers with savings", () => {
    expect(recs.some((r) => r.kind === "compress-text" && (r.savingBytes ?? 0) > 0)).toBe(true);
    expect(recs.some((r) => r.kind === "resize-image" && (r.savingBytes ?? 0) > 0)).toBe(true);
    expect(recs.some((r) => r.kind === "cache-headers")).toBe(true);
  });
  it("sorts by impact (largest saving first)", () => {
    const bytesSavings = recs.map((r) => (r.savingBytes ?? 0) + (r.savingMs ?? 0) * 1024);
    const sorted = [...bytesSavings].sort((a, b) => b - a);
    expect(bytesSavings).toEqual(sorted);
  });
});

// ── vitals ────────────────────────────────────────────────────────────────────
describe("estimateVitals", () => {
  const v = estimateVitals(sampleHar());
  it("derives TTFB from the document, an LCP candidate and download time", () => {
    // TTFB = setup (5+12+25+18+2) + wait 180 = 242
    expect(v.ttfbMs).toBe(242);
    expect(v.lcpCandidateUrl).toContain("hero.png"); // largest eligible resource
    expect(v.totalDownloadMs).toBeGreaterThan(0);
  });
  it("labels itself as derived, not measured", () => {
    expect(v.note.toLowerCase()).toContain("not field metrics");
    expect(typeof v.renderBlocking).toBe("number");
  });
});

// ── redact ────────────────────────────────────────────────────────────────────
describe("redactHar", () => {
  const safe = redactHar(sampleHar());
  const xhr = safe.log.entries[3]!;
  it("strips cookies, auth headers, query tokens and bodies", () => {
    const auth = xhr.request.headers!.find((h) => h.name === "Authorization")!;
    expect(auth.value).toBe("[redacted]");
    const cookie = xhr.request.headers!.find((h) => h.name === "Cookie")!;
    expect(cookie.value).toBe("[redacted]");
    expect(xhr.request.url).toContain("token=[redacted]");
    expect(xhr.request.url).toContain("q=hi"); // non-secret param kept
    expect((xhr.request as { postData?: { text?: string } }).postData!.text).toBe("[redacted]");
    expect(xhr.response.content!.text).toBe("[redacted]");
  });
  it("does not mutate the input HAR", () => {
    const src = sampleHar();
    redactHar(src);
    expect(src.log.entries[3]!.request.headers!.find((h) => h.name === "Cookie")!.value).toBe("sid=xyz");
  });
  it("can keep bodies when asked", () => {
    const kept = redactHar(sampleHar(), { keepBodies: true });
    expect(kept.log.entries[3]!.response.content!.text).toBe("err");
  });
});

// ── export ────────────────────────────────────────────────────────────────────
describe("exportRequests", () => {
  it("emits a CSV header + one row per request", () => {
    const csv = exportRequests(sampleHar(), "csv");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("method,status,category");
    expect(lines.length).toBe(1 + 4);
    expect(csv).toContain("hero.png");
  });
  it("emits JSON rows and quotes CSV fields containing commas", () => {
    const rows = summarize(sampleHar());
    expect(rows.length).toBe(4);
    const json = JSON.parse(exportRequests(sampleHar(), "json"));
    expect(json[0]).toHaveProperty("bytes");
    // A URL containing a comma must be wrapped in quotes.
    const har: Har = { log: { entries: [entry({ url: "https://x/path,with,commas" })] } };
    expect(exportRequests(har, "csv")).toContain('"https://x/path,with,commas"');
  });
});
