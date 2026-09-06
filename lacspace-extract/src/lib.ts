/**
 * lacspace-extract — pull text and tables out of PDFs, HTML pages and
 * spreadsheets into clean JSON / NDJSON / CSV / Excel. Zero-dependency PDF text
 * engine (no OCR), HTML table extraction, and CSV/Excel reading.
 *
 * ```ts
 * import { extractFile } from "lacspace-extract";
 * const { text, pageCount } = await extractFile("report.pdf");
 * const { tables } = await extractFile("page.html");
 * ```
 *
 * The PDF engine handles ordinary text-based PDFs — not scanned/image PDFs
 * (which need OCR) or exotic CID font encodings.
 */
export { extractFile, type ExtractResult, type ExtractOptions, type SourceKind } from "./extract.js";
export { extractPdfText, extractPdfPages, pdfMeta, pdfIsEncrypted, parsePageRange, type PdfText, type PdfPage, type PdfMeta } from "./pdf.js";
export { htmlTables, htmlText, lineTables, columnTables, splitFixedWidth } from "./tables.js";
// Office documents (DOCX / PPTX / EPUB) via the zero-dep ZIP reader.
export { readZip, zipText, type ZipEntry } from "./zip.js";
export { extractDocx, extractPptx, extractEpub, type DocxResult, type PptxResult, type EpubResult, type SlideText } from "./office.js";
// HTML readability + Markdown rendering + grep search.
export { readableHtml, type ReadableResult } from "./readable.js";
export { toMarkdown, blocksToMarkdown, resultToDoc, type Block, type RichDoc } from "./markdown.js";
export { grepText, grepPages, type GrepHit, type GrepOptions } from "./search.js";
// Re-export the format I/O so callers can write results without a second dep.
export { serializeRows, readRows, convertFile, type DataRow } from "lacspace-scraper";
