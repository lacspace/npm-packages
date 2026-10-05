const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0", ensp: "\u2002", emsp: "\u2003",
  thinsp: "\u2009", zwj: "\u200D", zwnj: "\u200C", shy: "\u00AD", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", minus: "−", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  sbquo: "‚", bdquo: "„", laquo: "«", raquo: "»", middot: "·", bull: "•", deg: "°", times: "×",
  divide: "÷", plusmn: "±", euro: "€", pound: "£", yen: "¥", cent: "¢", sect: "§", para: "¶",
  frac12: "½", frac14: "¼", frac34: "¾", larr: "←", rarr: "→", uarr: "↑", darr: "↓", iexcl: "¡",
  iquest: "¿", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  agrave: "à", egrave: "è", auml: "ä", ouml: "ö", uuml: "ü", ccedil: "ç", szlig: "ß",
};

function fromCp(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
  return String.fromCodePoint(code);
}

/** Decode common named and all numeric HTML entities. */
export function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (m, body: string) => {
    if (body[0] === "#") {
      return body[1] === "x" || body[1] === "X" ? fromCp(parseInt(body.slice(2), 16)) : fromCp(parseInt(body.slice(1), 10));
    }
    const v = NAMED[body] ?? NAMED[body.toLowerCase()];
    return v ?? m;
  });
}

const DROP = /<(script|style|noscript|svg|template|head|iframe|object|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const UNCLOSED = /<(script|style)\b[^>]*>[\s\S]*$/i;
const BLOCK =
  /<\/?(?:p|div|br|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|tfoot|caption|h[1-6]|section|article|header|footer|nav|aside|main|blockquote|pre|hr|form|fieldset|legend|address|figure|figcaption|option|select|details|summary|center|body|html)\b[^>]*>/gi;
const CELL = /<\/?(?:td|th)\b[^>]*>/gi;
const TAG = /<\/?[a-zA-Z!?][^>]*>/g;

/** The `<title>` text of an HTML document, decoded and trimmed (empty if none). */
export function htmlTitle(html: string): string {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return m ? decodeEntities(m[1]!.replace(TAG, "")).replace(/\s+/g, " ").trim() : "";
}

/**
 * HTML to visible text: drops head/script/style/noscript/svg/template content and comments,
 * turns block elements and `<br>` into newlines and table cells into spaces, strips tags,
 * decodes entities and collapses whitespace (newlines kept between blocks).
 */
export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?(?:-->|$)/g, " ").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ");
  s = s.replace(DROP, " ").replace(UNCLOSED, " ");
  s = s.replace(BLOCK, "\n").replace(CELL, " \t ").replace(TAG, "");
  s = decodeEntities(s);
  return s
    .split(/\n/)
    .map((l) => l.replace(/[ \t\r\f\v\u00A0]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Find the declared charset: BOM, then `charset=` in the content-type header, then `<meta>` in the first 4 KB. */
export function sniffCharset(bytes: Uint8Array, contentType?: string | null): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  const fromHeader = contentType && /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType);
  if (fromHeader) return fromHeader[1]!.toLowerCase();
  let head = "";
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i]!);
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head);
  if (meta) return meta[1]!.toLowerCase();
  return "utf-8";
}

const CP1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
// WHATWG maps all of these labels to windows-1252; some runtimes decode them as plain ISO-8859-1.
const LATIN_LABELS = new Set([
  "windows-1252", "cp1252", "x-cp1252", "latin1", "l1", "iso-8859-1", "iso8859-1", "iso_8859-1", "iso88591",
  "us-ascii", "ascii", "ansi_x3.4-1968", "cp819", "ibm819", "iso-ir-100", "csisolatin1",
]);

/** Decode bytes with a charset label, falling back to UTF-8 for unknown labels. */
export function decodeBytes(bytes: Uint8Array, charset = "utf-8"): string {
  if (LATIN_LABELS.has(charset.toLowerCase())) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      const part = Array.from(bytes.subarray(i, i + 8192), (b) => (b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80]! : b));
      out += String.fromCharCode.apply(null, part);
    }
    return out;
  }
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
