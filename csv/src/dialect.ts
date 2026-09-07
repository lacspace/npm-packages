/**
 * @lacspace/csv — dialect presets & BOM helpers
 *
 * Convenience wrappers for common delimited formats plus BOM strip/add, built
 * on the existing {@link parse}/{@link stringify}. Zero new behaviour — sugar.
 */

import { parse, stringify } from "./index";
import type { ParseOptions, Row, StringifyOptions } from "./index";

/** UTF-8 byte-order mark. */
export const BOM = "\uFEFF";

/** Remove a leading BOM if present (no-op otherwise). */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Prepend a BOM if not already present (helps Excel open UTF-8 correctly). */
export function addBom(text: string): string {
  return text.startsWith(BOM) ? text : BOM + text;
}

/** Named delimiter dialects for use as `{ delimiter: DIALECT.tsv }`. */
export const DELIMITERS = {
  csv: ",",
  tsv: "\t",
  ssv: ";",
  psv: "|",
} as const;

/** Parse tab-separated values (strips a leading BOM automatically). */
export function parseTSV<T = Row>(
  text: string,
  opts: Omit<ParseOptions, "delimiter"> = {},
): T[] {
  return parse<T>(stripBom(text), { ...opts, delimiter: "\t", header: true });
}

/** Stringify rows as tab-separated values. */
export function stringifyTSV(
  rows: Row[] | (string | number | boolean | null | undefined)[][],
  opts: Omit<StringifyOptions, "delimiter"> = {},
): string {
  return stringify(rows, { ...opts, delimiter: "\t" });
}
