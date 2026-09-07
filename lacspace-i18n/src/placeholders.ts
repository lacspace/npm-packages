/**
 * Interpolation / ICU placeholder analysis.
 *
 * {@link extractPlaceholders} tokenizes a translation string, returning the set
 * of placeholders it uses plus any structural errors. Supported syntaxes:
 *
 *   {name}                       single-brace (ICU / react-intl / vue-i18n)
 *   {{name}}                     double-brace (i18next / mustache)
 *   %s %d %f %1$s                printf / sprintf positional
 *   {n, plural, one {…} other{…}}   ICU plural / selectordinal
 *   {g, select, male {…} …}      ICU select
 *   {v, number|date|time, …}     ICU formatted arguments
 *
 * Errors reported: unbalanced braces, a stray `}`, and unknown ICU plural
 * categories (valid: zero, one, two, few, many, other, or explicit `=N`).
 *
 * Limitation: ICU apostrophe quoting (`'{'` for a literal brace) is NOT
 * interpreted — messages that quote literal braces may mis-report.
 */
import type { FlatMap } from "./flatten.js";
import { compareKeys } from "./flatten.js";

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
const ICU_TYPES = new Set([
  "plural", "selectordinal", "select", "number", "date", "time",
  "spellout", "ordinal", "duration",
]);

/** Placeholders + structural errors found in a single message. */
export interface PlaceholderResult {
  tokens: Set<string>;
  errors: string[];
}

/** Extract the placeholder token set and any structural errors from a message. */
export function extractPlaceholders(message: string): PlaceholderResult {
  const tokens = new Set<string>();
  const errors: string[] = [];
  parseMessage(message, tokens, errors);
  extractPrintf(message, tokens);
  return { tokens, errors };
}

function parseMessage(s: string, tokens: Set<string>, errors: string[]): void {
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "{" && s[i + 1] === "{") {
      const end = s.indexOf("}}", i + 2);
      if (end === -1) {
        errors.push("unbalanced '{{'");
        return;
      }
      tokens.add(`{{${s.slice(i + 2, end).trim()}}}`);
      i = end + 2;
    } else if (ch === "{") {
      const end = matchBrace(s, i);
      if (end === -1) {
        errors.push("unbalanced '{'");
        return;
      }
      parseArg(s.slice(i + 1, end), tokens, errors);
      i = end + 1;
    } else if (ch === "}") {
      errors.push("unexpected '}'");
      i++;
    } else {
      i++;
    }
  }
}

/** Index of the `}` that closes the `{` at `open`, or -1. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function topComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") depth--;
    else if (s[i] === "," && depth === 0) return i;
  }
  return -1;
}

function parseArg(inner: string, tokens: Set<string>, errors: string[]): void {
  const firstComma = topComma(inner);
  if (firstComma === -1) {
    tokens.add(`{${inner.trim()}}`);
    return;
  }
  const argName = inner.slice(0, firstComma).trim();
  const rest = inner.slice(firstComma + 1);
  const secondComma = topComma(rest);
  const type = (secondComma === -1 ? rest : rest.slice(0, secondComma)).trim();
  tokens.add(`{${argName},${type}}`);
  if (!ICU_TYPES.has(type)) {
    errors.push(`unknown ICU type "${type}" for argument "${argName}"`);
    return;
  }
  if (type === "plural" || type === "selectordinal" || type === "select") {
    const body = secondComma === -1 ? "" : rest.slice(secondComma + 1);
    parseSubmessages(body, tokens, errors, type !== "select");
  }
}

function parseSubmessages(body: string, tokens: Set<string>, errors: string[], validateCategories: boolean): void {
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length) break;
    let keyword = "";
    while (i < body.length && body[i] !== "{" && !/\s/.test(body[i]!)) keyword += body[i++]!;
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (body[i] !== "{") {
      errors.push(`expected '{' after "${keyword}" in ICU submessage`);
      return;
    }
    const close = matchBrace(body, i);
    if (close === -1) {
      errors.push("unbalanced '{' in ICU submessage");
      return;
    }
    if (validateCategories && keyword && !keyword.startsWith("=") && !PLURAL_CATEGORIES.has(keyword)) {
      errors.push(`unknown plural category "${keyword}"`);
    }
    parseMessage(body.slice(i + 1, close), tokens, errors);
    i = close + 1;
  }
}

function extractPrintf(s: string, tokens: Set<string>): void {
  // `%%` is a literal percent and is consumed (and ignored) first.
  const re = /%%|%(?:(\d+)\$)?[-+0#]*\d*(?:\.\d+)?([sdifgeExXoc])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[0] === "%%" || !m[2]) continue;
    const positional = m[1] ? `${m[1]}$` : "";
    tokens.add(`%${positional}${m[2]}`);
  }
}

// --- cross-locale checks --------------------------------------------------

/** A placeholder mismatch between the base and a target locale for one key. */
export interface PlaceholderIssue {
  key: string;
  locale: string;
  /** Placeholders in the base value but not the target. */
  missing: string[];
  /** Placeholders in the target value but not the base. */
  extra: string[];
}

/** A message whose ICU/brace structure is malformed. */
export interface MalformedIcu {
  key: string;
  locale: string;
  errors: string[];
}

export interface PlaceholderReport {
  issues: PlaceholderIssue[];
  malformed: MalformedIcu[];
}

function isStringLike(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * Check placeholder consistency of every locale against the base, and collect
 * malformed-ICU messages from all locales (base included).
 */
export function checkPlaceholders(
  base: FlatMap,
  locales: Array<{ code: string; flat: FlatMap }>,
  baseCode: string,
): PlaceholderReport {
  const issues: PlaceholderIssue[] = [];
  const malformed: MalformedIcu[] = [];

  const baseTokens = new Map<string, Set<string>>();
  for (const [key, val] of Object.entries(base)) {
    if (!isStringLike(val)) continue;
    const r = extractPlaceholders(val);
    baseTokens.set(key, r.tokens);
    if (r.errors.length) malformed.push({ key, locale: baseCode, errors: r.errors });
  }

  for (const loc of locales) {
    if (loc.code === baseCode) continue;
    for (const [key, val] of Object.entries(loc.flat)) {
      if (!isStringLike(val)) continue;
      const r = extractPlaceholders(val);
      if (r.errors.length) malformed.push({ key, locale: loc.code, errors: r.errors });
      const baseSet = baseTokens.get(key);
      if (!baseSet) continue; // extra/missing keys handled by compare, not here
      const missing: string[] = [];
      const extra: string[] = [];
      for (const t of baseSet) if (!r.tokens.has(t)) missing.push(t);
      for (const t of r.tokens) if (!baseSet.has(t)) extra.push(t);
      if (missing.length || extra.length) {
        issues.push({ key, locale: loc.code, missing: missing.sort(), extra: extra.sort() });
      }
    }
  }

  issues.sort((a, b) => a.locale.localeCompare(b.locale) || compareKeys(a.key, b.key));
  malformed.sort((a, b) => a.locale.localeCompare(b.locale) || compareKeys(a.key, b.key));
  return { issues, malformed };
}
