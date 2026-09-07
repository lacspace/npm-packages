/**
 * Plain-text extraction + excerpts.
 *
 * `toPlainText` strips Markdown formatting down to readable prose (keeping link
 * and image alt text) and `excerpt` truncates that prose to a word boundary —
 * ideal for `<meta name="description">`, social cards and list previews.
 *
 * Zero dependencies · isomorphic.
 */

import { parseFrontmatter } from "./frontmatter";

/** Collapse a string's runs of whitespace to single spaces and trim. */
function collapse(s: string): string {
  return s.replace(/[ \t\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Strip Markdown to plain text. Frontmatter and fenced code blocks are removed,
 * inline formatting markers are dropped, and links/images collapse to their
 * visible text / alt text. HTML tags in the source are removed.
 */
export function toPlainText(src: string): string {
  let text = parseFrontmatter(src).content.replace(/\r\n?/g, "\n");

  // Fenced code blocks — drop entirely.
  text = text.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
  // Inline code — keep the code text, drop the backticks.
  text = text.replace(/`([^`]+)`/g, "$1");
  // Images — keep alt text.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links — keep the label.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Reference-style link/image labels: [text][ref] / [text]
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  // Autolinks <url>
  text = text.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, "$1");
  // Emphasis / strikethrough markers.
  text = text.replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, "$2");
  // Headings, blockquotes, list markers, table pipes.
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");
  text = text.replace(/^\s*([-*+]|\d{1,9}[.)])\s+(\[[ xX]\]\s+)?/gm, "");
  text = text.replace(/^\s*([-*_])( *\1){2,}\s*$/gm, ""); // horizontal rules
  text = text.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ""); // table separators
  text = text.replace(/\|/g, " ");
  // Remaining HTML tags.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  // HTML entities we commonly emit.
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

  return collapse(text);
}

/** Options for {@link excerpt}. */
export interface ExcerptOptions {
  /** Maximum length in characters before truncation. Default `160`. */
  length?: number;
  /** String appended when the text is truncated. Default `"…"`. */
  suffix?: string;
}

/**
 * Produce a plain-text excerpt from Markdown, truncated at a word boundary so it
 * never cuts a word in half. Returns the full text (no suffix) when it already
 * fits within `length`.
 */
export function excerpt(src: string, options: ExcerptOptions = {}): string {
  const length = options.length ?? 160;
  const suffix = options.suffix ?? "…";
  const text = toPlainText(src).replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;

  const slice = text.slice(0, length);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[.,;:!?\-–—]+$/, "").trimEnd() + suffix;
}
