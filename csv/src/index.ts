/**
 * @lacspace/csv
 *
 * Correct, RFC 4180 CSV parsing & stringifying — quoted fields, escaped quotes,
 * newlines inside cells, CRLF, custom delimiters, and typed row objects.
 * Zero dependencies, isomorphic.
 */

export type Row = Record<string, string>;

export interface ParseOptions {
  /** Field delimiter. Default ",". */
  delimiter?: string;
  /** Treat the first row as headers → array of objects. Default true. */
  header?: boolean;
  /** Drop rows that are entirely empty. Default true. */
  skipEmpty?: boolean;
  /** Trim whitespace around unquoted fields. Default false. */
  trim?: boolean;
}

/**
 * Parse CSV text into rows. With `header: true` (default) returns objects keyed
 * by the header row; otherwise returns arrays of strings.
 *
 * @example parse("name,age\nAda,36") // [{ name: "Ada", age: "36" }]
 */
export function parse(text: string, opts: { header: false } & ParseOptions): string[][];
export function parse<T = Row>(text: string, opts?: { header?: true } & ParseOptions): T[];
export function parse(text: string, opts: ParseOptions = {}): unknown {
  const delimiter = opts.delimiter ?? ",";
  const useHeader = opts.header ?? true;
  const skipEmpty = opts.skipEmpty ?? true;
  const trim = opts.trim ?? false;
  const d = delimiter.charCodeAt(0);

  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let fieldWasQuoted = false;
  let started = false;

  const pushField = (): void => {
    record.push(trim && !fieldWasQuoted ? field.trim() : field);
    field = "";
    fieldWasQuoted = false;
  };
  const pushRecord = (): void => {
    pushField();
    if (!(skipEmpty && record.length === 1 && record[0] === "")) rows.push(record);
    record = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    started = true;
    if (inQuotes) {
      if (ch === 34) {
        if (text.charCodeAt(i + 1) === 34) { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += text[i];
      }
      continue;
    }
    if (ch === 34) { inQuotes = true; fieldWasQuoted = true; continue; }
    if (ch === d) { pushField(); continue; }
    if (ch === 13) { if (text.charCodeAt(i + 1) === 10) i++; pushRecord(); continue; }
    if (ch === 10) { pushRecord(); continue; }
    field += text[i];
  }
  if (started || field !== "" || record.length) pushRecord();

  if (!useHeader) return rows;
  const headers = rows.shift() ?? [];
  return rows.map((r) => {
    const obj: Row = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });
}

export interface StringifyOptions {
  delimiter?: string;
  /** Explicit column order (also the header row for object input). */
  columns?: string[];
  /** Emit a header row for object input. Default true. */
  header?: boolean;
  /** Line ending. Default "\r\n" (Excel-friendly). */
  eol?: string;
  /**
   * Prefix cells that begin with `= + - @ \t \r` with a single quote (`'`) so
   * spreadsheet apps (Excel/Sheets) don't execute them as formulas. Off by
   * default to keep output byte-identical; **set `true` for untrusted data.**
   */
  escapeFormulas?: boolean;
}

/**
 * Serialize rows (array of objects or array of arrays) to CSV text, quoting
 * fields only when required (delimiter, quote, or newline present).
 *
 * @example stringify([{ name: "Ada", note: 'says "hi"' }])
 */
export function stringify(rows: Row[] | (string | number | boolean | null | undefined)[][], opts: StringifyOptions = {}): string {
  const delimiter = opts.delimiter ?? ",";
  const eol = opts.eol ?? "\r\n";
  const escapeFormulas = opts.escapeFormulas ?? false;
  const quote = (v: unknown): string => {
    let s = v === null || v === undefined ? "" : String(v);
    // Neutralize CSV/formula injection: a leading =, +, -, @, TAB or CR makes
    // Excel/Sheets treat the cell as a formula. Prefix with a single quote.
    if (escapeFormulas && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  if (rows.length === 0) return "";
  const isObjectRows = !Array.isArray(rows[0]);
  const lines: string[] = [];

  if (isObjectRows) {
    const objRows = rows as Row[];
    const cols = opts.columns ?? [...new Set(objRows.flatMap((r) => Object.keys(r)))];
    if (opts.header ?? true) lines.push(cols.map(quote).join(delimiter));
    for (const r of objRows) lines.push(cols.map((c) => quote(r[c])).join(delimiter));
  } else {
    for (const r of rows as unknown[][]) lines.push(r.map(quote).join(delimiter));
  }
  return lines.join(eol);
}

/** Parse CSV/TSV, auto-detecting comma vs tab vs semicolon from the first line. */
export function parseAuto<T = Row>(text: string, opts: Omit<ParseOptions, "delimiter"> = {}): T[] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const counts: [string, number][] = [
    [",", (firstLine.match(/,/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
    [";", (firstLine.match(/;/g) ?? []).length],
  ];
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0]![0];
  return parse<T>(text, { ...opts, delimiter, header: true });
}
