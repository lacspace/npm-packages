/**
 * A small SQL tokenizer. Turns a query string into a flat list of tokens with
 * source positions, so the parser can give precise errors. Identifiers are
 * generous — they may contain `.`, `/`, `\`, `:`, `~` and `-` so that a bare
 * file path (`./leads.csv`, `../data/my-file.csv`) is a single token in `FROM`.
 */

export type TokenType =
  | "keyword"
  | "ident"
  | "number"
  | "string"
  | "op" // comparison operators: = != <> < <= > >=
  | "arith" // arithmetic operators: + - % (also `*` via `star`, `/` via a lone ident)
  | "star"
  | "comma"
  | "lparen"
  | "rparen"
  | "eof";

export interface Token {
  type: TokenType;
  /** For keywords, lower-cased. For strings/quoted idents, the unquoted text. */
  value: string;
  /** Numeric value when type === "number". */
  num?: number;
  /** 0-based index into the source string. */
  pos: number;
}

export class SqlError extends Error {
  readonly pos: number | undefined;
  constructor(message: string, pos?: number) {
    super(pos === undefined ? message : `${message} (at position ${pos})`);
    this.name = "SqlError";
    this.pos = pos;
  }
}

const KEYWORDS = new Set([
  "select", "distinct", "from", "where", "group", "by", "having", "order",
  "limit", "offset", "and", "or", "not", "in", "is", "null", "like", "as",
  "asc", "desc",
  // v0.2.0 additions
  "join", "inner", "left", "right", "outer", "cross", "on",
  "union", "all", "between", "escape",
  "case", "when", "then", "else", "end",
  "nulls", "first", "last",
]);

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";
const isIdentStart = (ch: string): boolean =>
  /[A-Za-z_./\\:~]/.test(ch);
const isIdentPart = (ch: string): boolean =>
  /[A-Za-z0-9_./\\:~-]/.test(ch);

/** A token type after which a `-`/`+` should be read as a sign, not an operator. */
function expectsValue(prev: Token | undefined): boolean {
  if (!prev) return true;
  if (prev.type === "op" || prev.type === "comma" || prev.type === "lparen") return true;
  if (prev.type === "keyword") return prev.value !== "null"; // after NULL a value is not expected
  return false;
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;

  const prev = (): Token | undefined => tokens[tokens.length - 1];

  while (i < n) {
    const ch = sql[i]!;

    // whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }

    // line comment: -- ... (only when not a sign/operator context is irrelevant here)
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }

    const start = i;

    // punctuation
    if (ch === "(") { tokens.push({ type: "lparen", value: "(", pos: start }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")", pos: start }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: ",", pos: start }); i++; continue; }
    if (ch === "*") { tokens.push({ type: "star", value: "*", pos: start }); i++; continue; }
    if (ch === "%") { tokens.push({ type: "arith", value: "%", pos: start }); i++; continue; }

    // comparison operators
    if (ch === "<") {
      if (sql[i + 1] === "=") { tokens.push({ type: "op", value: "<=", pos: start }); i += 2; continue; }
      if (sql[i + 1] === ">") { tokens.push({ type: "op", value: "!=", pos: start }); i += 2; continue; }
      tokens.push({ type: "op", value: "<", pos: start }); i++; continue;
    }
    if (ch === ">") {
      if (sql[i + 1] === "=") { tokens.push({ type: "op", value: ">=", pos: start }); i += 2; continue; }
      tokens.push({ type: "op", value: ">", pos: start }); i++; continue;
    }
    if (ch === "=") { tokens.push({ type: "op", value: "=", pos: start }); i++; continue; }
    if (ch === "!") {
      if (sql[i + 1] === "=") { tokens.push({ type: "op", value: "!=", pos: start }); i += 2; continue; }
      throw new SqlError(`Unexpected character '!'`, start);
    }

    // string literal (single quotes, '' escapes a quote)
    if (ch === "'") {
      i++;
      let str = "";
      let closed = false;
      while (i < n) {
        const c = sql[i]!;
        if (c === "'") {
          if (sql[i + 1] === "'") { str += "'"; i += 2; continue; }
          i++; closed = true; break;
        }
        str += c; i++;
      }
      if (!closed) throw new SqlError("Unterminated string literal", start);
      tokens.push({ type: "string", value: str, pos: start });
      continue;
    }

    // quoted identifier (double quotes or backticks) — allows reserved words / spaces
    if (ch === '"' || ch === "`") {
      const quote = ch;
      i++;
      let name = "";
      let closed = false;
      while (i < n) {
        const c = sql[i]!;
        if (c === quote) { i++; closed = true; break; }
        name += c; i++;
      }
      if (!closed) throw new SqlError("Unterminated quoted identifier", start);
      tokens.push({ type: "ident", value: name, pos: start });
      continue;
    }

    // signed / unsigned number
    const signed = (ch === "-" || ch === "+") && isDigit(sql[i + 1] ?? "") && expectsValue(prev());
    if (isDigit(ch) || (ch === "." && isDigit(sql[i + 1] ?? "")) || signed) {
      let numStr = "";
      if (signed) { numStr += ch; i++; }
      let seenDot = false;
      while (i < n) {
        const c = sql[i]!;
        if (isDigit(c)) { numStr += c; i++; continue; }
        if (c === "." && !seenDot) { seenDot = true; numStr += c; i++; continue; }
        break;
      }
      const num = Number(numStr);
      if (!Number.isFinite(num)) throw new SqlError(`Invalid number '${numStr}'`, start);
      tokens.push({ type: "number", value: numStr, num, pos: start });
      continue;
    }

    // arithmetic `+` / `-` that isn't a numeric sign (an operator between values).
    // (`*` is a `star` token, `%` is an `arith` token above, and division `/`
    //  arrives as a lone `/` identifier — the parser recognises each in context.)
    if (ch === "+" || ch === "-") {
      tokens.push({ type: "arith", value: ch, pos: start }); i++; continue;
    }

    // identifier / keyword
    if (isIdentStart(ch)) {
      let name = "";
      while (i < n && isIdentPart(sql[i]!)) { name += sql[i]!; i++; }
      const lower = name.toLowerCase();
      if (KEYWORDS.has(lower)) tokens.push({ type: "keyword", value: lower, pos: start });
      else tokens.push({ type: "ident", value: name, pos: start });
      continue;
    }

    throw new SqlError(`Unexpected character '${ch}'`, start);
  }

  tokens.push({ type: "eof", value: "", pos: n });
  return tokens;
}
