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
export { extractPdfText, type PdfText } from "./pdf.js";
export { htmlTables, htmlText, lineTables } from "./tables.js";
// Re-export the format I/O so callers can write results without a second dep.
export { serializeRows, readRows, convertFile, type DataRow } from "lacspace-scraper";
