/**
 * Markdown-escaping helper for `llms.txt` link text.
 */

/**
 * Escape the Markdown link characters `\ [ ] ( )` in link *text* (titles and
 * notes) so a value like `A [beta] (x)` cannot break the surrounding
 * `[...](...)`. Escaping is idempotent-safe only for these characters and is
 * intended for the human-readable text portions — not for URLs.
 *
 * Opt-in: pass `{ escape: true }` to {@link llmsTxt} / the builders, or call
 * this directly. The default (unescaped) output is unchanged.
 *
 * @example
 * escapeLlmsText("Guide [v2] (beta)"); // "Guide \\[v2\\] \\(beta\\)"
 */
export function escapeLlmsText(s: string): string {
  return s.replace(/([\\\[\]()])/g, "\\$1");
}
