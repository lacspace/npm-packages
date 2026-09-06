/**
 * A small readability extractor: find the main article of an HTML page (drop
 * nav/footer/aside/ads), keep its heading/paragraph/list/table structure, and
 * pull page metadata. Not a full Readability.js clone — a pragmatic, zero-dep
 * best-effort that works well on real article/blog/docs pages.
 */
import { parseHTML, queryOne, queryAll, innerText, textContent, childElements, extractMeta, extractOpenGraph } from "lacspace-scraper";
import type { ElNode } from "lacspace-scraper";
import type { Block } from "./markdown.js";

export interface ReadableResult {
  title?: string;
  byline?: string;
  excerpt?: string;
  /** Plain readable text of the main content. */
  text: string;
  /** Ordered structural blocks of the main content. */
  blocks: Block[];
  /** Page metadata (title/description/canonical/lang + og:* keys). */
  meta: Record<string, string>;
}

const STRIP = new Set(["script", "style", "noscript", "svg", "nav", "footer", "aside", "header", "form", "button", "iframe", "figure"]);
const JUNK = /(^|[\s_-])(nav|navbar|menu|footer|sidebar|side-bar|comment|share|social|promo|advert|\bad\b|ads|banner|cookie|subscribe|newsletter|related|breadcrumb|pagination)([\s_-]|$)/i;
const KEEP = /(article|content|post|entry|main|story|body|prose|markdown|rich-text|blog)/i;

function isJunk(el: ElNode): boolean {
  const sig = `${el.attrs["class"] ?? ""} ${el.attrs["id"] ?? ""} ${el.attrs["role"] ?? ""}`;
  return JUNK.test(sig) && !KEEP.test(sig);
}

/** Recursively drop stripped tags and junk-classed containers. */
function prune(el: ElNode): void {
  el.children = el.children.filter((c) => {
    if (c.type !== "element") return true;
    if (STRIP.has(c.tag)) return false;
    if (isJunk(c)) return false;
    return true;
  });
  for (const c of el.children) if (c.type === "element") prune(c);
}

/** Score a candidate container by its paragraph text, penalising link density. */
function score(el: ElNode): number {
  const paras = queryAll(el, "p");
  let s = 0;
  for (const p of paras) { const len = innerText(p).trim().length; if (len > 25) s += len / 25 + 1; }
  const total = innerText(el).length || 1;
  const linkLen = queryAll(el, "a").reduce((n, a) => n + innerText(a).length, 0);
  s *= 1 - Math.min(0.9, linkLen / total); // heavy nav/link blocks lose score
  const sig = `${el.attrs["class"] ?? ""} ${el.attrs["id"] ?? ""}`;
  if (KEEP.test(sig)) s += 15;
  if (JUNK.test(sig)) s -= 25;
  return s;
}

function tableRows(el: ElNode): string[][] {
  return queryAll(el, "tr").map((tr) => childElements(tr).filter((c) => c.tag === "td" || c.tag === "th").map((c) => innerText(c).trim()));
}

/** Walk a container into ordered blocks; stops descending into block leaves. */
function collect(el: ElNode, out: Block[]): void {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    const tag = child.tag;
    if (/^h[1-6]$/.test(tag)) {
      const text = innerText(child).trim();
      if (text) out.push({ type: "heading", level: Number(tag[1]), text });
    } else if (tag === "p" || tag === "blockquote") {
      const text = innerText(child).trim();
      if (text) out.push({ type: "paragraph", text });
    } else if (tag === "pre") {
      const text = textContent(child);
      if (text.trim()) out.push({ type: "code", text });
    } else if (tag === "ul" || tag === "ol") {
      const items = childElements(child, "li").map((li) => innerText(li).trim()).filter(Boolean);
      if (items.length) out.push({ type: "list", items, ordered: tag === "ol" });
    } else if (tag === "table") {
      const rows = tableRows(child).filter((r) => r.length);
      if (rows.length) out.push({ type: "table", rows });
    } else {
      collect(child, out);
    }
  }
}

function findByline(root: ElNode): string | undefined {
  const meta = queryOne(root, 'meta[name=author]');
  if (meta?.attrs["content"]) return meta.attrs["content"].trim();
  for (const sel of ["[rel=author]", ".author", ".byline", '[itemprop=author]']) {
    const el = queryOne(root, sel);
    const t = el ? innerText(el).trim() : "";
    if (t) return t.replace(/^by\s+/i, "").trim();
  }
  return undefined;
}

/** Extract the main readable content + metadata from HTML. */
export function readableHtml(html: string): ReadableResult {
  const rawRoot = parseHTML(html);
  const meta: Record<string, string> = {};
  const m = extractMeta(rawRoot);
  for (const [k, v] of Object.entries(m)) if (v) meta[k] = String(v);
  for (const [k, v] of Object.entries(extractOpenGraph(rawRoot))) meta[`og:${k}`] = v;
  const byline = findByline(rawRoot);
  if (byline) meta["author"] = byline;

  // Work on a pruned copy for content selection.
  const root = parseHTML(html);
  prune(root);
  const body = queryOne(root, "body") ?? root;

  let best: ElNode | undefined;
  let bestScore = -Infinity;
  const explicit = queryOne(body, "article") ?? queryOne(body, "main") ?? queryOne(body, "[role=main]");
  const candidates = explicit ? [explicit] : [...queryAll(body, "article"), ...queryAll(body, "section"), ...queryAll(body, "div"), body];
  for (const c of candidates) { const s = score(c); if (s > bestScore) { bestScore = s; best = c; } }
  const main = best ?? body;

  const blocks: Block[] = [];
  collect(main, blocks);
  // If structural walk found nothing (unstructured markup), fall back to text.
  if (!blocks.length) { const t = innerText(main).trim(); if (t) blocks.push({ type: "paragraph", text: t }); }

  const text = blocks.map((b) => {
    if (b.type === "heading") return b.text;
    if (b.type === "paragraph" || b.type === "code") return b.text;
    if (b.type === "list") return b.items.map((i) => `- ${i}`).join("\n");
    return b.rows.map((r) => r.join("\t")).join("\n");
  }).join("\n\n").trim();

  const firstPara = blocks.find((b) => b.type === "paragraph") as { text: string } | undefined;
  const excerpt = firstPara ? firstPara.text.slice(0, 280) : undefined;

  return {
    title: meta["og:title"] || meta["title"] || (queryOne(rawRoot, "h1") ? innerText(queryOne(rawRoot, "h1")!).trim() : undefined),
    byline,
    excerpt,
    text,
    blocks,
    meta,
  };
}
