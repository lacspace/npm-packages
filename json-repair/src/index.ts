/**
 * @lacspace/json-repair
 *
 * Extract and repair JSON from messy LLM output. Zero-dependency, isomorphic,
 * fully typed.
 *
 * - {@link extractJson}  — pull the JSON out of prose / ```json fences.
 * - {@link extractAllJson} — pull EVERY JSON value out of prose / fences.
 * - {@link repairJson}   — fix trailing commas, single quotes, unquoted keys,
 *                          Python literals, comments, missing commas, truncation.
 * - {@link repairJsonWithDiagnostics} — repair AND report what was wrong.
 * - {@link diagnoseJson} — list the malformations in a JSON-ish string.
 * - {@link parseJson}    — extract + repair + parse, with optional fallback.
 * - {@link parseAllJson} — extract + repair + parse EVERY embedded value.
 * - {@link safeParseJson}— the never-throwing variant.
 * - {@link parsePartial} — best-effort parse of incomplete / streaming JSON.
 */

export { extractJson } from "./scanner.js";
export { extractAllJson, parseAllJson } from "./extract-all.js";
export { repairJson, lenientParse } from "./repair.js";
export {
  diagnoseJson,
  repairJsonWithDiagnostics,
  type JsonIssue,
  type JsonIssueKind,
  type RepairDiagnostics,
} from "./diagnostics.js";
export {
  parseJson,
  safeParseJson,
  parsePartial,
  JsonRepairError,
  type ParseJsonOptions,
  type SafeParseResult,
} from "./parse.js";
