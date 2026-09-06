/**
 * Network orchestration. `inspectUrl` fetches a page (capturing its response
 * headers), runs the pure {@link analyzeHtml} audit, then adds the network-only
 * categories — crawlability (robots.txt + sitemap) and, with `checkLinks`, a
 * bounded, polite broken-link scan — and re-scores the report.
 */
import { fetchPage, fetchRobots, fetchSitemap, parseHTML, extractLinks } from "lacspace-scraper";
import type { AnalyzeContext, Category, Finding, InspectOptions, LinkStatus, Report } from "./types.js";
import { analyzeHtml } from "./checks.js";
import { gradeOf, makeCategory, overallScore } from "./grade.js";

const UA = "Mozilla/5.0 (compatible; lacspace-inspect/0.1; +https://developer.lacspace.com/tools/inspect)";
const MAX_BYTES = 5_000_000;

interface MainFetch {
  url: string;
  status: number;
  ok: boolean;
  html: string;
  headers: Record<string, string>;
}

/** Fetch the page and capture BOTH its HTML and its (lower-cased) response headers. */
async function fetchMain(url: string, opts: InspectOptions): Promise<MainFetch> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": opts.userAgent ?? UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
    return { url: res.url || url, status: res.status, ok: res.ok, html, headers };
  } finally {
    clearTimeout(timer);
  }
}

function norm(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href.replace(/\/$/, "");
  } catch {
    return u;
  }
}

/** Check one link's HTTP status via the scraper's fetch engine. Never throws. */
async function checkLink(url: string, opts: InspectOptions): Promise<LinkStatus> {
  try {
    const res = await fetchPage(url, {
      timeoutMs: opts.timeout ?? 15000,
      retries: 0,
      userAgent: opts.userAgent ?? UA,
    });
    return { url, status: res.status, ok: res.ok, redirected: norm(res.url) !== norm(url) };
  } catch (err) {
    return { url, status: 0, ok: false, redirected: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Run a bounded concurrency pool over `items`. */
async function pool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, run));
  return out;
}

/** The broken-link scan → a fresh, graded `links` {@link Category}. */
export async function checkLinksCategory(html: string, ctx: AnalyzeContext, opts: InspectOptions): Promise<Category> {
  const root = parseHTML(html);
  const origin = (() => { try { return new URL(ctx.url).origin; } catch { return undefined; } })();
  const all = extractLinks(root, ctx.url)
    .map((l) => l.href)
    .filter((h) => /^https?:\/\//i.test(h));
  const unique = [...new Set(all)].slice(0, opts.maxLinks ?? 50);

  let internal = 0;
  for (const h of all) { try { if (origin && new URL(h).origin === origin) internal++; } catch { /* ignore */ } }

  const results = await pool(unique, opts.concurrency ?? 6, (u) => checkLink(u, opts));
  const broken = results.filter((r) => !r.ok || r.status >= 400);
  const redirected = results.filter((r) => r.redirected && r.ok);

  const findings: Finding[] = [{
    id: "links.count",
    status: "info",
    message: `${all.length} links — ${internal} internal, ${all.length - internal} external`,
  }];
  findings.push(broken.length === 0
    ? { id: "links.broken", status: "ok", message: `All ${unique.length} checked links resolve`, weight: 2 }
    : { id: "links.broken", status: "fail", message: `${broken.length} broken link(s) (HTTP ≥ 400 or unreachable)`, detail: broken.slice(0, 8).map((b) => `${b.status || "ERR"} ${b.url}`).join("\n"), weight: 2 });
  findings.push(redirected.length === 0
    ? { id: "links.redirects", status: "ok", message: "No redirected links" }
    : { id: "links.redirects", status: "warn", message: `${redirected.length} link(s) redirect`, detail: redirected.slice(0, 8).map((r) => r.url).join("\n") });

  return makeCategory("links", "Links", 1.5, findings);
}

/** The robots.txt + sitemap checks → a graded `crawlability` {@link Category}. */
export async function crawlabilityCategory(pageUrl: string, opts: InspectOptions): Promise<Category> {
  const findings: Finding[] = [];
  let origin: string;
  let pathname = "/";
  try {
    const u = new URL(pageUrl);
    origin = u.origin;
    pathname = u.pathname;
  } catch {
    return makeCategory("crawlability", "Crawlability", 1, [
      { id: "crawl.error", status: "warn", message: "Could not derive an origin for crawlability checks" },
    ]);
  }

  let robotsText = "";
  try {
    const res = await fetchPage(new URL("/robots.txt", origin).href, { timeoutMs: opts.timeout ?? 15000, retries: 0, userAgent: opts.userAgent ?? UA });
    if (res.ok) robotsText = res.html;
  } catch { /* unreachable robots handled below */ }

  findings.push(robotsText.trim()
    ? { id: "crawl.robots", status: "ok", message: "robots.txt is reachable" }
    : { id: "crawl.robots", status: "warn", message: "No robots.txt found" });

  try {
    const robots = await fetchRobots(origin, opts.userAgent ?? UA);
    findings.push(robots.isAllowed(pathname, opts.userAgent ?? UA)
      ? { id: "crawl.allowed", status: "ok", message: "This URL is allowed by robots.txt" }
      : { id: "crawl.allowed", status: "warn", message: "This URL is disallowed by robots.txt" });
  } catch { /* ignore */ }

  const declared = [...robotsText.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  const sitemapUrl = declared[0] ?? new URL("/sitemap.xml", origin).href;
  let urls: string[] = [];
  try {
    urls = await fetchSitemap(sitemapUrl, { timeoutMs: opts.timeout ?? 15000, retries: 0, userAgent: opts.userAgent ?? UA, maxUrls: 5000 });
  } catch { /* ignore */ }
  findings.push(urls.length > 0
    ? { id: "crawl.sitemap", status: "ok", message: `Sitemap reachable (${urls.length} URLs${declared.length ? ", declared in robots.txt" : ""})` }
    : { id: "crawl.sitemap", status: "warn", message: "No sitemap.xml found or it is empty" });

  return makeCategory("crawlability", "Crawlability", 1, findings);
}

/** Recompute every category's derived overall score + grade in place. */
function rescore(report: Report): Report {
  const score = overallScore(report.categories);
  report.score = score;
  report.grade = gradeOf(score);
  return report;
}

/**
 * Fetch a URL and produce a full, graded {@link Report}: the pure HTML audit
 * plus crawlability, and (with `opts.checkLinks`) a bounded broken-link scan.
 */
export async function inspectUrl(url: string, opts: InspectOptions = {}): Promise<Report> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const main = await fetchMain(target, opts);
  const ctx: AnalyzeContext = { url: main.url, headers: main.headers, status: main.status };

  const report = analyzeHtml(main.html, ctx);

  // Crawlability (network).
  const crawl = await crawlabilityCategory(main.url, opts);
  const secIdx = report.categories.findIndex((c) => c.key === "security");
  report.categories.splice(secIdx >= 0 ? secIdx + 1 : report.categories.length, 0, crawl);

  // Broken links (network, opt-in) — replace the pure count-only links category.
  if (opts.checkLinks) {
    const linksCat = await checkLinksCategory(main.html, ctx, opts);
    const li = report.categories.findIndex((c) => c.key === "links");
    if (li >= 0) report.categories[li] = linksCat;
    else report.categories.push(linksCat);
  }

  return rescore(report);
}
