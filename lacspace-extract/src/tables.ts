/**
 * Table extraction — from HTML (reusing the lacspace-scraper table extractor)
 * and a best-effort line-based detector for plain text / PDF output.
 */
import { parseHTML, extractTables, innerText, queryOne } from "lacspace-scraper";

/** Extract every `<table>` from HTML as arrays of header-keyed rows. */
export function htmlTables(html: string): Record<string, string>[][] {
  return extractTables(parseHTML(html));
}

/** The readable text of an HTML document. */
export function htmlText(html: string): string {
  const root = parseHTML(html);
  const body = queryOne(root, "body") ?? root;
  return innerText(body);
}

/**
 * Best-effort table detection in plain text: contiguous lines that each split
 * into the same number of columns on runs of 2+ spaces (or tabs). Returns each
 * detected table as an array of string rows. Heuristic — column-aligned text
 * only, not free prose.
 */
export function lineTables(text: string): string[][][] {
  const lines = text.split(/\r?\n/);
  const tables: string[][][] = [];
  let current: string[][] = [];
  let width = 0;
  const flush = (): void => {
    if (current.length >= 2) tables.push(current);
    current = [];
    width = 0;
  };
  for (const line of lines) {
    const cells = line.trim().split(/\t|\s{2,}/).map((c) => c.trim()).filter(() => true);
    const real = cells.filter(Boolean);
    if (real.length >= 2) {
      if (current.length === 0) width = cells.length;
      if (Math.abs(cells.length - width) <= 1) { current.push(cells); continue; }
      flush();
      current.push(cells);
      width = cells.length;
    } else {
      flush();
    }
  }
  flush();
  return tables;
}
