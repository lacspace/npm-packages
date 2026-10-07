import { isColor } from "./color";
import { decodeEntities, escapeAttr, isSafeUrl, mapOutsideVars } from "./escape";

/** Tags kept by the rich-text sanitizer. Everything else is dropped (its text is kept). */
export const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "a", "br", "p", "ul", "ol", "li", "span"] as const;
const ALLOWED = new Set<string>(ALLOWED_TAGS);

/** Elements removed together with their contents. */
const DROP_WITH_CONTENT =
  /<(script|style|iframe|object|embed|noscript|template|textarea|title|head|svg|math|select|xmp|noembed|noframes)\b[\s\S]*?<\/\1\s*>/gi;

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export type SanitizeOptions = {
  /** Colour for links. Default inherits. */
  linkColor?: string;
};

function escapeTextKeepEntities(t: string): string {
  return mapOutsideVars(t, (x) =>
    x
      .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
  );
}

function parseAttrs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of raw.matchAll(ATTR)) {
    const name = m[1]!.toLowerCase();
    if (out.has(name)) continue;
    out.set(name, m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function filterStyle(style: string): string {
  const keep: string[] = [];
  for (const decl of decodeEntities(style).split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop === "color" && isColor(val)) keep.push(`color:${val}`);
    else if (prop === "font-weight" && /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(val)) keep.push(`font-weight:${val}`);
  }
  return keep.join(";");
}

/**
 * Reduce HTML to a safe inline subset: b, strong, i, em, u, a[href], br, p,
 * ul, ol, li and span[style] (color and font-weight only). Event handlers,
 * other attributes, comments, scripts/styles (with their content) and any
 * href that isn't http(s)/mailto/tel/{{var}} are removed. {{vars}} pass
 * through untouched. Unclosed tags are closed; stray closing tags are dropped.
 */
export function sanitizeRichText(input: unknown, opts: SanitizeOptions = {}): string {
  const src = (input == null ? "" : String(input)).replace(/\u0000/g, "").replace(DROP_WITH_CONTENT, "");
  const linkStyle = `${opts.linkColor ? `color:${opts.linkColor};` : ""}text-decoration:underline;`;
  const stack: Array<{ tag: string; emitted: boolean }> = [];
  let out = "";
  let last = 0;

  for (const m of src.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    out += escapeTextKeepEntities(src.slice(last, idx));
    last = idx + m[0].length;
    const tagName = m[2];
    if (!tagName) continue; // comment
    const tag = tagName.toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    const closing = m[1] === "/";

    if (closing) {
      if (tag === "br") continue;
      let pos = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.tag === tag) { pos = i; break; }
      if (pos < 0) continue;
      while (stack.length > pos) {
        const e = stack.pop()!;
        if (e.emitted) out += `</${e.tag}>`;
      }
      continue;
    }

    const attrs = parseAttrs(m[3] ?? "");
    switch (tag) {
      case "br":
        out += "<br>";
        break;
      case "p":
        out += `<p style="margin:0 0 12px 0;">`;
        stack.push({ tag, emitted: true });
        break;
      case "ul":
      case "ol":
        out += `<${tag} style="margin:0 0 12px 0;padding:0 0 0 24px;">`;
        stack.push({ tag, emitted: true });
        break;
      case "li":
        out += `<li style="margin:0 0 4px 0;">`;
        stack.push({ tag, emitted: true });
        break;
      case "a": {
        const href = decodeEntities(attrs.get("href") ?? "").trim();
        if (href && isSafeUrl(href)) {
          out += `<a href="${escapeAttr(href)}" target="_blank" style="${escapeAttr(linkStyle)}">`;
          stack.push({ tag, emitted: true });
        } else {
          stack.push({ tag, emitted: false });
        }
        break;
      }
      case "span": {
        const style = filterStyle(attrs.get("style") ?? "");
        out += style ? `<span style="${escapeAttr(style)}">` : "<span>";
        stack.push({ tag, emitted: true });
        break;
      }
      default:
        out += `<${tag}>`;
        stack.push({ tag, emitted: true });
    }
  }
  out += escapeTextKeepEntities(src.slice(last));
  while (stack.length) {
    const e = stack.pop()!;
    if (e.emitted) out += `</${e.tag}>`;
  }
  return out;
}

/** Plain-text version of (sanitized) rich HTML: links become "text (url)", list items "- ". */
export function htmlToText(html: string): string {
  const strip = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ""));
  let s = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, h: string, t: string) => {
      const text = strip(t).trim();
      const url = decodeEntities(h);
      return text && text !== url ? `${text} (${url})` : url;
    });
  s = strip(s).replace(/ /g, " ");
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
