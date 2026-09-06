/**
 * A compact, zero-dependency HTML parser. It turns a markup string into a small
 * DOM-like tree that {@link ./select.ts} can query with CSS selectors and that
 * {@link ./extract.ts} reads. It is deliberately forgiving (real-world HTML is
 * messy) rather than spec-perfect — good enough to scrape, not to render.
 */

/** An element node — a tag with attributes and children. */
export interface ElNode {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  parent?: ElNode;
}
/** A text node. */
export interface TextNode {
  type: "text";
  text: string;
  parent?: ElNode;
}
export type Node = ElNode | TextNode;

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
// Elements whose content is raw text (not parsed as markup).
const RAWTEXT = new Set(["script", "style", "textarea", "title", "noscript"]);

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", euro: "€", pound: "£",
};

/** Decode the common HTML entities (named + numeric). Pure. */
export function decodeEntities(s: string): string {
  if (!s || s.indexOf("&") === -1) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : m;
    }
    const named = NAMED[body];
    return named !== undefined ? named : m;
  });
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!s) return attrs;
  const re = /([^\s/>"'=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const name = m[1]!.toLowerCase();
    if (!name) continue;
    const raw = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[name] = decodeEntities(raw);
  }
  return attrs;
}

const OPEN_RE = /^<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/;
const CLOSE_RE = /^<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>/;

/** Parse HTML into a root {@link ElNode} (tag `#root`). Never throws. */
export function parseHTML(html: string): ElNode {
  const root: ElNode = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: ElNode[] = [root];
  const add = (n: Node): void => {
    const p = stack[stack.length - 1]!;
    n.parent = p;
    p.children.push(n);
  };

  let i = 0;
  const len = html.length;
  while (i < len) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      const text = html.slice(i);
      if (text) add({ type: "text", text: decodeEntities(text) });
      break;
    }
    if (lt > i) add({ type: "text", text: decodeEntities(html.slice(i, lt)) });

    const slice = html.slice(lt);
    if (slice.startsWith("<!--")) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }
    if (slice[1] === "!" || slice[1] === "?") {
      const end = html.indexOf(">", lt);
      i = end === -1 ? len : end + 1;
      continue;
    }

    const close = CLOSE_RE.exec(slice);
    if (close) {
      const tag = close[1]!.toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s]!.tag === tag) {
          stack.length = s;
          break;
        }
      }
      i = lt + close[0].length;
      continue;
    }

    const open = OPEN_RE.exec(slice);
    if (!open) {
      add({ type: "text", text: "<" });
      i = lt + 1;
      continue;
    }
    const tag = open[1]!.toLowerCase();
    const el: ElNode = { type: "element", tag, attrs: parseAttrs(open[2] ?? ""), children: [] };
    add(el);
    i = lt + open[0].length;

    if (VOID.has(tag) || open[3] === "/") continue;

    if (RAWTEXT.has(tag)) {
      const closeRe = new RegExp(`</${tag}(?:\\s[^>]*)?>`, "i");
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      const inner = m ? rest.slice(0, m.index) : rest;
      if (inner) {
        const t: TextNode = { type: "text", text: tag === "script" || tag === "style" ? inner : decodeEntities(inner), parent: el };
        el.children.push(t);
      }
      i = m ? i + m.index + m[0].length : len;
      continue;
    }
    stack.push(el);
  }
  return root;
}

/** All descendant elements of `node`, in document order. */
export function descendants(node: ElNode): ElNode[] {
  const out: ElNode[] = [];
  const walk = (n: ElNode): void => {
    for (const c of n.children) {
      if (c.type === "element") {
        out.push(c);
        walk(c);
      }
    }
  };
  walk(node);
  return out;
}

/** The concatenated text content of an element (all descendant text). */
export function textContent(node: Node): string {
  if (node.type === "text") return node.text;
  let out = "";
  for (const c of node.children) out += textContent(c);
  return out;
}

/** Collapsed, trimmed visible text of an element. */
export function innerText(node: Node): string {
  return textContent(node).replace(/\s+/g, " ").trim();
}

/** Direct element children matching an optional tag. */
export function childElements(node: ElNode, tag?: string): ElNode[] {
  return node.children.filter(
    (c): c is ElNode => c.type === "element" && (!tag || c.tag === tag),
  );
}
