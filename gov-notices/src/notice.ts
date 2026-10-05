import { nepalDay, parseDate, type ParsedDate } from "./dates.js";

export type AttachmentType = "pdf" | "image" | "doc" | "other";

export interface Attachment {
  /** Absolute URL. */
  url: string;
  type: AttachmentType;
  label?: string;
}

export interface Notice {
  /** Stable hash of sourceId + url (or sourceId + title + date when there is no url). */
  id: string;
  sourceId: string;
  title: string;
  titleLang: "ne" | "en" | "mixed";
  /** ISO YYYY-MM-DD (AD). */
  date?: string;
  /** YYYY-MM-DD in Bikram Sambat, ASCII digits. */
  dateBs?: string;
  /** The date exactly as printed. */
  dateRaw?: string;
  /** Absolute URL of the notice (detail page, or the file itself). */
  url?: string;
  attachments: Attachment[];
  category?: string;
  /** e.g. 'result', 'exam', 'vacancy', 'schedule', 'admit-card', 'syllabus'. */
  tags?: string[];
}

/** What an adapter extracts before normalisation. */
export interface RawNotice {
  title: string;
  /** Text holding the date (cleaned to the matched part in `dateRaw`). */
  dateText?: string;
  /** Already-known dates (JSON APIs), used instead of parsing `dateText`. */
  date?: string;
  dateBs?: string;
  /** ISO timestamp; converted to the Nepal calendar day. */
  timestamp?: string;
  url?: string;
  attachments?: { url: string; label?: string; type?: AttachmentType }[];
  category?: string;
}

const FILE_EXT: Record<string, AttachmentType> = {
  pdf: "pdf", jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image",
  doc: "doc", docx: "doc", xls: "doc", xlsx: "doc", ppt: "doc", pptx: "doc", odt: "doc", ods: "doc", csv: "doc",
  zip: "other", rar: "other",
};

/** The file extension of a URL path, lower-cased ("" when none). */
export function extOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? m[1]!.toLowerCase() : "";
}

/** Is this URL a downloadable file (pdf/image/office/archive)? */
export function isFileUrl(url: string): boolean {
  return extOf(url) in FILE_EXT;
}

/** Attachment type from the URL's extension. */
export function attachmentType(url: string): AttachmentType {
  return FILE_EXT[extOf(url)] ?? "other";
}

/** Resolve `href` against `base`; undefined for javascript:/mailto:/tel:/# links. */
export function absUrl(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (!h || h === "#" || h === "null" || h === "undefined" || /^(javascript|mailto|tel|data):/i.test(h)) return undefined;
  try {
    return new URL(h, base).href;
  } catch {
    return undefined;
  }
}

/** Collapse whitespace; strip "New"/"नयाँ" badges, trailing "(PDF)", leading serials. */
export function cleanTitle(s: string): string {
  let t = s.replace(/\u00a0/g, " ").replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t
      .replace(/^(?:क्र\.?\s*सं\.?|S\.?\s*N\.?|sn)\s*[:.-]?\s*/i, "")
      .replace(/^[0-9०-९]{1,3}\s*[.)।]\s+/, "")
      .replace(/^(?:new|नयाँ|नयाँ!)\s*[!:-]?\s+/i, "")
      .replace(/\s*[-–|]?\s*(?:new|नयाँ)!?$/i, "")
      .replace(/\s*\((?:pdf|PDF|Pdf)\)\s*$/, "")
      .replace(/\s*\[(?:pdf|PDF)\]\s*$/, "")
      .trim();
    if (t === before) break;
  }
  return t;
}

/** 'ne' when Devanagari is ≥ 60% of letters, 'en' when ≤ 10%, else 'mixed'. */
export function titleLang(s: string): "ne" | "en" | "mixed" {
  let dev = 0;
  let lat = 0;
  for (const ch of s) {
    if (/[ऀ-ॿ]/.test(ch)) { if (!/[०-९]/.test(ch)) dev++; } else if (/\p{L}/u.test(ch)) lat++;
  }
  const total = dev + lat;
  if (!total) return "en";
  const r = dev / total;
  return r >= 0.6 ? "ne" : r <= 0.1 ? "en" : "mixed";
}

const TAG_RULES: [string, RegExp][] = [
  ["result", /result|नतिजा|परिणाम|नतीजा|परीक्षाफल|परिक्षाफल/i],
  ["exam", /परीक्षा|परिक्षा|exam/i],
  ["schedule", /तालिका|routine|schedule|calendar|कार्यतालिका/i],
  ["admit-card", /प्रवेश\s?पत्र|admit\s?card/i],
  ["vacancy", /विज्ञापन|vacancy|दरखास्त|vacancies/i],
  ["syllabus", /पाठ्यक्रम|syllabus|curriculum/i],
];

/** Tags inferred from the title (and category). */
export function tag(n: Pick<Notice, "title"> & { category?: string }): string[] {
  const text = `${n.title} ${n.category ?? ""}`;
  return TAG_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
}

/** Does this notice announce a result? */
export function isResult(n: Pick<Notice, "title"> & { tags?: string[]; category?: string }): boolean {
  return (n.tags ?? tag(n)).includes("result");
}

/** 64-bit FNV-1a as 16 hex chars (pure JS, isomorphic, stable across runtimes). */
export function hashId(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    h2 = (h2 ^ (h2 >>> 15)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const normTitle = (s: string) => s.toLowerCase().replace(/[\s।|,.:;!?'"()\-–—_/]+/g, " ").trim();

/** Turn an adapter's raw item into a {@link Notice}. Returns null when there is no title. */
export function finalize(r: RawNotice, sourceId: string, baseUrl: string): Notice | null {
  const title = cleanTitle(r.title ?? "");
  if (!title || title.length < 3) return null;
  const n: Notice = { id: "", sourceId, title, titleLang: titleLang(title), attachments: [] };

  let pd: ParsedDate | null = null;
  if (r.date || r.dateBs) {
    if (r.date) n.date = r.date;
    if (r.dateBs) n.dateBs = r.dateBs;
    if (r.dateText) n.dateRaw = r.dateText.replace(/\s+/g, " ").trim();
    if (!n.date && r.dateBs) {
      pd = parseDate(r.dateBs);
      if (pd) n.date = pd.ad;
    }
  } else if (r.timestamp) {
    pd = nepalDay(r.timestamp);
    if (pd) { n.date = pd.ad; if (pd.bs) n.dateBs = pd.bs; n.dateRaw = r.timestamp; }
  } else if (r.dateText) {
    pd = parseDate(r.dateText);
    if (pd) { n.date = pd.ad; if (pd.bs) n.dateBs = pd.bs; n.dateRaw = pd.raw.trim(); }
  }

  const url = absUrl(r.url, baseUrl);
  if (url) n.url = url;
  const seen = new Set<string>();
  for (const a of r.attachments ?? []) {
    const u = absUrl(a.url, baseUrl);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    const att: Attachment = { url: u, type: a.type ?? attachmentType(u) };
    const label = a.label?.replace(/\s+/g, " ").trim();
    if (label) att.label = label;
    n.attachments.push(att);
  }
  if (!n.url && n.attachments[0]) n.url = n.attachments[0].url;
  if (r.category) n.category = r.category.replace(/\s+/g, " ").trim();
  const tags = tag(n);
  if (tags.length) n.tags = tags;
  n.id = hashId(n.url ? `${sourceId}|${n.url}` : `${sourceId}|${normTitle(title)}|${n.date ?? ""}`);
  return n;
}
