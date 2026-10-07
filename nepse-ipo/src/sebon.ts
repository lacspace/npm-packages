import { readTables, resolveUrl, type HtmlCell, type HtmlRow } from "./html";
import { parseYmd } from "./time";
import type { SebonPipelineEntry } from "./types";

export const SEBON_IPO_PIPELINE_URL = "https://www.sebon.gov.np/ipo-pipeline";

const PDF_RE = /\.pdf(?:[?#].*)?$/i;
const ENGLISH_RE = /english|\ben\b|\beng\b/i;
const NEPALI_RE = /nepali|\bne\b|\bnp\b|नेपाली/i;

function isHeaderRow(row: HtmlRow): boolean {
  return row.every((c) => c.tag === "th");
}

function score(linkText: string, cell: HtmlCell, header: string): number {
  let s = 0;
  if (ENGLISH_RE.test(linkText)) s += 4;
  else if (NEPALI_RE.test(linkText)) s -= 4;
  if (ENGLISH_RE.test(cell.text)) s += 2;
  if (NEPALI_RE.test(cell.text)) s -= 2;
  if (ENGLISH_RE.test(header)) s += 1;
  if (NEPALI_RE.test(header)) s -= 1;
  return s;
}

function entryFromRow(row: HtmlRow, header: HtmlRow | undefined, baseUrl: string): SebonPipelineEntry | null {
  const title = row[0]?.text ?? "";
  const dateMatch = /\d{4}-\d{2}-\d{2}/.exec(row[1]?.text ?? "");
  if (!title || !dateMatch || !parseYmd(dateMatch[0])) return null;

  let best: { url: string; score: number } | undefined;
  for (let i = 2; i < row.length; i++) {
    const cell = row[i] as HtmlCell;
    const headerText = header?.[i]?.text ?? "";
    for (const link of cell.links) {
      const path = link.href.split(/[?#]/)[0] ?? "";
      if (!PDF_RE.test(path) && !PDF_RE.test(link.href)) continue;
      const url = resolveUrl(link.href, baseUrl);
      if (!url) continue;
      const s = score(link.text, cell, headerText);
      if (!best || s > best.score) best = { url, score: s };
    }
  }
  if (!best) return null;
  return { title, date: dateMatch[0], url: best.url };
}

/**
 * Read the latest entry of the SEBON IPO pipeline page: the first data row of its table
 * (title, YYYY-MM-DD date, English PDF link resolved against `baseUrl`).
 * Returns null when there is no usable row. Never throws.
 */
export function parseSebonPipeline(
  html: string,
  baseUrl: string = SEBON_IPO_PIPELINE_URL,
): SebonPipelineEntry | null {
  try {
    if (typeof html !== "string") return null;
    const base = typeof baseUrl === "string" && baseUrl ? baseUrl : SEBON_IPO_PIPELINE_URL;
    // readTables returns inner tables first; for the pipeline page there is a single table.
    for (const table of readTables(html)) {
      let header: HtmlRow | undefined;
      for (const row of table) {
        if (isHeaderRow(row)) {
          header = row;
          continue;
        }
        const entry = entryFromRow(row, header, base);
        if (entry) return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}
