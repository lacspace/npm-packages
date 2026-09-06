/**
 * The extraction dispatcher — pick the right engine for a file by its type and
 * return a normalised result: text, tables, rows, per-page text, metadata
 * and/or readable article content.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { readRows, type DataRow } from "lacspace-scraper";
import { extractPdfText, extractPdfPages, pdfMeta, type PdfPage, type PdfMeta } from "./pdf.js";
import { htmlTables, htmlText, lineTables } from "./tables.js";
import { extractDocx, extractPptx, extractEpub } from "./office.js";
import { readableHtml, type ReadableResult } from "./readable.js";

export type SourceKind = "pdf" | "html" | "spreadsheet" | "office" | "text";

export interface ExtractResult {
  file: string;
  kind: SourceKind;
  /** Extracted plain text (pdf/html/office/text). */
  text?: string;
  /** PDF page count. */
  pageCount?: number;
  /** Tables as arrays of rows (html = header-keyed objects; pdf/office/text = string cells). */
  tables?: Record<string, string>[][] | string[][][];
  /** Tabular rows (spreadsheet/csv/json input). */
  rows?: DataRow[];
  /** Per-page (PDF) or per-slide (PPTX) text, when requested/available. */
  pages?: PdfPage[];
  /** Document metadata (PDF `--meta`, EPUB title). */
  meta?: Record<string, string>;
  /** True when a PDF is encrypted (text may be empty — see README). */
  encrypted?: boolean;
  /** Readable main-article content (HTML `--readable`). */
  readable?: ReadableResult;
}

export interface ExtractOptions {
  /** Also detect tables (default: on for html, off for pdf/text unless set). */
  tables?: boolean;
  /** Force text extraction even for spreadsheets/html. */
  text?: boolean;
  /** PDF page range (e.g. "2-5", "1,3,5", "4-"). Implies per-page extraction. */
  pages?: string;
  /** Emit one text block per PDF page / PPTX slide. */
  perPage?: boolean;
  /** Include document metadata (PDF Info/XMP, EPUB title). */
  meta?: boolean;
  /** Extract the main readable article from HTML (drop nav/footer/aside). */
  readable?: boolean;
}

function kindOf(ext: string): SourceKind {
  if (ext === "pdf") return "pdf";
  if (ext === "html" || ext === "htm" || ext === "xhtml") return "html";
  if (ext === "docx" || ext === "pptx" || ext === "epub") return "office";
  if (["csv", "tsv", "xlsx", "xls", "json", "ndjson", "jsonl"].includes(ext)) return "spreadsheet";
  return "text";
}

function metaToRecord(m: PdfMeta): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of ["title", "author", "subject", "keywords", "creator", "producer", "created", "modified"] as const) {
    const v = m[k];
    if (v) r[k] = v;
  }
  return r;
}

/** Extract text/tables/rows from a file. Never throws for empty results. */
export async function extractFile(file: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const ext = extname(file).toLowerCase().replace(/^\./, "");
  const kind = kindOf(ext);
  const result: ExtractResult = { file, kind };

  if (kind === "pdf") {
    const bytes = await readFile(file);
    if (opts.meta) {
      const m = pdfMeta(bytes);
      result.meta = metaToRecord(m);
      if (m.encrypted) result.encrypted = true;
    }
    if (opts.perPage || opts.pages) {
      const pages = extractPdfPages(bytes, { range: opts.pages });
      const whole = extractPdfText(bytes);
      result.pages = pages;
      result.text = pages.map((p) => p.text).join("\n\n");
      result.pageCount = whole.pageCount;
      if (whole.encrypted) result.encrypted = true;
    } else {
      const { text, pageCount, encrypted } = extractPdfText(bytes);
      result.text = text;
      result.pageCount = pageCount;
      if (encrypted) result.encrypted = true;
    }
    if (opts.tables) result.tables = lineTables(result.text ?? "");
    return result;
  }

  if (kind === "office") {
    const bytes = await readFile(file);
    if (ext === "docx") {
      const { text, tables } = extractDocx(bytes);
      result.text = text;
      if (opts.tables && tables.length) result.tables = tables;
    } else if (ext === "pptx") {
      const { text, slides } = extractPptx(bytes);
      result.text = text;
      result.pages = slides;
      result.pageCount = slides.length;
    } else {
      const { text, title } = extractEpub(bytes);
      result.text = text;
      if (title) result.meta = { title };
    }
    return result;
  }

  if (kind === "html") {
    const html = await readFile(file, "utf8");
    if (opts.readable) {
      const r = readableHtml(html);
      result.readable = r;
      result.text = r.text;
      result.meta = r.meta;
      if (opts.tables) result.tables = htmlTables(html);
    } else {
      result.tables = htmlTables(html); // tables are the point of HTML extraction
      if (opts.text) result.text = htmlText(html);
    }
    return result;
  }

  if (kind === "spreadsheet") {
    result.rows = await readRows(file);
    return result;
  }

  // plain text
  const text = await readFile(file, "utf8");
  result.text = text;
  if (opts.tables) result.tables = lineTables(text);
  return result;
}
