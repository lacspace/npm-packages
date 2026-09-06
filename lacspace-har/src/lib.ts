/**
 * lacspace-har — read a browser `.har` export offline and turn it into a
 * performance report: waterfall totals, the slowest and largest requests,
 * third-party and MIME breakdowns, cache and compression wins, and a set of
 * flagged issues. Zero dependencies, pure functions.
 *
 * ```ts
 * import { parseHar, analyzeHar, formatReport } from "lacspace-har";
 * import { readFileSync } from "node:fs";
 *
 * const har = parseHar(readFileSync("session.har", "utf8"));
 * const report = analyzeHar(har, { top: 10 });
 * console.log(formatReport(report));
 * console.log(report.totals.transferBytes, "bytes over the wire");
 * ```
 */
export { parseHar, HarParseError } from "./parse.js";
export {
  analyzeHar,
  transferBytes,
  contentBytes,
  categoryOf,
  hostOf,
  registrableDomain,
  isCacheHit,
  fmtBytes,
  THRESHOLDS,
} from "./analyze.js";
export { formatReport } from "./report.js";
export type { FormatOptions } from "./report.js";

// v0.2 — timeline & waterfall
export { buildTimeline } from "./timeline.js";
export { toWaterfall } from "./waterfall.js";
export { toHtml } from "./html.js";

// v0.2 — diff, budgets, filter, recommendations, vitals, redact, export
export { diffHars, formatDiff } from "./diff.js";
export { budgetCheck, parseBudget, actualFor } from "./budget.js";
export { filterEntries, parseFilter, matchRule, parseSize } from "./filter.js";
export { recommend } from "./recommend.js";
export { estimateVitals } from "./vitals.js";
export { redactHar } from "./redact.js";
export { exportRequests, summarize } from "./export.js";
export type { ExportRow } from "./export.js";

export type {
  Har,
  HarLog,
  HarEntry,
  HarRequest,
  HarResponse,
  HarContent,
  HarCookie,
  HarPostData,
  HarTimings,
  HarPage,
  HarPageTimings,
  HarNameValue,
  HarReport,
  RequestSummary,
  TypeBreakdown,
  DomainBreakdown,
  StatusBucket,
  TimingPhases,
  Issue,
  ResourceCategory,
  AnalyzeOptions,
  // v0.2
  TimelineRow,
  Timeline,
  WaterfallOptions,
  HtmlOptions,
  VitalsEstimate,
  Recommendation,
  RecommendOptions,
  MetricDelta,
  TypeDelta,
  DomainDelta,
  RequestChange,
  HarDiff,
  DiffOptions,
  BudgetKey,
  BudgetRule,
  BudgetCheckItem,
  BudgetResult,
  FilterOp,
  FilterRule,
  RedactOptions,
  ExportOptions,
} from "./types.js";
