/**
 * The generic notice-list finder: score every table, list and repeated block on
 * the page, keep the one that looks most like a notice board, and read each row.
 */
import { type ElNode, childElements, descendants, innerText } from "./html.js";
import { parseDate } from "./dates.js";
import { fuller, isFileUrl, type RawNotice } from "./notice.js";

const SKIP_TAGS = new Set(["nav", "header", "footer", "aside", "script", "style", "noscript", "form", "select", "button"]);
const SKIP_CLASS = /(?:^|[\s_-])(nav|navbar|menu|footer|header|breadcrumbs?|sidebar|dropdown|marquee|ticker|swiper|slider|carousel|social|pagination|copyright)(?:$|[\s_-])/i;
const NOTICE_WORDS = /सूचना|सुचना|notice|news|समाचार|नतिजा|result|परीक्षा|exam|announcement|circular|विज्ञापन|download/i;
const ACTION_TEXT = /^(?:download|डाउनलोड|view|हेर्नुहोस्?|हेर्ने|click here|यहाँ क्लिक|more|read more|थप|details?|pdf|file|विस्तृत)$/i;

/** Is the element inside navigation/menu/footer chrome? */
export function inChrome(el: ElNode): boolean {
  for (let p: ElNode | undefined = el; p && p.tag !== "#root"; p = p.parent) {
    if (SKIP_TAGS.has(p.tag)) return true;
    const cls = `${p.attrs.class ?? ""} ${p.attrs.id ?? ""} ${p.attrs.role ?? ""}`;
    if (cls.trim() && SKIP_CLASS.test(cls)) return true;
    if (p.attrs.role === "navigation" || p.attrs.role === "menu") return true;
  }
  return false;
}

interface Link { href: string; text: string; el: ElNode }

function links(row: ElNode): Link[] {
  const out: Link[] = [];
  for (const a of [row, ...descendants(row)]) {
    if (a.tag !== "a") continue;
    const href = (a.attrs.href ?? "").trim();
    if (!href || href === "#" || /^(javascript|mailto|tel):/i.test(href)) continue;
    out.push({ href, text: fuller(innerText(a), a.attrs.title, a.attrs["data-title"]), el: a });
  }
  return out;
}

const isAttachmentLink = (l: Link) => isFileUrl(l.href) || ACTION_TEXT.test(l.text.trim()) || /download/i.test(l.el.attrs.class ?? "");

/** Read one row/item into a raw notice (title, date, url, attachments). */
export function readRow(row: ElNode, cells?: ElNode[]): RawNotice | null {
  const ls = links(row);
  const text = innerText(row);
  if (!text) return null;
  // Title: the longest link text that is not an action word, else the longest cell.
  const titled = ls.filter((l) => !ACTION_TEXT.test(l.text.trim()) && l.text.length >= 6);
  titled.sort((a, b) => b.text.length - a.text.length);
  let title = titled[0]?.text ?? "";
  let dateText: string | undefined;
  const parts = cells && cells.length > 1 ? cells.map((c) => innerText(c)) : [];
  if (parts.length) {
    // Date: a cell that is mostly a date; title: longest non-date, non-serial cell.
    for (const p of parts) if (!dateText && p.length <= 60 && parseDate(p)) dateText = p;
    if (!title) {
      const cand = parts.filter((p) => p !== dateText && !/^[0-9०-९.\s]+$/.test(p) && !ACTION_TEXT.test(p));
      cand.sort((a, b) => b.length - a.length);
      title = cand[0] ?? "";
    }
  }
  if (!title) {
    // A list item: strip a short date run off the text.
    const d = parseDate(text);
    title = d ? text.replace(d.raw, " ").trim() : text;
  }
  if (!dateText) {
    const rest = title ? text.replace(title, " ") : text;
    if (parseDate(rest)) dateText = rest;
    else if (parseDate(text)) dateText = text;
  }
  const main = titled.find((l) => l.text === title && !isFileUrl(l.href)) ?? titled.find((l) => !isFileUrl(l.href))
    ?? ls.find((l) => !isAttachmentLink(l)) ?? titled[0] ?? ls[0];
  const attachments = ls.filter((l) => isAttachmentLink(l) || isFileUrl(l.href)).map((l) => ({ url: l.href, label: l.text || undefined }));
  const r: RawNotice = { title, attachments };
  if (main) r.url = main.href;
  if (dateText) r.dateText = dateText;
  return r;
}

interface Candidate { score: number; rows: { row: ElNode; cells?: ElNode[] }[] }

function signature(el: ElNode): string {
  return `${el.tag}.${(el.attrs.class ?? "").trim().split(/\s+/).sort().join(".")}`;
}

function contextWords(el: ElNode): boolean {
  let hops = 0;
  for (let p: ElNode | undefined = el; p && p.tag !== "#root" && hops < 4; p = p.parent, hops++) {
    if (NOTICE_WORDS.test(`${p.attrs.class ?? ""} ${p.attrs.id ?? ""}`)) return true;
    // A heading among the earlier siblings.
    const sibs = p.parent ? childElements(p.parent) : [];
    const idx = sibs.indexOf(p);
    for (let i = Math.max(0, idx - 3); i < idx; i++) {
      const s = sibs[i]!;
      const h = /^h[1-6]$/.test(s.tag) ? s : descendants(s).find((d) => /^h[1-6]$/.test(d.tag));
      if (h && NOTICE_WORDS.test(innerText(h))) return true;
    }
  }
  return false;
}

function score(rows: Candidate["rows"], container: ElNode): number {
  let s = 0;
  let withLink = 0;
  let dated = 0;
  let withFile = 0;
  for (const { row } of rows) {
    const text = innerText(row);
    const ls = links(row);
    const hasLink = ls.length > 0;
    const hasDate = !!parseDate(text);
    if (hasLink) withLink++;
    if (hasDate) dated++;
    if (ls.some((l) => isFileUrl(l.href))) withFile++;
    s += (hasLink ? 1 : 0) + (hasDate ? 2 : 0) + (hasLink && hasDate ? 2 : 0);
    if (text.length > 400) s -= 2;
  }
  // A notice board has dates or files; a menu has neither.
  if (withLink < 2 || (dated < 2 && withFile < 2)) return 0;
  if (contextWords(container)) s += 3 + rows.length * 0.5;
  return s;
}

/** Find the best notice list on the page and read it. */
export function genericParse(doc: ElNode): RawNotice[] {
  const cands: Candidate[] = [];
  for (const el of descendants(doc)) {
    if (el.tag === "table") {
      if (inChrome(el)) continue;
      const trs = descendants(el).filter((t) => t.tag === "tr" && closestTable(t) === el);
      const rows = trs
        .map((tr) => ({ row: tr, cells: childElements(tr).filter((c) => c.tag === "td" || c.tag === "th") }))
        .filter((r) => r.cells.some((c) => c.tag === "td") || links(r.row).length);
      if (rows.length >= 2) cands.push({ score: score(rows, el), rows });
    } else if (el.tag === "ul" || el.tag === "ol") {
      if (inChrome(el)) continue;
      const rows = childElements(el, "li").map((li) => ({ row: li }));
      if (rows.length >= 2) cands.push({ score: score(rows, el), rows });
    } else if (el.tag === "div" || el.tag === "section" || el.tag === "tbody") {
      if (el.tag === "tbody" || inChrome(el)) continue;
      const kids = childElements(el);
      if (kids.length < 3) continue;
      const groups = new Map<string, ElNode[]>();
      for (const k of kids) {
        if (k.tag === "ul" || k.tag === "ol" || k.tag === "table" || k.tag === "script" || k.tag === "style") continue;
        const sig = signature(k);
        groups.set(sig, [...(groups.get(sig) ?? []), k]);
      }
      for (const g of groups.values()) {
        if (g.length >= 3) {
          const rows = g.map((row) => ({ row }));
          cands.push({ score: score(rows, el), rows });
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best || best.score < 4) return [];
  const out: RawNotice[] = [];
  for (const { row, cells } of best.rows) {
    const r = readRow(row, cells);
    if (r && r.title) out.push(r);
  }
  return out;
}

function closestTable(el: ElNode): ElNode | undefined {
  for (let p = el.parent; p; p = p.parent) if (p.tag === "table") return p;
  return undefined;
}
