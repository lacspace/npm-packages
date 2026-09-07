/**
 * HTML → plaintext and preheader helpers. Pure, dependency-free — used to
 * auto-generate a `text/plain` alternative when a caller only supplies HTML,
 * and to build the short preview/preheader snippet inboxes show next to a
 * subject line.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

/** Decode the common HTML entities and numeric character references. */
export function decodeEntities(str: string): string {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Convert an HTML string to a readable plaintext approximation: strips
 * script/style, turns block-level tags and `<br>` into newlines, expands list
 * items into `- ` bullets, keeps link hrefs as `text (url)`, decodes entities,
 * and collapses excess whitespace.
 */
export function htmlToText(html: string): string {
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // Anchors: keep visible text plus the destination.
  s = s.replace(/<a\b[^>]*href=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, txt: string) => {
    const t = txt.replace(/<[^>]+>/g, "").trim();
    return t && href && !href.startsWith("#") && t !== href ? `${t} (${href})` : t || href;
  });
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|li|section|article|header|footer|blockquote)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/**
 * Produce a short preview/preheader snippet from HTML or plaintext — the line
 * many inboxes show after the subject. Collapses whitespace and truncates on a
 * word boundary with an ellipsis.
 */
export function previewText(source: string, maxLength = 140): string {
  const looksHtml = /<[a-z!/][\s\S]*>/i.test(source);
  let text = (looksHtml ? htmlToText(source) : String(source)).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + "…";
}

/**
 * Build a hidden preheader snippet to prepend inside an HTML email body. The
 * span is visually hidden but read by inbox previews; padded so following body
 * text does not leak into the preview.
 */
export function preheader(text: string, padTo = 100): string {
  const safe = String(text).replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
  const pad = "‌ ".repeat(Math.max(0, Math.ceil((padTo - text.length) / 2)));
  return (
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${safe}${pad}</div>`
  );
}
