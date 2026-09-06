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
export type {
  Har,
  HarLog,
  HarEntry,
  HarRequest,
  HarResponse,
  HarContent,
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
} from "./types.js";
