/**
 * @lacspace/match — safe, generic condition evaluator for rules, filters and
 * automations. Zero dependencies, isomorphic.
 */

export { evaluate, explain, compare, OPS } from "./evaluate";
export type { Op, Condition, MatchOptions, ConditionResult, Explanation } from "./evaluate";
export { validateConditions } from "./validate";
export type { ValidationError, ValidateOptions } from "./validate";
export { getPath, splitPath, isSafePath } from "./path";
export { checkPattern, compileSafe, testCapped, DEFAULT_MAX_PATTERN_LENGTH, DEFAULT_MAX_INPUT_LENGTH } from "./regex";
export type { SafeRegexOptions } from "./regex";
