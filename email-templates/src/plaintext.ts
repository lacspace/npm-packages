/**
 * Plain-text alternative generation.
 *
 * Every well-formed email should ship a `text/plain` part alongside the HTML.
 * `toPlainText()` turns a rendered email string into readable plain text with
 * no DOM and no dependencies — regex only, isomorphic, safe to run anywhere.
 */

function stripTags(input: string): string {
  return input.replace(/<[^>]+>/g, "");
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * Convert an HTML email string into a readable plain-text alternative.
 *
 * - Hidden preheader / `display:none` blocks, `<head>`, `<style>` and
 *   `<script>` are dropped.
 * - Links become `label (https://url)`.
 * - Block-level tags become line breaks; list items get a `•` bullet.
 * - HTML entities produced by {@link escapeHtml} are decoded back.
 */
export function toPlainText(html: string): string {
  let s = String(html);

  // Structural / hidden content we never want in the text part.
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Hidden preview-text / spacer containers (e.g. the preheader).
  s = s.replace(/<div[^>]*display:\s*none[\s\S]*?<\/div>/gi, "");

  // Links → "label (href)".
  s = s.replace(
    /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, label) => {
      const text = stripTags(String(label)).trim();
      const url = String(href).trim();
      if (!url) return text;
      if (!text || text === url) return url;
      return `${text} (${url})`;
    },
  );

  // List items get a bullet before their content.
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  // Explicit and block-level line breaks.
  s = s.replace(/<(?:br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<\/(?:p|div|tr|ul|ol|h[1-6]|table)>/gi, "\n");

  s = stripTags(s);
  s = decodeEntities(s);

  // Tidy whitespace.
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
