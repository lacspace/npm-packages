/**
 * Turn a parsed page into data — either by applying a CSS-selector {@link Schema}
 * or by running the auto-extractors (metadata, headings, links, images, emails,
 * phones, OpenGraph, JSON-LD, feeds, readable text, tables). All pure functions
 * over the {@link ./html.ts} tree; URL resolution takes an optional base.
 */
import { type ElNode, type Node, innerText, textContent, childElements, descendants } from "./html.js";
import { queryAll, queryOne } from "./select.js";
import type { AutoData, AutoOptions, FieldSpec, LinkInfo, Schema, ScrapeRecord } from "./types.js";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Serialize an element's children back to HTML (best-effort). */
function serializeChildren(el: ElNode): string {
  return el.children.map(serializeNode).join("");
}
function serializeNode(n: Node): string {
  if (n.type === "text") return n.text;
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${v.replace(/"/g, "&quot;")}"`))
    .join("");
  if (VOID.has(n.tag)) return `<${n.tag}${attrs}>`;
  return `<${n.tag}${attrs}>${serializeChildren(n)}</${n.tag}>`;
}

function absolutize(url: string, base?: string): string {
  if (!base) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

const URL_ATTRS = new Set(["href", "src", "srcset", "poster", "data-src"]);

/** Read one value out of an element per a field's `attr` directive. */
export function readValue(el: ElNode, attr?: string, trim = true, base?: string): string {
  if (!attr || attr === "text") {
    const t = innerText(el);
    return trim ? t : textContent(el);
  }
  if (attr === "html") return serializeChildren(el);
  if (attr === "outerHtml") return serializeNode(el);
  const name = attr.startsWith("@") ? attr.slice(1).toLowerCase() : attr.toLowerCase();
  const v = el.attrs[name] ?? "";
  return URL_ATTRS.has(name) && v ? absolutize(v, base) : v;
}

function normalizeSpec(spec: string | FieldSpec): FieldSpec {
  return typeof spec === "string" ? { selector: spec } : spec;
}

/** Resolve one schema field against a scope element. */
export function resolveField(scope: ElNode, spec: string | FieldSpec, base?: string): unknown {
  const s = normalizeSpec(spec);
  const els = s.selector ? queryAll(scope, s.selector) : [scope];
  const read = (el: ElNode): string => readValue(el, s.attr, s.trim ?? true, base);
  if (s.all) return els.map(read).filter((v) => v !== "");
  return els.length ? read(els[0]!) : undefined;
}

/** Apply a schema to a root, producing one record. */
export function applySchema(root: ElNode, schema: Schema, base?: string): ScrapeRecord {
  const rec: ScrapeRecord = {};
  for (const [field, spec] of Object.entries(schema)) rec[field] = resolveField(root, spec, base);
  return rec;
}

/** Apply a schema to EACH element matching `itemSelector` — one record per item. */
export function applySchemaItems(root: ElNode, itemSelector: string, schema: Schema, base?: string): ScrapeRecord[] {
  return queryAll(root, itemSelector).map((item) => {
    const rec: ScrapeRecord = {};
    for (const [field, spec] of Object.entries(schema)) rec[field] = resolveField(item, spec, base);
    return rec;
  });
}

// ---------- Auto-extractors ----------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_JUNK = /\.(png|jpe?g|gif|svg|webp|css|js)$|@\d+x\.|@(sentry|example|domain|email|your|test)\./i;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

function metaContent(root: ElNode, sel: string): string | undefined {
  const el = queryOne(root, sel);
  const v = el?.attrs.content;
  return v ? v.trim() : undefined;
}

export function extractMeta(root: ElNode, base?: string): Pick<AutoData, "title" | "description" | "canonical" | "lang"> {
  const out: Pick<AutoData, "title" | "description" | "canonical" | "lang"> = {};
  const title = queryOne(root, "title");
  if (title) out.title = innerText(title);
  const desc = metaContent(root, 'meta[name="description"]') ?? metaContent(root, 'meta[property="og:description"]');
  if (desc) out.description = desc;
  const canon = queryOne(root, 'link[rel="canonical"]')?.attrs.href;
  if (canon) out.canonical = absolutize(canon, base);
  const html = queryOne(root, "html")?.attrs.lang;
  if (html) out.lang = html;
  return out;
}

export function extractHeadings(root: ElNode): { level: number; text: string }[] {
  return queryAll(root, "h1,h2,h3,h4,h5,h6")
    .map((el) => ({ level: Number(el.tag[1]), text: innerText(el) }))
    .filter((h) => h.text);
}

export function extractLinks(root: ElNode, base?: string): LinkInfo[] {
  const seen = new Set<string>();
  const out: LinkInfo[] = [];
  for (const a of queryAll(root, "a[href]")) {
    const raw = a.attrs.href ?? "";
    if (!raw || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) continue;
    const href = absolutize(raw, base);
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ href, text: innerText(a) });
  }
  return out;
}

export function extractImages(root: ElNode, base?: string): string[] {
  const seen = new Set<string>();
  for (const img of queryAll(root, "img[src]")) {
    const raw = img.attrs.src ?? "";
    if (raw) seen.add(absolutize(raw, base));
  }
  return [...seen];
}

export function extractEmails(root: ElNode): string[] {
  const found = new Set<string>();
  for (const a of queryAll(root, 'a[href^="mailto:"]')) {
    const e = (a.attrs.href ?? "").replace(/^mailto:/i, "").split("?")[0]!.trim().toLowerCase();
    if (e && !EMAIL_JUNK.test(e)) found.add(e);
  }
  for (const m of textContent(root).matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase();
    if (!EMAIL_JUNK.test(e)) found.add(e);
  }
  return [...found];
}

export function extractPhones(root: ElNode): string[] {
  const found = new Set<string>();
  for (const a of queryAll(root, 'a[href^="tel:"]')) {
    const p = (a.attrs.href ?? "").replace(/^tel:/i, "").trim();
    if (p) found.add(p);
  }
  const text = textContent(root);
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/[^\d]/g, "");
    if (digits.length >= 7 && digits.length <= 15) found.add(m[0].trim());
  }
  return [...found];
}

export function extractOpenGraph(root: ElNode): Record<string, string> {
  const og: Record<string, string> = {};
  for (const m of queryAll(root, 'meta[property^="og:"]')) {
    const prop = (m.attrs.property ?? "").slice(3);
    const content = m.attrs.content;
    if (prop && content && og[prop] === undefined) og[prop] = content;
  }
  return og;
}

export function extractJsonLd(root: ElNode): unknown[] {
  const out: unknown[] = [];
  for (const s of queryAll(root, 'script[type="application/ld+json"]')) {
    const raw = textContent(s).trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* skip malformed JSON-LD */
    }
  }
  return out;
}

export function extractFeeds(root: ElNode, base?: string): string[] {
  const out = new Set<string>();
  for (const l of queryAll(root, 'link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/json"]')) {
    const href = l.attrs.href;
    if (href) out.add(absolutize(href, base));
  }
  return [...out];
}

export function extractText(root: ElNode): string {
  const scope = queryOne(root, "article") ?? queryOne(root, "main") ?? queryOne(root, "body") ?? root;
  const parts = queryAll(scope, "p, li, h1, h2, h3").map(innerText).filter((t) => t.length > 1);
  return parts.join("\n\n");
}

/** Extract every `<table>` as an array of header-keyed row objects. */
export function extractTables(root: ElNode): Record<string, string>[][] {
  return queryAll(root, "table").map((table) => {
    const rows = queryAll(table, "tr");
    if (!rows.length) return [];
    const headEls = childElements(rows[0]!).filter((c) => c.tag === "th" || c.tag === "td");
    const headers = headEls.map((h, i) => innerText(h) || `col${i + 1}`);
    const bodyStart = childElements(rows[0]!).some((c) => c.tag === "th") ? 1 : 0;
    const out: Record<string, string>[] = [];
    for (let r = bodyStart; r < rows.length; r++) {
      const cells = childElements(rows[r]!).filter((c) => c.tag === "td" || c.tag === "th");
      if (!cells.length) continue;
      const obj: Record<string, string> = {};
      cells.forEach((cell, i) => { obj[headers[i] ?? `col${i + 1}`] = innerText(cell); });
      out.push(obj);
    }
    return out;
  });
}

const DEFAULT_AUTO: AutoOptions = { metadata: true, headings: true, links: true, images: true, openGraph: true, jsonLd: true };

/** Run the requested auto-extractors over a page. */
export function autoExtract(root: ElNode, url: string | undefined, opts: boolean | AutoOptions): AutoData {
  const o: AutoOptions = opts === true ? DEFAULT_AUTO : (opts || {});
  const data: AutoData = {};
  if (url) data.url = url;
  if (o.metadata) Object.assign(data, extractMeta(root, url));
  if (o.headings) data.headings = extractHeadings(root);
  if (o.links) data.links = extractLinks(root, url);
  if (o.images) data.images = extractImages(root, url);
  if (o.emails) data.emails = extractEmails(root);
  if (o.phones) data.phones = extractPhones(root);
  if (o.openGraph) data.openGraph = extractOpenGraph(root);
  if (o.jsonLd) data.jsonLd = extractJsonLd(root);
  if (o.feeds) data.feeds = extractFeeds(root, url);
  if (o.text) data.text = extractText(root);
  if (o.tables) data.tables = extractTables(root);
  return data;
}

/** Descendant elements (re-exported for callers building custom extractors). */
export { descendants };
