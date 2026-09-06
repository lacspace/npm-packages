/**
 * Network orchestration. `inspectUrl` fetches a page (capturing its response
 * headers), runs the pure {@link analyzeHtml} audit, then adds the network-only
 * categories — crawlability (robots.txt + sitemap) and, with `checkLinks`, a
 * bounded, polite broken-link scan — and re-scores the report.
 */
import { fetchPage, fetchRobots, fetchSitemap, parseHTML, extractLinks, crawl } from "lacspace-scraper";
import type {
  AnalyzeContext, Category, CrawlOptions, Finding, InspectOptions, LinkStatus, PageAudit, Report, SiteReport,
} from "./types.js";
import { analyzeHtml } from "./checks.js";
import { gradeOf, makeCategory, overallScore } from "./grade.js";
import { attachFixesToCategories } from "./fixes.js";
import { auditPage, analyzeSite, normUrl } from "./site.js";

const UA = "Mozilla/5.0 (compatible; lacspace-inspect/0.2; +https://developer.lacspace.com/tools/inspect)";
const MAX_BYTES = 5_000_000;

interface MainFetch {
  url: string;
  status: number;
  ok: boolean;
  html: string;
  headers: Record<string, string>;
  responseTimeMs: number;
}

/** Fetch the page and capture its HTML, response headers, status and timing. */
async function fetchMain(url: string, opts: InspectOptions): Promise<MainFetch> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": opts.userAgent ?? UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const responseTimeMs = Date.now() - t0;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
    return { url: res.url || url, status: res.status, ok: res.ok, html, headers, responseTimeMs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort probe: does the plain http:// form of an https page redirect to
 * https? Returns `undefined` when it can't tell. Never throws.
 */
async function probeHttpsRedirect(httpsUrl: string, opts: InspectOptions): Promise<boolean | undefined> {
  let httpUrl: string;
  try {
    const u = new URL(httpsUrl);
    if (u.protocol !== "https:") return undefined;
    u.protocol = "http:";
    httpUrl = u.href;
  } catch {
    return undefined;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(opts.timeout ?? 15000, 8000));
  try {
    const res = await fetch(httpUrl, {
      method: "GET",
      headers: { "user-agent": opts.userAgent ?? UA },
      redirect: "manual",
      signal: ctrl.signal,
    });
    // A manual-redirect response exposes the Location header on 3xx.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "";
      if (/^https:/i.test(loc)) return true;
      try { return new URL(loc, httpUrl).protocol === "https:"; } catch { return false; }
    }
    // Some stacks transparently follow; `res.url` then reveals the final scheme.
    if (res.type === "opaqueredirect") return undefined;
    return /^https:/i.test(res.url) ? true : false;
  } catch {
    return undefined;
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

  const cat = makeCategory("links", "Links", 1.5, findings);
  attachFixesToCategories([cat]);
  return cat;
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

  const cat = makeCategory("crawlability", "Crawlability", 1, findings);
  attachFixesToCategories([cat]);
  return cat;
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

  let httpsRedirect: boolean | undefined;
  if (opts.probeHttpsRedirect !== false && /^https:/i.test(main.url)) {
    httpsRedirect = await probeHttpsRedirect(main.url, opts);
  }

  const ctx: AnalyzeContext = {
    url: main.url,
    headers: main.headers,
    status: main.status,
    responseTimeMs: main.responseTimeMs,
    contentEncoding: main.headers["content-encoding"] ?? "",
    httpsRedirect,
  };

  const report = analyzeHtml(main.html, ctx);

  // Crawlability (network).
  const crawlCat = await crawlabilityCategory(main.url, opts);
  const secIdx = report.categories.findIndex((c) => c.key === "security");
  report.categories.splice(secIdx >= 0 ? secIdx + 1 : report.categories.length, 0, crawlCat);

  // Broken links (network, opt-in) — replace the pure count-only links category.
  if (opts.checkLinks) {
    const linksCat = await checkLinksCategory(main.html, ctx, opts);
    const li = report.categories.findIndex((c) => c.key === "links");
    if (li >= 0) report.categories[li] = linksCat;
    else report.categories.push(linksCat);
  }

  return rescore(report);
}

/** Audit one already-known URL into a {@link PageAudit} (fetch + auditPage). */
async function auditOneUrl(url: string, opts: InspectOptions): Promise<PageAudit | undefined> {
  try {
    const main = await fetchMain(url, opts);
    const ctx: AnalyzeContext = {
      url: main.url,
      headers: main.headers,
      status: main.status,
      responseTimeMs: main.responseTimeMs,
      contentEncoding: main.headers["content-encoding"] ?? "",
    };
    return auditPage(main.html, ctx);
  } catch {
    return undefined;
  }
}

/** Quick status check for an off-crawl internal link target. Never throws. */
async function headStatus(url: string, opts: InspectOptions): Promise<number> {
  try {
    const res = await fetchPage(url, { timeoutMs: opts.timeout ?? 15000, retries: 0, userAgent: opts.userAgent ?? UA });
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Crawl-audit a whole site. Discovers URLs with the lacspace-scraper `crawl`
 * engine (respecting `depth`/`max`/same-origin), audits each discovered page
 * with the same checks as {@link inspectUrl}, then rolls the pages up into a
 * {@link SiteReport} via the pure {@link analyzeSite}. Off-crawl internal link
 * targets are probed so broken internal links are caught site-wide.
 *
 * Please crawl responsibly: this fetches many pages. Keep `max`/`depth` modest
 * and respect each site's Terms and robots policy.
 */
export async function crawlSite(seed: string, opts: CrawlOptions = {}): Promise<SiteReport> {
  const target = /^https?:\/\//i.test(seed) ? seed : `https://${seed}`;
  const max = opts.max ?? 20;
  const depth = opts.depth ?? 2;
  const progress = opts.onProgress ?? (() => {});

  // 1) Discover the URL set with the scraper crawler.
  progress(`discovering pages from ${target} …`);
  const discovered = new Set<string>([normUrl(target)]);
  try {
    const res = await crawl(target, {
      depth,
      limit: max,
      sameOrigin: opts.sameOrigin ?? true,
      auto: { links: true, metadata: true },
      userAgent: opts.userAgent ?? UA,
      timeoutMs: opts.timeout ?? 15000,
      concurrency: opts.concurrency ?? 4,
    });
    for (const rec of res.records) {
      const u = (rec as { url?: string }).url;
      if (typeof u === "string") discovered.add(normUrl(u));
    }
  } catch { /* fall back to just the seed */ }

  const urls = [...discovered].slice(0, max);

  // 2) Audit each discovered page.
  const audits: PageAudit[] = [];
  let done = 0;
  const results = await pool(urls, opts.concurrency ?? 4, async (u) => {
    const a = await auditOneUrl(u, opts);
    progress(`audited ${++done}/${urls.length}: ${u}`);
    return a;
  });
  for (const a of results) if (a) audits.push(a);

  // 3) Probe off-crawl internal link targets so broken links are caught.
  const crawledSet = new Set(audits.map((a) => normUrl(a.url)));
  const offCrawl = new Set<string>();
  for (const a of audits) for (const l of a.internalLinks) if (!crawledSet.has(l)) offCrawl.add(l);
  const extraStatus: Record<string, number> = {};
  if (offCrawl.size > 0) {
    progress(`checking ${offCrawl.size} off-crawl internal link(s) …`);
    const list = [...offCrawl].slice(0, Math.max(50, max * 3));
    const statuses = await pool(list, opts.concurrency ?? 6, (u) => headStatus(u, opts));
    list.forEach((u, i) => { const s = statuses[i]!; if (s > 0) extraStatus[u] = s; });
  }

  return analyzeSite(target, audits, extraStatus);
}
