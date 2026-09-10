import type { Row, Table, ParseOptions, SerializeOptions } from "../types";
import { inferTypes } from "../infer";
import { cellText, columnsOf, safeSet } from "../util";

const SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Split a pipe row into cells, honouring `\|` escapes. */
function splitPipes(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === "\\" && l[i + 1] === "|") { cur += "|"; i++; continue; }
    if (ch === "|") { cells.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells.map((c) => c.replace(/<br\s*\/?>/gi, "\n"));
}

export function parseMarkdown(text: string, opts: ParseOptions): Table[] {
  const lines = text.split(/\r?\n/);
  const tables: Table[] = [];
  let lastHeading: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) { lastHeading = h[1]; continue; }
    const next = lines[i + 1];
    if (line.includes("|") && next !== undefined && next.includes("|") && SEP_RE.test(next)) {
      const header = splitPipes(line).map((c, k) => (c === "" ? `col${k + 1}` : c));
      const rows: Row[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j]!.includes("|") && lines[j]!.trim() !== "") {
        const cells = splitPipes(lines[j]!);
        const row: Row = {};
        header.forEach((k, c) => safeSet(row, k, cells[c] ?? ""));
        rows.push(row);
        j++;
      }
      const table: Table = { rows: (opts.infer ?? true) ? inferTypes(rows) : rows };
      const name = lastHeading ?? (tables.length === 0 ? opts.tableName : undefined);
      if (name) table.name = name;
      tables.push(table);
      lastHeading = undefined;
      i = j - 1;
    }
  }
  return tables;
}

function mdEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function serializeMarkdown(tables: Table[], opts: SerializeOptions): string {
  const blocks = tables.map((t, i) => {
    const cols = opts.columns ?? columnsOf(t.rows);
    const out: string[] = [];
    if (tables.length > 1 || t.name) out.push(`### ${t.name ?? `${opts.tableName ?? "Table"} ${i + 1}`}`, "");
    if (cols.length === 0) return out.join("\n");
    out.push(`| ${cols.map(mdEscape).join(" | ")} |`);
    out.push(`| ${cols.map(() => "---").join(" | ")} |`);
    for (const r of t.rows) out.push(`| ${cols.map((c) => mdEscape(cellText(r[c], opts.dateFormat))).join(" | ")} |`);
    return out.join("\n");
  });
  return blocks.join("\n\n") + "\n";
}
