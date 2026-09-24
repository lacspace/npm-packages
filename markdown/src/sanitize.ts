/**
 * A small, dependency-free HTML sanitizer.
 *
 * `@lacspace/markdown` is already XSS-safe on its own — `markdownToHtml` ESCAPES
 * any raw HTML found in the Markdown source, so the renderer never emits markup
 * it didn't construct. `sanitizeHtml` is for the *other* direction: when you have
 * an HTML string from an untrusted source (a paste, a CMS field, a legacy
 * document) and want to neutralise the dangerous parts before displaying it.
 *
 * It removes script/style/dangerous elements, strips `on*` event-handler and
 * `style` attributes, and neutralises `javascript:`/`data:`/`vbscript:` URLs in
 * `href`/`src`. It is a pragmatic regex sanitizer, NOT a full HTML parser — for
 * hostile input in a browser prefer the platform (`DOMPurify` / a real parser).
 * See the README "Security" section for the full posture.
 *
 * Zero dependencies · isomorphic.
 */

/** Options for {@link sanitizeHtml}. */
export interface SanitizeOptions {
  /**
   * Tag names to keep (lowercase). Any tag not in the list has its `<tag>` and
   * `</tag>` markup removed while its text content is preserved. Defaults to a
   * safe formatting/blogging set.
   */
  allowedTags?: string[];
  /** Attribute names to keep (lowercase). Default: `href`, `src`, `alt`, `title`, `id`, `class`, `align`. */
  allowedAttributes?: string[];
}

const DEFAULT_TAGS = [
  "a", "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "del", "s", "mark", "sub", "sup", "small",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "figure", "figcaption",
  "input", // task-list checkboxes
];

const DEFAULT_ATTRS = ["href", "src", "alt", "title", "id", "class", "align", "type", "checked", "disabled", "style"];

// Elements whose entire contents must be discarded, not just the tags.
const VOID_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template"];

// The few named entities that matter for smuggling a scheme past a check.
const NAMED_ENTITIES: Record<string, string> = {
  colon: ":", tab: "\t", newline: "\n", nbsp: "\u00a0",
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

/**
 * Decode HTML character references the way a browser does before it parses an
 * attribute as a URL. One pass only, which is also what the browser does: a
 * double-encoded `&amp;#106;` decodes to the literal text `&#106;`, which the
 * URL parser then leaves alone, so it is not a scheme and needs no second pass.
 */
function decodeEntities(s: string): string {
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (m, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    return NAMED_ENTITIES[name!.toLowerCase()] ?? m;
  });
}

/**
 * Reject dangerous URL schemes (mirrors the renderer's own `safeUrl`).
 *
 * The check runs on the DECODED value. It used to run on the raw attribute, so
 * `href="&#106;avascript:alert(1)"` passed: its first character is `&`, which
 * is not a scheme, yet the browser decodes the reference before parsing the URL
 * and executes `javascript:`. Numeric (decimal and hex, with or without the
 * semicolon) and `&colon;` all reached the same place.
 */
function safeAttrUrl(url: string): string {
  const stripped = decodeEntities(url).replace(/[\x00-\x20\x7F]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(stripped);
  if (scheme) {
    const allowed = ["http", "https", "mailto", "tel"];
    return allowed.includes(scheme[1]!.toLowerCase()) ? url : "#";
  }
  return url;
}

/**
 * Sanitize an HTML string: drop disallowed/dangerous elements, event-handler and
 * (by default) style attributes, and neutralise dangerous URLs.
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  const allowedTags = new Set((options.allowedTags ?? DEFAULT_TAGS).map((t) => t.toLowerCase()));
  const allowStyle = options.allowedAttributes
    ? options.allowedAttributes.map((a) => a.toLowerCase()).includes("style")
    : false; // style is dropped by default even though it's in DEFAULT_ATTRS
  const allowedAttrs = new Set(
    (options.allowedAttributes ?? DEFAULT_ATTRS).map((a) => a.toLowerCase()).filter((a) => a !== "style" || allowStyle),
  );

  let out = html;

  // 1. Remove elements whose contents are always unsafe (script/style/iframe…).
  for (const tag of VOID_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // Also strip an unclosed/self-terminated opener.
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // 2. Remove HTML comments (can hide conditional-comment scripts).
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Walk every remaining tag — and neutralise anything tag-shaped that is
  //    NOT a well-formed tag. The first alternative matches a complete tag with
  //    balanced quotes. When it cannot (an unbalanced quote means no closing
  //    `>` is reachable), the second alternative matches the lone `<` and it is
  //    escaped, so the fragment renders as text. Before this, such a fragment
  //    fell through the regex UNTOUCHED: `<img src="x onerror=alert(1)>` came
  //    out byte-for-byte, and a browser's forgiving parser ran the handler.
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<(?=[a-zA-Z\/!?])/g, (_m, slash: string | undefined, name: string | undefined, attrs: string | undefined) => {
    if (name === undefined) return "&lt;"; // the malformed-fragment alternative
    const tag = name.toLowerCase();
    if (!allowedTags.has(tag)) return ""; // drop the tag markup, keep surrounding text
    if (slash) return `</${tag}>`;

    // Rebuild the allowed attributes.
    const kept: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrs ?? "")) !== null) {
      const attr = a[1]!.toLowerCase();
      const value = a[3] ?? a[4] ?? a[5] ?? "";
      if (/^on/.test(attr)) continue; // event handlers
      if (!allowedAttrs.has(attr)) continue;
      if (attr === "href" || attr === "src") {
        kept.push(`${attr}="${safeAttrUrl(value).replace(/"/g, "&quot;")}"`);
      } else if (a[2] === undefined) {
        kept.push(attr); // boolean attribute (e.g. `checked`)
      } else {
        kept.push(`${attr}="${value.replace(/"/g, "&quot;")}"`);
      }
    }
    return `<${tag}${kept.length ? " " + kept.join(" ") : ""}>`;
  });

  return out;
}
