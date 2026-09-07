/**
 * @lacspace/json-repair
 *
 * Extract and repair JSON from messy LLM output. Zero-dependency, isomorphic,
 * fully typed.
 *
 * - {@link extractJson}  — pull the JSON out of prose / ```json fences.
 * - {@link repairJson}   — fix trailing commas, single quotes, unquoted keys,
 *                          Python literals, comments, missing commas, truncation.
 * - {@link parseJson}    — extract + repair + parse, with optional fallback.
 * - {@link safeParseJson}— the never-throwing variant.
 * - {@link parsePartial} — best-effort parse of incomplete / streaming JSON.
 */

export { extractJson } from "./scanner.js";
export { repairJson, lenientParse } from "./repair.js";
export {
  parseJson,
  safeParseJson,
  parsePartial,
  JsonRepairError,
  type ParseJsonOptions,
  type SafeParseResult,
} from "./parse.js";
