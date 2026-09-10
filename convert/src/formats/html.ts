import type { Row, Table, ParseOptions, SerializeOptions } from "../types";
import { inferTypes } from "../infer";
import { cellText, columnsOf, escapeHtml, safeSet, unescapeHtml } from "../util";

function stripTags(html: string): string {
  return unescapeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

export function parseHtml(text: string, opts: ParseOptions): Table[] {
  const tables: Table[] = [];
  const tableRe = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(text)) !== null) {
    const attrs = tm[1] ?? "";
    const inner = tm[2] ?? "";
    const caption = /<caption\b[^>]*>([\s\S]*?)<\/caption>/i.exec(inner)?.[1];
    const idAttr = /\b(?:id|data-name)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const grid: { cells: string[]; isHeader: boolean }[] = [];
    let rm: RegExpExecArray | null;
    while ((rm = trRe.exec(inner)) !== null) {
      const cellRe = /<(t[hd])\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const cells: string[] = [];
      let allTh = true;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1] ?? "")) !== null) {
        if (cm[1]!.toLowerCase() !== "th") allTh = false;
        cells.push(stripTags(cm[2] ?? ""));
      }
      if (cells.length > 0) grid.push({ cells, isHeader: allTh });
    }
    if (grid.length === 0) continue;
    const headerIdx = grid.findIndex((g) => g.isHeader);
    const head = headerIdx >= 0 ? grid[headerIdx]! : grid[0]!;
    const keys = head.cells.map((c, i) => (c === "" ? `col${i + 1}` : c));
    const rows: Row[] = grid
      .filter((g, i) => i !== (headerIdx >= 0 ? headerIdx : 0) && !g.isHeader)
      .map((g) => {
        const row: Row = {};
        keys.forEach((k, i) => safeSet(row, k, g.cells[i] ?? ""));
        return row;
      });
    const table: Table = { rows: (opts.infer ?? true) ? inferTypes(rows) : rows };
    const name = (caption ? stripTags(caption) : undefined) ?? idAttr ?? (tables.length === 0 ? opts.tableName : undefined);
    if (name) table.name = name;
    tables.push(table);
  }
  return tables;
}

export function serializeHtml(tables: Table[], opts: SerializeOptions): string {
  const pretty = opts.pretty ?? true;
  const nl = pretty ? "\n" : "";
  const ind = (n: number): string => (pretty ? "  ".repeat(n) : "");
  return tables
    .map((t, i) => {
      const cols = opts.columns ?? columnsOf(t.rows);
      const out: string[] = ["<table>"];
      if (t.name || tables.length > 1) out.push(`${ind(1)}<caption>${escapeHtml(t.name ?? `${opts.tableName ?? "Table"} ${i + 1}`)}</caption>`);
      out.push(`${ind(1)}<thead>`, `${ind(2)}<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`, `${ind(1)}</thead>`);
      out.push(`${ind(1)}<tbody>`);
      for (const r of t.rows) {
        out.push(`${ind(2)}<tr>${cols.map((c) => `<td>${escapeHtml(cellText(r[c], opts.dateFormat)).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`);
      }
      out.push(`${ind(1)}</tbody>`, "</table>");
      return out.join(nl);
    })
    .join(nl) + (pretty ? "\n" : "");
}
