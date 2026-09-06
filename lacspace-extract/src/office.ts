/**
 * Zero-dependency readers for the ZIP-based office formats: DOCX, PPTX and
 * EPUB. Each is a ZIP of XML/XHTML (see ./zip.ts); here we walk the relevant
 * parts and reconstruct text (and, for DOCX, tables). No third-party library.
 */
import { parseHTML, queryOne, innerText, decodeEntities } from "lacspace-scraper";
import { readZip, zipText } from "./zip.js";

export interface DocxResult {
  text: string;
  /** Tables as arrays of string-cell rows (first row is whatever came first). */
  tables: string[][][];
}
export interface SlideText { page: number; text: string }
export interface PptxResult {
  text: string;
  slides: SlideText[];
}
export interface EpubResult {
  text: string;
  title?: string;
}

/**
 * Collect the concatenated text of `<w:t>` / `<a:t>` runs inside an XML chunk.
 * The `(?=[ />])` guard stops `w:t` from prefix-matching `w:tc`/`w:tbl` etc.
 */
function runText(xml: string, tag: "w:t" | "a:t"): string {
  const re = new RegExp(`<${tag}(?=[ />])[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += decodeEntities(m[1] ?? "");
  return out;
}

/**
 * Extract text + tables from a DOCX. Walks `word/document.xml`, keeping a
 * newline per paragraph (`w:p`), a tab per `w:tab`, and a break per `w:br`.
 */
export function extractDocx(bytes: Uint8Array): DocxResult {
  const zip = readZip(bytes);
  const xml = zipText(zip, "word/document.xml");
  if (!xml) return { text: "", tables: [] };

  // Ordered token walk: paragraph-ends, tabs, breaks and text runs.
  const re = /<w:t(?=[ />])[^>]*>([\s\S]*?)<\/w:t>|<\/w:p>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<w:cr\b[^>]*\/?>/g;
  let text = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) text += decodeEntities(m[1]);
    else if (m[0] === "</w:p>") text += "\n\n"; // paragraph break (blank line)
    else if (m[0].startsWith("<w:tab")) text += "\t";
    else text += "\n"; // br / cr = line break within a paragraph
  }

  // Tables: each <w:tbl> → rows <w:tr> → cells <w:tc>.
  const tables: string[][][] = [];
  const tblRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let t: RegExpExecArray | null;
  while ((t = tblRe.exec(xml))) {
    const rows: string[][] = [];
    const trRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let r: RegExpExecArray | null;
    while ((r = trRe.exec(t[0]))) {
      const cells: string[] = [];
      const tcRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
      let cm: RegExpExecArray | null;
      while ((cm = tcRe.exec(r[0]))) cells.push(runText(cm[0], "w:t").replace(/\s+/g, " ").trim());
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }

  const cleaned = text.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, tables };
}

/** Extract text per slide from a PPTX (`ppt/slides/slideN.xml`, in order). */
export function extractPptx(bytes: Uint8Array): PptxResult {
  const zip = readZip(bytes);
  const names = [...zip.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1])));
  const slides: SlideText[] = [];
  names.forEach((name, i) => {
    const xml = zipText(zip, name);
    // A paragraph end (</a:p>) becomes a newline so bullets/lines separate.
    const re = /<a:t(?=[ />])[^>]*>([\s\S]*?)<\/a:t>|<\/a:p>/g;
    let text = "";
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) text += m[1] !== undefined ? decodeEntities(m[1]) : "\n";
    const cleaned = text.split(/\r?\n/).map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    slides.push({ page: i + 1, text: cleaned });
  });
  return { text: slides.map((s) => s.text).filter(Boolean).join("\n\n"), slides };
}

/** Extract reading-order text from an EPUB (walk the OPF spine). */
export function extractEpub(bytes: Uint8Array): EpubResult {
  const zip = readZip(bytes);
  // 1. Find the OPF path from META-INF/container.xml.
  const container = zipText(zip, "META-INF/container.xml");
  const opfPath = container.match(/full-path="([^"]+)"/)?.[1]
    ?? [...zip.keys()].find((n) => n.toLowerCase().endsWith(".opf"));
  if (!opfPath) return { text: "" };
  const opf = zipText(zip, opfPath);
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1];

  // 2. Build manifest id → href.
  const manifest = new Map<string, string>();
  const itemRe = /<item\b[^>]*>/g;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(opf))) {
    const id = im[0].match(/id="([^"]+)"/)?.[1];
    const href = im[0].match(/href="([^"]+)"/)?.[1];
    if (id && href) manifest.set(id, decodeEntities(href));
  }

  // 3. Spine order → resolve hrefs → strip tags.
  const spine: string[] = [];
  const refRe = /<itemref\b[^>]*idref="([^"]+)"[^>]*>/g;
  let rm: RegExpExecArray | null;
  while ((rm = refRe.exec(opf))) { const href = manifest.get(rm[1]!); if (href) spine.push(href); }
  const hrefs = spine.length ? spine : [...manifest.values()].filter((h) => /\.x?html?$/i.test(h));

  const parts: string[] = [];
  for (const href of hrefs) {
    const path = (baseDir + href).replace(/[#?].*$/, "").replace(/\/\.\//g, "/");
    const doc = zipText(zip, path) || zipText(zip, href);
    if (!doc) continue;
    let text: string;
    try { const root = parseHTML(doc); text = innerText(queryOne(root, "body") ?? root); }
    catch { text = doc.replace(/<[^>]+>/g, " "); }
    text = decodeEntities(text).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text) parts.push(text);
  }
  return { text: parts.join("\n\n").trim(), title: title ? decodeEntities(title).trim() : undefined };
}
