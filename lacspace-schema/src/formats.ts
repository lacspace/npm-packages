/**
 * Central registry of the string `format`s this tool detects and validates.
 * Pure and dependency-free (no `node:` imports) so it is safe in the browser
 * `/try` playground. The ordered list drives format *detection* (first full
 * match wins); the map drives format *validation* by name.
 */

/**
 * `[name, regex]` pairs in detection priority order. More specific formats
 * (uuid, date-time) come before looser ones (uri) so a value is labelled with
 * the tightest matching format.
 */
export const FORMAT_LIST: Array<[string, RegExp]> = [
  ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ["date-time", /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["time", /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/],
  ["email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
  ["ipv4", /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/],
  [
    "ipv6",
    /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/i,
  ],
  ["uri", /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i],
];

/** Format name -> validation regex (order-independent lookup). */
export const FORMAT_PATTERNS: Record<string, RegExp> = Object.fromEntries(FORMAT_LIST);

/** Detect the tightest `format` that ALL of `values` match, if any. */
export function detectFormat(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  for (const [name, re] of FORMAT_LIST) {
    if (values.every((v) => re.test(v))) return name;
  }
  return undefined;
}

/** Validate a single string against a named format. Unknown formats pass. */
export function matchesFormat(format: string, value: string): boolean {
  const re = FORMAT_PATTERNS[format];
  return re ? re.test(value) : true;
}
