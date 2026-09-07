/**
 * lacspace-size — measure build-output / bundle size as raw + gzip + brotli,
 * enforce size budgets in CI, and diff against a saved baseline to catch
 * regressions. Zero runtime dependencies: compression is `node:zlib`, the
 * glob/dir-walk and human-size math are hand-written.
 *
 * ```ts
 * import { analyze, evaluateBudgets, parseBudgetSpec, formatSize } from "lacspace-size";
 *
 * const result = analyze(["dist"]);
 * console.log(result.total.files, formatSize(result.total.gzip));
 *
 * const budgets = ["*.js:200kb", "*.css:50kb"].map(parseBudgetSpec);
 * const budgetResults = evaluateBudgets(budgets, result.files, "gzip");
 * const pass = budgetResults.every((b) => b.ok); // gate CI on this
 * ```
 *
 * Everything is synchronous, offline and local — no telemetry, no network.
 */
export { parseSize, formatSize, formatDelta } from "./humansize.js";
export type { FormatSizeOptions } from "./humansize.js";

export { measureBuffer, measureFile, ratio } from "./measure.js";
export type { MeasureOptions, Sizes, FileMeasure } from "./measure.js";

export { isGlob, globToRegExp, matchGlob, walkDir, splitGlobBase, resolveInputs } from "./walk.js";
export type { WalkOptions } from "./walk.js";

export { analyze, pick, extOf, rollupByExtension, sumTotals } from "./analyze.js";
export type { Metric, AnalyzeOptions, AnalyzeResult, Totals, ExtRollup } from "./analyze.js";

export {
  parseBudgetSpec,
  fileMatchesBudget,
  evaluateBudget,
  evaluateBudgets,
  budgetsPass,
} from "./budget.js";
export type { Budget, BudgetResult } from "./budget.js";

export {
  buildBaseline,
  serializeBaseline,
  saveBaseline,
  loadBaseline,
  validateBaseline,
  diffBaseline,
  exceedsMaxIncrease,
  parseMaxIncrease,
} from "./baseline.js";
export type { Baseline, FileDelta, DiffResult, DeltaStatus, IncreaseThreshold } from "./baseline.js";

export { buildJsonReport, toMarkdown, pct } from "./report.js";
export type { ReportContext } from "./report.js";

export { parseConfig, loadConfig } from "./config.js";
export type { SizeConfig } from "./config.js";
