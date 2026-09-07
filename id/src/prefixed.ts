import { customId } from "./customid";
import { ALPHABETS } from "./alphabets";

/** Options for {@link prefixedId}. */
export interface PrefixedIdOptions {
  /** Length of the random body when using the default/alphabet generator. Default 24. */
  size?: number;
  /** Separator between prefix and body. Default `"_"`. */
  separator?: string;
  /** Alphabet for the default generator. Default base62. */
  alphabet?: string;
  /** Supply your own body generator (overrides `size`/`alphabet`). */
  generator?: () => string;
}

/**
 * Stripe-style typed id: `prefixedId("user")` → `"user_9f8c…"`. The prefix
 * documents the resource type and travels with the id. Body defaults to a
 * 24-char base62 string; pass a `generator` (e.g. `() => ulid()`) to combine
 * prefixes with any id format.
 */
export function prefixedId(prefix: string, options: PrefixedIdOptions = {}): string {
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new Error("prefixedId: `prefix` must be a non-empty string.");
  }
  const separator = options.separator ?? "_";
  if (separator.length === 0) {
    throw new Error("prefixedId: `separator` must be a non-empty string.");
  }
  if (prefix.includes(separator)) {
    throw new Error(`prefixedId: \`prefix\` must not contain the separator "${separator}".`);
  }
  const body = options.generator
    ? options.generator()
    : customId({ alphabet: options.alphabet ?? ALPHABETS.base62, size: options.size ?? 24 });
  return `${prefix}${separator}${body}`;
}

/** The two parts of a prefixed id. */
export interface ParsedPrefixedId {
  prefix: string;
  id: string;
}

/**
 * Split a prefixed id back into `{ prefix, id }` on the first separator.
 * Returns `null` if there is no separator, or an empty prefix or body.
 */
export function parsePrefixedId(value: string, separator = "_"): ParsedPrefixedId | null {
  if (typeof value !== "string" || separator.length === 0) return null;
  const i = value.indexOf(separator);
  if (i <= 0) return null;
  const id = value.slice(i + separator.length);
  if (id.length === 0) return null;
  return { prefix: value.slice(0, i), id };
}
