import { buildAliasGroups, normalizeKey, stringifyValue } from "./aliases";

export type Row = Record<string, string>;

export interface ParseOptions {
  /** ",", ";", "\t" or "auto" (default). */
  delimiter?: string;
  /** Extra aliases: canonical name → header spellings. Matching headers are renamed to the canonical name. */
  headerAliases?: Record<string, string[]>;
}

export interface ParseResult {
  rows: Row[];
  columns: string[];
  errors: Array<{ row: number; message: string }>;
}

interface RawRecord {
  fields: string[];
  line: number;
}

function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') inQ = !inQ;
    else if (!inQ && (c === "\n" || c === "\r")) break;
    else if (!inQ && c in counts) counts[c]!++;
  }
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d]! > counts[best]!) best = d;
  return best;
}

function tokenize(text: string, delim: string, errors: ParseResult["errors"]): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let recLine = 1;
  let i = 0;
  const n = text.length;
  let fieldStart = true;
  const endRecord = (): void => {
    fields.push(field);
    records.push({ fields, line: recLine });
    fields = [];
    field = "";
    fieldStart = true;
  };
  while (i < n) {
    const c = text[i]!;
    if (fieldStart && c === '"') {
      // quoted field
      i++;
      let closed = false;
      while (i < n) {
        const q = text[i]!;
        if (q === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        if (q === "\r" && text[i + 1] === "\n") {
          field += "\r\n";
          i += 2;
          line++;
          continue;
        }
        if (q === "\n" || q === "\r") line++;
        field += q;
        i++;
      }
      if (!closed) errors.push({ row: recLine, message: "Unterminated quoted field" });
      fieldStart = false;
      continue;
    }
    fieldStart = false;
    if (c === delim) {
      fields.push(field);
      field = "";
      fieldStart = true;
      i++;
    } else if (c === "\r" || c === "\n") {
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      endRecord();
      line++;
      recLine = line;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || fields.length > 0) endRecord();
  return records;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Set<string>();
  return raw.map((h, idx) => {
    const base = h.trim() || `column_${idx + 1}`;
    let name = base;
    let k = 2;
    while (seen.has(name.toLowerCase())) name = `${base}_${k++}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

function applyCustomAliases(columns: string[], extra?: Record<string, string[]>): string[] {
  if (!extra || Object.keys(extra).length === 0) return columns;
  const groups = buildAliasGroups(extra);
  const custom = new Map<string, string>(); // normalized alias → canonical
  for (const [canonical, aliases] of Object.entries(extra)) {
    const g = groups.find((x) => x.keys.includes(normalizeKey(canonical)));
    const target = g ? g.canonical : canonical;
    for (const a of Array.isArray(aliases) ? aliases : []) custom.set(normalizeKey(a), target);
  }
  const taken = new Set(columns.map((c) => c.toLowerCase()));
  return columns.map((c) => {
    const target = custom.get(normalizeKey(c));
    if (!target || c.toLowerCase() === target.toLowerCase() || taken.has(target.toLowerCase())) return c;
    taken.delete(c.toLowerCase());
    taken.add(target.toLowerCase());
    return target;
  });
}

/**
 * Parse CSV text (RFC 4180) into rows keyed by header. Handles quotes, "" escapes,
 * embedded newlines, CRLF/LF/CR, a leading BOM, and comma/semicolon/tab auto-detection.
 * Values and headers are trimmed. Error `row` is the 1-based line where the record starts.
 */
export function parseCsv(text: string, opts: ParseOptions = {}): ParseResult {
  const errors: ParseResult["errors"] = [];
  let src = String(text ?? "");
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const delim = !opts.delimiter || opts.delimiter === "auto" ? detectDelimiter(src) : opts.delimiter;
  const records = tokenize(src, delim, errors);
  const isBlank = (r: RawRecord): boolean => r.fields.every((f) => f.trim() === "");
  const headerIdx = records.findIndex((r) => !isBlank(r));
  if (headerIdx < 0) return { rows: [], columns: [], errors };
  const columns = applyCustomAliases(uniqueHeaders(records[headerIdx]!.fields), opts.headerAliases);
  const rows: Row[] = [];
  for (let r = headerIdx + 1; r < records.length; r++) {
    const rec = records[r]!;
    if (isBlank(rec)) continue;
    if (rec.fields.length !== columns.length) {
      errors.push({
        row: rec.line,
        message: `Expected ${columns.length} fields but found ${rec.fields.length}`,
      });
    }
    const row: Row = {};
    columns.forEach((c, i) => {
      row[c] = (rec.fields[i] ?? "").trim();
    });
    rows.push(row);
  }
  return { rows, columns, errors };
}

/**
 * Parse either CSV text or an array of objects (e.g. from a spreadsheet library) into rows.
 * Array values are stringified: null/undefined → "", Date → ISO, objects → JSON.
 * For arrays, error `row` is the 0-based array index.
 */
export function parseRows(
  input: string | Array<Record<string, unknown>>,
  opts: ParseOptions = {},
): ParseResult {
  if (typeof input === "string") return parseCsv(input, opts);
  const errors: ParseResult["errors"] = [];
  if (!Array.isArray(input)) return { rows: [], columns: [], errors: [{ row: 0, message: "Input must be a string or an array" }] };
  const keyMap = new Map<string, string>(); // trimmed original key → column
  const rawCols: string[] = [];
  input.forEach((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const k of Object.keys(item)) {
        const t = k.trim();
        if (!keyMap.has(t)) {
          keyMap.set(t, t);
          rawCols.push(t);
        }
      }
    }
  });
  const unique = uniqueHeaders(rawCols);
  const columns = applyCustomAliases(unique, opts.headerAliases);
  rawCols.forEach((k, i) => keyMap.set(k, columns[i]!));
  const rows: Row[] = [];
  input.forEach((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ row: idx, message: "Row is not an object" });
      return;
    }
    const row: Row = {};
    for (const c of columns) row[c] = "";
    for (const [k, v] of Object.entries(item)) {
      const col = keyMap.get(k.trim());
      if (col !== undefined && row[col] === "") row[col] = stringifyValue(v).trim();
    }
    if (columns.every((c) => row[c] === "")) return;
    rows.push(row);
  });
  return { rows, columns, errors };
}
