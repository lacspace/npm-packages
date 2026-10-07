/**
 * @lacspace/mail-search — Gmail-style search operators parsed into a neutral AST,
 * plus a round-trip formatter and an in-memory evaluator. Zero dependencies, isomorphic.
 */

export { parseSearch, parseDay, parseSize, subtractPeriod, IS_VALUES, HAS_VALUES, OPERATORS } from "./parse";
export type { SearchAst, SearchClause, SearchField, SearchOp, ParseOptions } from "./parse";
export { toQueryString, clauseToString } from "./format";
export { matchesAst, defaultAccessor } from "./match";
export type { Accessor } from "./match";

/** The operators, as `[example, description]` pairs for a search help popover. */
export const SEARCH_HELP: ReadonlyArray<readonly [string, string]> = [
  ["from:anita", "Sender name or address"],
  ["to:sales@", "Recipient (also cc:)"],
  ["subject:invoice", "Words in the subject"],
  ["has:attachment", "Only mail with files"],
  ["filename:pdf", "Attachment name"],
  ["is:unread", "Also is:read, is:starred, is:replied, is:important"],
  ["is:suspicious", "Looks risky (also is:verified, is:list)"],
  ["in:inbox", "A folder"],
  ["label:client", "Your labels"],
  ["category:finance", "A smart category"],
  ["after:2026-09-01", "Also before:, YYYY/MM/DD, today, 7d / 2w / 3m"],
  ["newer_than:7d", "Also older_than:, with d / w / m / y"],
  ["larger:5M", "Also smaller:, with K / M / G"],
  ['"exact phrase"', "Quoted words stay together"],
  ["-word", "Exclude a word or operator"],
  ["from:a OR from:b", "Either term"],
];
