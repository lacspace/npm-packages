/**
 * A robust, zero-dependency `.env` parser.
 *
 * Handles `KEY=VALUE`, `export KEY=…`, single/double quotes (with escapes),
 * unquoted values, full-line and trailing `#` comments (trailing only on
 * unquoted values), blank lines, empty values (`KEY=`), values containing `=`,
 * and basic multiline double-quoted values. Syntax problems are reported with
 * their 1-based line numbers rather than thrown.
 */

/** One parsed assignment. */
export interface EnvEntry {
  key: string;
  value: string;
  /** 1-based line where the key is declared. */
  line: number;
}

/** A syntax problem found while parsing. */
export interface ParseError {
  line: number;
  message: string;
}

/** The result of {@link parseEnv}. */
export interface ParseResult {
  /** Every assignment, in source order (duplicates included). */
  entries: EnvEntry[];
  /** Flattened key → value map (last assignment wins). */
  map: Record<string, string>;
  /** Syntax problems, with line numbers. */
  errors: ParseError[];
}

const LEAD = /^[ \t]*(?:export[ \t]+)?/;
const DQ_ESCAPES: Record<string, string> = {
  n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'", "`": "`", "$": "$",
};

/** Read a double-quoted value that may span multiple lines. */
function readDoubleQuoted(
  lines: string[],
  li: number,
  ci: number,
): { value: string; endLine: number } | null {
  let out = "";
  let line = li;
  let col = ci;
  while (line < lines.length) {
    const s = lines[line]!;
    while (col < s.length) {
      const ch = s[col]!;
      if (ch === "\\") {
        const nx = s[col + 1];
        if (nx === undefined) {
          out += "\\";
          col += 1;
        } else {
          out += DQ_ESCAPES[nx] ?? nx;
          col += 2;
        }
      } else if (ch === '"') {
        return { value: out, endLine: line };
      } else {
        out += ch;
        col += 1;
      }
    }
    // ran off the end of this source line without a closing quote → newline
    out += "\n";
    line += 1;
    col = 0;
  }
  return null;
}

/** Strip a trailing `# comment` that is preceded by whitespace. */
function stripInlineComment(s: string): string {
  for (let i = 1; i < s.length; i++) {
    if (s[i] === "#" && /[ \t]/.test(s[i - 1]!)) return s.slice(0, i);
  }
  return s;
}

/** Parse the text of a `.env` file. Never throws. */
export function parseEnv(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const entries: EnvEntry[] = [];
  const errors: ParseError[] = [];
  const map: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const lead = LEAD.exec(raw)![0];
    const startCol = lead.length;
    const body = raw.slice(startCol);

    const eq = body.indexOf("=");
    if (eq === -1) {
      errors.push({ line: lineNo, message: `not a KEY=VALUE assignment: "${trimmed.slice(0, 48)}"` });
      continue;
    }
    const key = body.slice(0, eq).trim();
    if (key === "") {
      errors.push({ line: lineNo, message: "missing key before '='" });
      continue;
    }

    const afterEq = body.slice(eq + 1);
    const vlead = /^[ \t]*/.exec(afterEq)![0].length;
    const vstart = afterEq.slice(vlead);
    const firstCh = vstart[0];

    let value: string;
    if (firstCh === '"') {
      const r = readDoubleQuoted(lines, i, startCol + eq + 1 + vlead + 1);
      if (!r) {
        errors.push({ line: lineNo, message: `unterminated double-quoted value for ${key}` });
        value = vstart.slice(1);
      } else {
        value = r.value;
        i = r.endLine;
      }
    } else if (firstCh === "'") {
      const close = vstart.indexOf("'", 1);
      if (close === -1) {
        errors.push({ line: lineNo, message: `unterminated single-quoted value for ${key}` });
        value = vstart.slice(1);
      } else {
        value = vstart.slice(1, close);
      }
    } else {
      value = stripInlineComment(afterEq).trim();
    }

    entries.push({ key, value, line: lineNo });
    map[key] = value;
  }

  return { entries, map, errors };
}
