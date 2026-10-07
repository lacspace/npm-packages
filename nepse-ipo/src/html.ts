/**
 * A small, tolerant HTML table reader. No DOM, no dependencies.
 * Handles missing closing tags, attributes in any quoting style, comments,
 * scripts/styles, and nested tables (each table is returned on its own).
 */

export interface HtmlLink {
  href: string;
  text: string;
}

export interface HtmlCell {
  tag: "td" | "th";
  html: string;
  text: string;
  links: HtmlLink[];
}

export type HtmlRow = HtmlCell[];
export type HtmlTable = HtmlRow[];

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  times: "×",
};

/** Decode named (common) and numeric HTML entities. Unknown entities are left as-is. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? whole;
  });
}

/** Strip tags, decode entities, collapse whitespace. */
export function htmlToText(html: string): string {
  const noTags = html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags).replace(/[\s ]+/g, " ").trim();
}

function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3];
}

function linksOf(html: string): HtmlLink[] {
  const out: HtmlLink[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = attr(m[1] ?? "", "href");
    if (href === undefined) continue;
    out.push({ href: decodeEntities(href).trim(), text: htmlToText(m[2] ?? "") });
  }
  return out;
}

/** Remove comments, scripts and styles so their contents are never read as markup. */
function clean(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");
}

interface Frame {
  rows: HtmlTable;
  row: HtmlRow | null;
  cell: { tag: "td" | "th"; start: number } | null;
}

/** Read every table in the document, in the order each one closes (inner tables first). */
export function readTables(input: string): HtmlTable[] {
  if (typeof input !== "string" || input === "") return [];
  const html = clean(input);
  const tables: HtmlTable[] = [];
  const stack: Frame[] = [];
  const re = /<(\/?)(table|tr|td|th|thead|tbody|tfoot)\b[^>]*>/gi;

  const closeCell = (f: Frame, end: number) => {
    if (!f.cell) return;
    const inner = html.slice(f.cell.start, end);
    if (!f.row) f.row = [];
    f.row.push({ tag: f.cell.tag, html: inner, text: htmlToText(inner), links: linksOf(inner) });
    f.cell = null;
  };
  const closeRow = (f: Frame, end: number) => {
    closeCell(f, end);
    if (f.row && f.row.length > 0) f.rows.push(f.row);
    f.row = null;
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const closing = m[1] === "/";
    const tag = (m[2] ?? "").toLowerCase();
    const top = stack[stack.length - 1];
    if (tag === "table") {
      if (!closing) {
        stack.push({ rows: [], row: null, cell: null });
      } else if (top) {
        closeRow(top, m.index);
        tables.push(top.rows);
        stack.pop();
      }
      continue;
    }
    if (!top) continue;
    if (tag === "tr") {
      closeRow(top, m.index);
      if (!closing) top.row = [];
    } else if (tag === "td" || tag === "th") {
      closeCell(top, m.index);
      if (!closing) top.cell = { tag, start: m.index + m[0].length };
    } else {
      // thead/tbody/tfoot boundaries end any open row.
      closeRow(top, m.index);
    }
  }
  while (stack.length > 0) {
    const f = stack.pop() as Frame;
    closeRow(f, html.length);
    tables.push(f.rows);
  }
  return tables;
}

/** Resolve a link against a base URL without the URL global (not complete in Hermes). */
export function resolveUrl(href: string, base: string): string | undefined {
  const h = href.trim();
  if (h === "") return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return /^https?:\/\//i.test(h) ? h : undefined;
  const b = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)([^?#]*)/i.exec(base.trim());
  if (!b) return undefined;
  const scheme = b[1] ?? "https:";
  const host = b[2] ?? "";
  if (h.startsWith("//")) return scheme + h;
  let path: string;
  let suffix = "";
  const q = h.search(/[?#]/);
  const hPath = q === -1 ? h : h.slice(0, q);
  if (q !== -1) suffix = h.slice(q);
  if (hPath.startsWith("/")) {
    path = hPath;
  } else {
    const basePath = b[3] || "/";
    const dir = basePath.slice(0, basePath.lastIndexOf("/") + 1) || "/";
    path = dir + hPath;
  }
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  const trailing = path.endsWith("/") && parts.length > 0 ? "/" : "";
  return `${scheme}//${host}/${parts.join("/")}${trailing}${suffix}`;
}
