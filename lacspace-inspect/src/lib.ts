/**
 * lacspace-inspect — one-command website audit. Fetch a URL, parse the HTML, and
 * run categorized checks (SEO/meta, social/Open Graph, structured data, content
 * & accessibility, links, static performance signals, security headers and
 * crawlability), each producing ok/warn/fail findings and a category score, then
 * roll everything up to an overall letter grade A–F. No API keys.
 *
 * ```ts
 * import { inspectUrl, analyzeHtml, gradeOf, formatReport } from "lacspace-inspect";
 *
 * // Network: fetch + analyze + crawlability (+ links with { checkLinks: true }).
 * const report = await inspectUrl("https://example.com");
 * console.log(formatReport(report));
 * if (report.grade > "B") process.exit(1); // simple CI gate
 *
 * // Pure: analyze an HTML string you already have (no network).
 * const r = analyzeHtml("<title>Hi</title>", { url: "https://example.com" });
 * console.log(r.score, gradeOf(r.score));
 * ```
 *
 * Built on the lacspace-scraper engine. Please audit responsibly: it fetches the
 * page (and, with `--links`, a bounded set of its links) — respect each site's
 * Terms and robots policy.
 */
export { inspectUrl, checkLinksCategory, crawlabilityCategory, crawlSite } from "./inspect.js";
export {
  analyzeHtml,
  seoChecks, socialChecks, structuredChecks, contentChecks,
  linkChecks, performanceChecks, securityChecks, detectTech,
} from "./checks.js";
export {
  seoExtraChecks, contentExtraChecks, performanceExtraChecks, securityExtraChecks,
} from "./extra.js";
export { gradeOf, scoreFindings, makeCategory, overallScore } from "./grade.js";
export { formatReport } from "./report.js";
export {
  formatMarkdown, formatHtml, formatSiteReport, formatSiteMarkdown,
  formatLeaderboard, formatRegressions,
} from "./formats.js";
export { FIXES, fixFor, attachFixes, attachFixesToCategories } from "./fixes.js";
export { auditPage, analyzeSite, normUrl } from "./site.js";
export {
  parseBudget, parseBudgetDetailed, evaluateBudget, budgetExceeded, metricValue,
} from "./budget.js";
export { diffReports } from "./baseline.js";
export type {
  Report, Category, CategoryKey, Finding, FindingStatus, Grade,
  AnalyzeContext, InspectOptions, CrawlOptions, LinkStatus,
  PageAudit, SiteReport, Budget, Regression,
} from "./types.js";
