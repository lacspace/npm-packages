/**
 * Pure output formatters used by the CLI and exposed as library helpers.
 */
import { columnsOf } from "lacspace-scraper";
import type { DataRow } from "lacspace-scraper";

/** Render a cell value as plain text (objects → JSON, null/undefined → ""). */
export function cellText(v: unknown): string {
  return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}

export interface MarkdownOptions {
  /** Omit the header row and its separator. */
  noHeader?: boolean;
}

/** Render rows as a GitHub-flavoured Markdown table. */
export function toMarkdown(rows: DataRow[], opts: MarkdownOptions = {}): string {
  const cols = rows.length > 0 ? columnsOf(rows) : [];
  if (cols.length === 0) return "";
  const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const line = (cells: string[]): string => `| ${cells.map(esc).join(" | ")} |`;
  const out: string[] = [];
  if (!opts.noHeader) {
    out.push(line(cols));
    out.push(`| ${cols.map(() => "---").join(" | ")} |`);
  }
  for (const r of rows) out.push(line(cols.map((col) => cellText(r[col]))));
  return out.join("\n");
}
