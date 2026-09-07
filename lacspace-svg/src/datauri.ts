/**
 * Turn an SVG into a `data:image/svg+xml,…` URI for CSS/HTML use.
 *
 * Two encodings:
 *  - `uri` (default, usually smaller): URL-encoded, keeping SVG readable and
 *    only escaping the characters that actually break a URI or a CSS `url()`.
 *  - `base64`: standard base64.
 *
 * Optionally wraps the result as a CSS `background-image: url("…")` snippet.
 */

import type { OptimizeOptions } from "./optimize.js";
import { optimize } from "./optimize.js";

/** Options for {@link toDataUri}. */
export interface DataUriOptions {
  /** `"uri"` (URL-encoded, default) or `"base64"`. */
  encoding?: "uri" | "base64";
  /** Wrap as `background-image:url("…")`. Default `false`. */
  css?: boolean;
  /** Minify the SVG first (default `true`). Pass optimize options to tune. */
  optimize?: boolean | OptimizeOptions;
}

/**
 * URL-encode an SVG for a `data:` URI. Uses single quotes for attributes at the
 * call site (caller should serialize with single quotes, but we also encode the
 * double quote), and only escapes the characters that matter, which keeps the
 * result far smaller and more legible than full `encodeURIComponent`.
 */
export function encodeSvgUri(svg: string): string {
  // Prefer single quotes inside the SVG so the URI needs no quote escaping.
  const singleQuoted = svg.replace(/"/g, "'");
  return singleQuoted
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\{/g, "%7B")
    .replace(/\}/g, "%7D")
    .replace(/\|/g, "%7C")
    .replace(/\^/g, "%5E")
    .replace(/\[/g, "%5B")
    .replace(/\]/g, "%5D")
    .replace(/`/g, "%60")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Base64-encode a string as UTF-8. */
export function encodeSvgBase64(svg: string): string {
  return Buffer.from(svg, "utf8").toString("base64");
}

/** Result of {@link toDataUri}. */
export interface DataUriResult {
  uri: string;
  /** `background-image:url("…")` when `css` is set, else the same as `uri`. */
  output: string;
  encoding: "uri" | "base64";
  bytes: number;
}

/** Convert an SVG string into a data-URI (and optional CSS snippet). */
export function toDataUri(input: string, opts: DataUriOptions = {}): DataUriResult {
  const encoding = opts.encoding ?? "uri";
  const doOpt = opts.optimize ?? true;

  let svg = input;
  if (doOpt !== false) {
    const oopts: OptimizeOptions = typeof doOpt === "object" ? doOpt : {};
    svg = optimize(input, oopts).data;
  } else {
    svg = input.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  let uri: string;
  if (encoding === "base64") {
    uri = `data:image/svg+xml;base64,${encodeSvgBase64(svg)}`;
  } else {
    uri = `data:image/svg+xml,${encodeSvgUri(svg)}`;
  }

  const output = opts.css ? `background-image: url("${uri}");` : uri;
  return { uri, output, encoding, bytes: Buffer.byteLength(uri, "utf8") };
}
