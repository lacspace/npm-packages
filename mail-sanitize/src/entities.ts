/**
 * HTML character-reference decoding and output escaping.
 *
 * Decoding happens once, on input. Everything the sanitizer emits is escaped
 * again, so the value the browser sees after its own decoding is exactly the
 * value this module checked.
 */

const NAMED: Record<string, string> = {
  amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"', apos: "'",
  nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", zwnj: "‌", zwj: "‍",
  lrm: "‎", rlm: "‏", shy: "­",
  copy: "©", COPY: "©", reg: "®", REG: "®", trade: "™", TRADE: "™", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", sbquo: "‚", bdquo: "„", laquo: "«", raquo: "»",
  lsaquo: "‹", rsaquo: "›", middot: "·", bull: "•", prime: "′", Prime: "″", dagger: "†", Dagger: "‡",
  euro: "€", pound: "£", yen: "¥", cent: "¢", curren: "¤", sect: "§", para: "¶", deg: "°",
  plusmn: "±", times: "×", divide: "÷", micro: "µ", frac12: "½", frac14: "¼", frac34: "¾",
  sup1: "¹", sup2: "²", sup3: "³", ordf: "ª", ordm: "º", not: "¬", macr: "¯", acute: "´",
  cedil: "¸", uml: "¨", iexcl: "¡", iquest: "¿", brvbar: "¦", larr: "←", rarr: "→", uarr: "↑",
  darr: "↓", harr: "↔", hearts: "♥", check: "✓", star: "☆", starf: "★",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø", ugrave: "ù",
  uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", yuml: "ÿ", szlig: "ß", eth: "ð", thorn: "þ",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ", Ccedil: "Ç",
  Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì", Iacute: "Í", Icirc: "Î", Iuml: "Ï",
  Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø", Ugrave: "Ù",
  Uacute: "Ú", Ucirc: "Û", Uuml: "Ü", Yacute: "Ý", ETH: "Ð", THORN: "Þ",
  // Characters attackers use to split URL schemes ("java&Tab;script&colon;").
  Tab: "\t", NewLine: "\n", colon: ":", lpar: "(", rpar: ")", sol: "/", bsol: "\\", semi: ";",
  comma: ",", period: ".", excl: "!", quest: "?", num: "#", percnt: "%", equals: "=", plus: "+",
  lowbar: "_", grave: "`", lsqb: "[", rsqb: "]", lcub: "{", rcub: "}", verbar: "|", ast: "*",
  commat: "@", dollar: "$", Hat: "^", hyphen: "‐", dash: "‐",
};

/** Legacy references browsers still decode without a trailing semicolon. */
const LEGACY = ["amp", "lt", "gt", "quot", "nbsp", "copy", "reg", "AMP", "LT", "GT", "QUOT"];

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
  return String.fromCodePoint(code);
}

function isAlnum(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}
function isHex(c: number): boolean {
  return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/**
 * Decode named and numeric character references (numeric ones with or without
 * a semicolon, as browsers do). Linear time. `inAttr` follows the attribute
 * rule for legacy references: `&amp=` / `&ampx` stay literal inside attributes.
 */
export function decodeEntities(s: string, inAttr = false): string {
  if (!s || s.indexOf("&") === -1) return s;
  let out = "";
  let last = 0;
  let i = s.indexOf("&");
  const n = s.length;
  while (i !== -1) {
    let j = i + 1;
    let rep: string | null = null;
    if (s.charCodeAt(j) === 35 /* # */) {
      j++;
      const hex = s.charCodeAt(j) === 120 || s.charCodeAt(j) === 88;
      if (hex) j++;
      const start = j;
      while (j < n && (hex ? isHex(s.charCodeAt(j)) : isDigit(s.charCodeAt(j)))) j++;
      if (j > start) {
        // Cap the digits we parse; overlong values are invalid anyway.
        const digits = s.slice(start, Math.min(j, start + 8));
        const code = j - start > 8 ? 0x110000 : parseInt(digits, hex ? 16 : 10);
        rep = fromCode(code);
        if (s.charCodeAt(j) === 59) j++;
      }
    } else {
      const start = j;
      while (j < n && j - start < 32 && isAlnum(s.charCodeAt(j))) j++;
      if (j > start) {
        const name = s.slice(start, j);
        if (s.charCodeAt(j) === 59 && NAMED[name] !== undefined) {
          rep = NAMED[name]!;
          j++;
        } else {
          // Legacy no-semicolon forms: match the longest legacy prefix.
          for (const l of LEGACY) {
            if (name.startsWith(l)) {
              const after = start + l.length;
              const next = s.charCodeAt(after);
              if (inAttr && (after < n) && (isAlnum(next) || next === 61)) break;
              rep = NAMED[l]!;
              j = after;
              break;
            }
          }
        }
      }
    }
    if (rep !== null) {
      out += s.slice(last, i) + rep;
      last = j;
    }
    i = s.indexOf("&", rep !== null ? j : i + 1);
  }
  return out + s.slice(last);
}

/** Escape text content. */
export function escapeText(s: string): string {
  let out = "";
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let r: string | null = null;
    if (c === 38) r = "&amp;";
    else if (c === 60) r = "&lt;";
    else if (c === 62) r = "&gt;";
    else if (c === 0) r = "";
    if (r !== null) {
      out += s.slice(last, i) + r;
      last = i + 1;
    }
  }
  return last === 0 ? s : out + s.slice(last);
}

/** Escape a double-quoted attribute value. */
export function escapeAttr(s: string): string {
  let out = "";
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let r: string | null = null;
    if (c === 38) r = "&amp;";
    else if (c === 34) r = "&quot;";
    else if (c === 39) r = "&#39;";
    else if (c === 60) r = "&lt;";
    else if (c === 62) r = "&gt;";
    else if (c === 96) r = "&#96;";
    else if (c === 0) r = "";
    if (r !== null) {
      out += s.slice(last, i) + r;
      last = i + 1;
    }
  }
  return last === 0 ? s : out + s.slice(last);
}
