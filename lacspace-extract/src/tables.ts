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

/**
 * Column-boundary table detection — a refinement of {@link lineTables}. Within
 * each candidate block it finds the character columns that are blank across
 * *every* row (the gutters between columns) and splits on those, so cells whose
 * own text contains single spaces ("New York", "Total Due") stay intact where
 * the multi-space heuristic would wrongly break them. Falls back to the
 * multi-space split for a block whose columns can't be aligned.
 */
export function columnTables(text: string): string[][][] {
  // Group contiguous candidate rows, then cut each block on shared gutters.
  const rawLines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let cur: string[] = [];
  const flush = (): void => { if (cur.length >= 2) blocks.push(cur); cur = []; };
  for (const line of rawLines) {
    const cells = line.trim().split(/\t|\s{2,}/).filter(Boolean);
    if (cells.length >= 2) cur.push(line.replace(/\s+$/, ""));
    else flush();
  }
  flush();
  const refined: string[][][] = [];
  for (const block of blocks) {
    const cols = splitFixedWidth(block);
    // Only accept the fixed-width split if it yields a stable column count ≥2.
    if (cols.length >= 2 && cols[0]!.length >= 2 && cols.every((r) => r.length === cols[0]!.length)) refined.push(cols);
    else refined.push(block.map((l) => l.trim().split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean)));
  }
  return refined.filter((t) => t.length >= 2);
}

/**
 * Split a block of aligned lines on the whitespace gutters shared by all rows.
 * Only a *run* of ≥2 all-blank columns counts as a gutter, so a single space
 * inside a cell ("New York") that happens to line up with padding in another
 * row does not wrongly split the cell.
 */
export function splitFixedWidth(lines: string[]): string[][] {
  const maxLen = Math.max(0, ...lines.map((l) => l.length));
  if (!maxLen) return lines.map(() => []);
  const isSep: boolean[] = [];
  for (let c = 0; c < maxLen; c++) isSep[c] = lines.every((l) => (l[c] ?? " ") === " ");
  // A column is a true gutter only if part of a ≥2-wide all-blank run.
  const gutter = new Array<boolean>(maxLen).fill(false);
  let run = -1;
  for (let c = 0; c <= maxLen; c++) {
    if (c < maxLen && isSep[c]) { if (run < 0) run = c; }
    else { if (run >= 0 && c - run >= 2) for (let k = run; k < c; k++) gutter[k] = true; run = -1; }
  }
  // Field spans = maximal runs of non-gutter columns.
  const spans: [number, number][] = [];
  let start = -1;
  for (let c = 0; c < maxLen; c++) {
    if (!gutter[c]) { if (start < 0) start = c; }
    else if (start >= 0) { spans.push([start, c]); start = -1; }
  }
  if (start >= 0) spans.push([start, maxLen]);
  return lines.map((l) => spans.map(([s, e]) => l.slice(s, e).trim()));
}
