/**
 * Render extracted structure as Markdown — ideal for pasting a document into a
 * wiki or feeding it to an LLM. Works on a structured {@link RichDoc} (from the
 * HTML readability extractor) or directly on an {@link ExtractResult}.
 */
import type { DataRow } from "lacspace-scraper";
import type { ExtractResult } from "./extract.js";

/** A structural block of a document. */
export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "code"; text: string };

/** A document reduced to ordered structural blocks. */
export interface RichDoc {
  title?: string;
  blocks: Block[];
}

function esc(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** Render a matrix as a GitHub-flavoured Markdown table (row 0 = header). */
function mdTable(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string[] => { const c = r.slice(); while (c.length < width) c.push(""); return c; };
  const header = pad(rows[0]!);
  const lines = [
    `| ${header.map(esc).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (let i = 1; i < rows.length; i++) lines.push(`| ${pad(rows[i]!).map(esc).join(" | ")} |`);
  return lines.join("\n");
}

/** Render one block to Markdown. */
function renderBlock(b: Block): string {
  switch (b.type) {
    case "heading": return `${"#".repeat(Math.min(6, Math.max(1, b.level)))} ${b.text.trim()}`;
    case "paragraph": return b.text.trim();
    case "code": return "```\n" + b.text.replace(/\n+$/, "") + "\n```";
    case "list": return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${it.trim()}`).join("\n");
    case "table": return mdTable(b.rows);
  }
}

/** Render an ordered list of blocks (with optional title) to Markdown. */
export function blocksToMarkdown(doc: RichDoc): string {
  const parts: string[] = [];
  if (doc.title) parts.push(`# ${doc.title.trim()}`);
  for (const b of doc.blocks) { const s = renderBlock(b); if (s.trim()) parts.push(s); }
  return parts.join("\n\n").trim() + "\n";
}

/** Object rows (spreadsheet/HTML tables) → a header + matrix. */
function rowsToMatrix(rows: DataRow[]): string[][] {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const matrix: string[][] = [cols];
  for (const r of rows) matrix.push(cols.map((c) => (r[c] == null ? "" : String(r[c]))));
  return matrix;
}

/** Split plain text into paragraph blocks on blank lines. */
function textToBlocks(text: string): Block[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((t) => ({ type: "paragraph", text: t }) as Block);
}

/** Turn a full extraction result into a structured document. */
export function resultToDoc(result: ExtractResult): RichDoc {
  if (result.readable) return { title: result.readable.title, blocks: result.readable.blocks };
  const blocks: Block[] = [];

  if (result.pages && result.pages.length) {
    for (const pg of result.pages) {
      blocks.push({ type: "heading", level: 2, text: `Page ${pg.page}` });
      blocks.push(...textToBlocks(pg.text));
    }
  } else if (result.text !== undefined && result.text !== "") {
    blocks.push(...textToBlocks(result.text));
  }

  if (result.rows && result.rows.length) blocks.push({ type: "table", rows: rowsToMatrix(result.rows) });

  if (result.tables && result.tables.length) {
    for (const tbl of result.tables) {
      if (!tbl.length) continue;
      if (Array.isArray(tbl[0])) blocks.push({ type: "table", rows: tbl as string[][] });
      else blocks.push({ type: "table", rows: rowsToMatrix(tbl as DataRow[]) });
    }
  }

  return { title: result.meta?.title, blocks };
}

/** Render a {@link RichDoc} or an {@link ExtractResult} as Markdown. */
export function toMarkdown(input: RichDoc | ExtractResult): string {
  if ("blocks" in input && Array.isArray((input as RichDoc).blocks)) return blocksToMarkdown(input as RichDoc);
  return blocksToMarkdown(resultToDoc(input as ExtractResult));
}
