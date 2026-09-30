/**
 * A tiny, tolerant XML reader — just enough to walk RSS 2.0, RSS 1.0 (RDF) and
 * Atom feeds. Not a validating parser: it skips the declaration, comments and
 * DOCTYPE, treats CDATA as text, decodes the common entities, and never throws
 * on a stray or unbalanced tag (real-world feeds are messy). Namespaced names
 * are kept whole (`content:encoded`, `dc:creator`); look them up by local name.
 */

export interface XmlNode {
  /** Full tag name including any namespace prefix. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text of this element (CDATA included, entities decoded). */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the XML/HTML entities that turn up in feeds. */
export function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 ? safeFromCodePoint(cp) : m;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named ?? m;
  });
}

function safeFromCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/** Return the local name (namespace prefix stripped), lowercased. */
export function localName(name: string): string {
  const i = name.indexOf(":");
  return (i === -1 ? name : name.slice(i + 1)).toLowerCase();
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1]!.toLowerCase();
    const val = m[3] ?? m[4] ?? m[5] ?? "";
    attrs[key] = decodeEntities(val);
  }
  return attrs;
}

/**
 * Parse an XML string into a single root node. Text outside the root is ignored;
 * a document with several roots returns the first. Returns null when there is no
 * element at all.
 */
export function parseXml(xml: string): XmlNode | null {
  // Strip byte-order mark, declaration, comments, processing instructions, DOCTYPE.
  let src = xml.replace(/^﻿/, "");
  src = src.replace(/<!--[\s\S]*?-->/g, "");
  src = src.replace(/<\?[\s\S]*?\?>/g, "");
  src = src.replace(/<!DOCTYPE[\s\S]*?>/gi, "");

  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];

  const tagRe = /<(\/?)([a-zA-Z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1]!;

  const addText = (raw: string) => {
    if (!raw) return;
    const node = top();
    if (node !== root) node.text += decodeEntities(raw);
  };

  while ((m = tagRe.exec(src)) !== null) {
    addText(src.slice(last, m.index));
    last = tagRe.lastIndex;

    if (m[5] !== undefined) {
      // CDATA — verbatim text, no entity decoding.
      const node = top();
      if (node !== root) node.text += m[5];
      continue;
    }

    const closing = m[1] === "/";
    const name = m[2]!;
    const selfClose = m[4] === "/";

    if (closing) {
      // Pop to the matching open tag (tolerant of mismatches).
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]!.name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node: XmlNode = { name, attrs: parseAttrs(m[3] ?? ""), children: [], text: "" };
    top().children.push(node);
    if (!selfClose) stack.push(node);
  }
  addText(src.slice(last));

  return root.children[0] ?? null;
}

/** First direct child with the given local name (case-insensitive, prefix-agnostic). */
export function child(node: XmlNode | null | undefined, local: string): XmlNode | undefined {
  if (!node) return undefined;
  const want = local.toLowerCase();
  return node.children.find((c) => localName(c.name) === want);
}

/** All direct children with the given local name. */
export function children(node: XmlNode | null | undefined, local: string): XmlNode[] {
  if (!node) return [];
  const want = local.toLowerCase();
  return node.children.filter((c) => localName(c.name) === want);
}

/** Trimmed text of the first child with the given local name, or "". */
export function childText(node: XmlNode | null | undefined, local: string): string {
  return child(node, local)?.text.trim() ?? "";
}
