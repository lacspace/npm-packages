/**
 * lacspace-monitor — watch web pages, CSS selectors, JSON API fields and RSS/
 * Atom feeds for changes, on a schedule. Snapshots + diffs, webhook alerts,
 * export to JSON/CSV/Excel. Built on the lacspace-scraper engine. No API keys.
 *
 * ```ts
 * import { runChecks, loadState, saveState } from "lacspace-monitor";
 *
 * const state = loadState(".lacspace-monitor.json");
 * const { results, state: next } = await runChecks(
 *   [{ url: "https://example.com", selector: "h1", label: "Homepage title" }],
 *   state,
 * );
 * saveState(".lacspace-monitor.json", next);
 * ```
 *
 * Please monitor responsibly: keep intervals sane, respect each site's Terms and
 * robots policy, and don't hammer servers.
 */
export { checkWatch, runChecks, loadState, saveState, sendWebhook, type CheckOptions } from "./check.js";
export {
  hashValue, getByPath, toValueString, feedItemIds, inferType, watchId,
  snapshotValue, snapshotItems, diffSnapshots, retainHistory,
  // condition evaluator
  parseCondition, parseNumeric, evalCondition, evalWhen,
  type Condition, type ConditionOp, type ConditionContext,
  // richer diffs
  lineDiff, wordDiff, jsonDiff, type DiffOp, type JsonChange,
  // ssl
  sslDaysUntil,
} from "./core.js";
export {
  notify, changeSummary,
  formatText, formatSlack, formatDiscord, formatTelegram, formatEmail,
  sendWebhookPayload, sendSlack, sendDiscord, sendTelegram, sendEmail,
} from "./notify.js";
export {
  appendHistory, readHistory, summarizeHistory, resultToHistory,
  type HistorySummary,
} from "./history.js";
export type {
  Watch, WatchType, Snapshot, CheckResult, MonitorState, MonitorConfig,
  NotifyChannel, SmtpConfig, HistoryEntry,
} from "./types.js";
