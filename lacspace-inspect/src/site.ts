/**
 * Whole-site analysis. {@link auditPage} turns one page's HTML into a
 * {@link PageAudit} (its graded {@link Report} plus its internal/external link
 * targets and title/description) — **pure**, no network. {@link analyzeSite}
 * rolls a set of PageAudits up into a {@link SiteReport}: a grade leaderboard, a
 * site average, the worst pages, the most common issues, and the two site-wide
 * problems a per-page audit can't see — duplicate titles/descriptions and
 * broken *internal* links. Both are pure and unit-testable on fixtures.
 */
import { parseHTML, extractLinks } from "lacspace-scraper";
import type { AnalyzeContext, Finding, Grade, PageAudit, Report, SiteReport } from "./types.js";
import { analyzeHtml } from "./checks.js";
import { gradeOf } from "./grade.js";

/** Normalize a URL for cross-page comparison: drop hash, trailing slash, lowercase host. */
export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    x.host = x.host.toLowerCase();
    let href = x.href;
    if (href.endsWith("/") && x.pathname !== "/") href = href.slice(0, -1);
    return href;
  } catch {
    return u;
  }
}

/** Build a {@link PageAudit} from HTML. Pure — wraps {@link analyzeHtml}. */
export function auditPage(html: string, ctx: AnalyzeContext): PageAudit {
  const report = analyzeHtml(html, ctx);
  const root = parseHTML(html);
  const origin = (() => { try { return new URL(ctx.url).origin; } catch { return undefined; } })();
  const internal: string[] = [];
  const external: string[] = [];
  for (const l of extractLinks(root, ctx.url)) {
    if (!/^https?:\/\//i.test(l.href)) continue;
    let o: string | undefined;
    try { o = new URL(l.href).origin; } catch { /* ignore */ }
    (origin && o === origin ? internal : external).push(normUrl(l.href));
  }
  const audit: PageAudit = {
    url: ctx.url,
    report,
    internalLinks: [...new Set(internal)],
    externalLinks: [...new Set(external)],
  };
  if (report.stats.title) audit.title = report.stats.title;
  if (report.stats.metaDescription) audit.metaDescription = report.stats.metaDescription;
  if (ctx.status !== undefined) audit.httpStatus = ctx.status;
  return audit;
}

function dupGroups(pairs: { url: string; value: string | undefined }[]): { value: string; urls: string[] }[] {
  const map = new Map<string, string[]>();
  for (const { url, value } of pairs) {
    const v = (value ?? "").trim();
    if (!v) continue;
    (map.get(v) ?? map.set(v, []).get(v)!).push(url);
  }
  return [...map.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }))
    .sort((a, b) => b.urls.length - a.urls.length);
}

/**
 * Roll a set of page audits into a {@link SiteReport}. Pure.
 *
 * @param extraStatus optional map of normalized-URL → HTTP status for internal
 *        link targets that weren't themselves crawled (the network layer fills
 *        this by probing off-crawl internal links) — used to widen the
 *        broken-internal-link detection.
 */
export function analyzeSite(seed: string, pages: PageAudit[], extraStatus?: Record<string, number>): SiteReport {
  const entries = pages.map((p) => ({ url: p.url, score: p.report.score, grade: p.report.grade }));
  const leaderboard = [...entries].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  const worst = [...entries].sort((a, b) => a.score - b.score || a.url.localeCompare(b.url)).slice(0, 5);

  const averageScore = pages.length
    ? Math.round(pages.reduce((s, p) => s + p.report.score, 0) / pages.length)
    : 100;
  const averageGrade: Grade = gradeOf(averageScore);

  // Most common warn/fail findings across the site.
  const issueCount = new Map<string, { id: string; message: string; status: Finding["status"]; count: number }>();
  for (const p of pages) {
    for (const c of p.report.categories) {
      for (const f of c.findings) {
        if (f.status !== "warn" && f.status !== "fail") continue;
        const cur = issueCount.get(f.id);
        if (cur) cur.count++;
        else issueCount.set(f.id, { id: f.id, message: f.message, status: f.status, count: 1 });
      }
    }
  }
  const commonIssues = [...issueCount.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  const duplicateTitles = dupGroups(pages.map((p) => ({ url: p.url, value: p.title })));
  const duplicateDescriptions = dupGroups(pages.map((p) => ({ url: p.url, value: p.metaDescription })));

  // Broken internal links: an internal link whose target is a crawled page that returned HTTP ≥ 400.
  const statusByUrl = new Map<string, number>();
  for (const p of pages) if (typeof p.httpStatus === "number") statusByUrl.set(normUrl(p.url), p.httpStatus);
  if (extraStatus) for (const [u, st] of Object.entries(extraStatus)) statusByUrl.set(normUrl(u), st);
  const brokenInternalLinks: { from: string; to: string; status: number }[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    for (const to of p.internalLinks) {
      const st = statusByUrl.get(to);
      if (st !== undefined && st >= 400) {
        const key = `${p.url}→${to}`;
        if (!seen.has(key)) { seen.add(key); brokenInternalLinks.push({ from: p.url, to, status: st }); }
      }
    }
  }

  return {
    seed,
    pageCount: pages.length,
    averageScore,
    averageGrade,
    leaderboard,
    worst,
    commonIssues,
    duplicateTitles,
    duplicateDescriptions,
    brokenInternalLinks,
  };
}
