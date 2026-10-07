/**
 * A linear-time HTML tokenizer modelled on the WHATWG tokenizer states that
 * matter for safety: tag names run to whitespace, "/" or ">"; attribute names
 * and values follow the spec's quoting rules ("/" between attributes counts as
 * a separator, backticks are ordinary characters); comments end at "-->" or
 * "--!>"; "<!...>", "<?...>" and "</ ...>" are bogus comments; raw-text
 * elements (script, style, textarea, title, iframe, noscript, noembed,
 * noframes, xmp) run to their matching end tag; "<plaintext>" runs to the end.
 *
 * It never builds a tree and never backtracks: every search moves forward.
 */

export interface Attr {
  name: string;
  /** Raw (not yet entity-decoded) value. */
  value: string;
}

export interface TokenHandler {
  /** Raw (not yet entity-decoded) text between tags. */
  text(raw: string): void;
  start(name: string, attrs: Attr[], selfClosing: boolean): void;
  end(name: string): void;
  /** A comment, doctype, CDATA section or processing instruction. */
  comment(): void;
  /** The raw content of a raw-text element, delivered between start() and end(). */
  rawText(name: string, content: string): void;
}

/** Elements whose content is not markup. */
export const RAW_TEXT = new Set([
  "script", "style", "textarea", "title", "iframe", "noscript", "noembed", "noframes", "xmp",
]);

const MAX_ATTRS = 256;

function isWs(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13;
}
function isAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
/** ASCII-only lowercase (keeps string length, unlike toLowerCase on some Unicode). */
export function asciiLower(s: string): string {
  let out = "";
  let changed = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      out += String.fromCharCode(c + 32);
      changed = true;
    } else out += s[i];
  }
  return changed ? out : s;
}

interface TagResult {
  name: string;
  attrs: Attr[];
  selfClosing: boolean;
  /** Index just past the closing ">". */
  next: number;
}

/** Parse a start or end tag whose name begins at `p`. Returns null on EOF inside the tag. */
function parseTag(html: string, p: number): TagResult | null {
  const n = html.length;
  let j = p;
  while (j < n) {
    const c = html.charCodeAt(j);
    if (isWs(c) || c === 47 || c === 62) break;
    j++;
  }
  const name = asciiLower(html.slice(p, j)).replace(/\0/g, "�");
  const attrs: Attr[] = [];
  const seen = new Set<string>();
  let selfClosing = false;
  for (;;) {
    while (j < n) {
      const c = html.charCodeAt(j);
      if (isWs(c)) j++;
      else if (c === 47) {
        if (html.charCodeAt(j + 1) === 62) {
          return { name, attrs, selfClosing: true, next: j + 2 };
        }
        j++;
      } else break;
    }
    if (j >= n) return null;
    if (html.charCodeAt(j) === 62) return { name, attrs, selfClosing, next: j + 1 };
    // Attribute name; a leading "=" is part of the name per spec.
    const ns = j;
    j++;
    while (j < n) {
      const c = html.charCodeAt(j);
      if (isWs(c) || c === 47 || c === 62 || c === 61) break;
      j++;
    }
    const aname = asciiLower(html.slice(ns, j));
    while (j < n && isWs(html.charCodeAt(j))) j++;
    let value = "";
    if (html.charCodeAt(j) === 61) {
      j++;
      while (j < n && isWs(html.charCodeAt(j))) j++;
      if (j >= n) return null;
      const q = html.charCodeAt(j);
      if (q === 34 || q === 39) {
        const e = html.indexOf(q === 34 ? '"' : "'", j + 1);
        if (e === -1) return null;
        value = html.slice(j + 1, e);
        j = e + 1;
      } else if (q !== 62) {
        const vs = j;
        while (j < n) {
          const c = html.charCodeAt(j);
          if (isWs(c) || c === 62) break;
          j++;
        }
        value = html.slice(vs, j);
      }
    }
    if (!seen.has(aname) && attrs.length < MAX_ATTRS) {
      seen.add(aname);
      attrs.push({ name: aname, value });
    }
    selfClosing = false;
  }
}

/** Tokenize `html`, calling `h` for each token in document order. Never throws. */
export function tokenize(html: string, h: TokenHandler): void {
  const n = html.length;
  let i = 0;
  let textStart = 0;
  // Cached forward searches keep repeated lookups linear.
  let bangEnd = -2;

  const flush = (upTo: number) => {
    if (upTo > textStart) h.text(html.slice(textStart, upTo));
  };

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    const c1 = html.charCodeAt(lt + 1);

    if (isAlpha(c1)) {
      const tag = parseTag(html, lt + 1);
      if (!tag) {
        // EOF inside a tag: the tag (and everything after it) is dropped.
        flush(lt);
        return;
      }
      flush(lt);
      h.start(tag.name, tag.attrs, tag.selfClosing);
      i = textStart = tag.next;
      if (tag.name === "plaintext") {
        h.rawText("plaintext", html.slice(i));
        h.end("plaintext");
        return;
      }
      if (RAW_TEXT.has(tag.name)) {
        const close = findRawClose(html, i, tag.name);
        h.rawText(tag.name, html.slice(i, close.contentEnd));
        h.end(tag.name);
        i = textStart = close.next;
      }
      continue;
    }

    if (c1 === 47 /* / */) {
      const c2 = html.charCodeAt(lt + 2);
      if (isAlpha(c2)) {
        const tag = parseTag(html, lt + 2);
        if (!tag) {
          flush(lt);
          return;
        }
        flush(lt);
        h.end(tag.name);
        i = textStart = tag.next;
        continue;
      }
      if (c2 === 62) {
        // "</>" is ignored entirely.
        flush(lt);
        i = textStart = lt + 3;
        continue;
      }
      if (lt + 2 >= n) {
        i = lt + 1;
        continue;
      }
      // Bogus comment.
      flush(lt);
      const e = html.indexOf(">", lt + 2);
      h.comment();
      i = textStart = e === -1 ? n : e + 1;
      continue;
    }

    if (c1 === 33 /* ! */) {
      flush(lt);
      h.comment();
      if (html.startsWith("<!--", lt)) {
        const p = lt + 4;
        if (html.charCodeAt(p) === 62) i = p + 1;
        else if (html.startsWith("->", p)) i = p + 2;
        else {
          const a = html.indexOf("-->", p);
          if (bangEnd !== -1 && bangEnd < p) bangEnd = html.indexOf("--!>", p);
          const b = bangEnd;
          let end = -1;
          let len = 0;
          if (a !== -1 && (b === -1 || a <= b)) {
            end = a;
            len = 3;
          } else if (b !== -1) {
            end = b;
            len = 4;
          }
          i = end === -1 ? n : end + len;
        }
      } else {
        const e = html.indexOf(">", lt + 2);
        i = e === -1 ? n : e + 1;
      }
      textStart = i;
      continue;
    }

    if (c1 === 63 /* ? */) {
      flush(lt);
      h.comment();
      const e = html.indexOf(">", lt + 2);
      i = textStart = e === -1 ? n : e + 1;
      continue;
    }

    // A literal "<" in text.
    i = lt + 1;
  }
  flush(n);
}

function findRawClose(html: string, from: number, name: string): { contentEnd: number; next: number } {
  const n = html.length;
  let k = html.indexOf("</", from);
  while (k !== -1) {
    const p = k + 2;
    let match = p + name.length <= n;
    for (let t = 0; match && t < name.length; t++) {
      let c = html.charCodeAt(p + t);
      if (c >= 65 && c <= 90) c += 32;
      if (c !== name.charCodeAt(t)) match = false;
    }
    if (match) {
      const after = html.charCodeAt(p + name.length);
      if (p + name.length >= n || isWs(after) || after === 47 || after === 62) {
        const tag = parseTag(html, p);
        return { contentEnd: k, next: tag ? tag.next : n };
      }
    }
    k = html.indexOf("</", k + 2);
  }
  return { contentEnd: n, next: n };
}
