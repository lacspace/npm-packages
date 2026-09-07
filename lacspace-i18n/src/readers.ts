/**
 * Hand-written, zero-dependency readers for the three locale-file formats
 * lacspace-i18n understands: JSON, a common subset of YAML, and Java-style
 * `.properties`. Each returns a {@link JsonValue}; the loader flattens it.
 *
 * ## YAML support (best-effort subset)
 * Supported: nested block maps by indentation, block sequences (`- item`),
 * sequences of maps, scalars (plain / single- / double-quoted), integers,
 * floats, booleans (`true`/`false`), null (`null`/`~`), `# comments` (whole-line
 * and trailing on unquoted scalars).
 *
 * NOT supported (documented limitations): multi-document streams (`---`),
 * anchors/aliases (`&`/`*`), tags (`!!type`), block scalars (`|` / `>`), flow
 * collections (`{a: 1}` / `[1, 2]`), complex/`?` keys, and merge keys (`<<`).
 * Feed those files as JSON instead.
 */
import type { JsonValue } from "./flatten.js";

/** Supported on-disk locale formats. */
export type FileFormat = "json" | "yaml" | "properties";

/** Thrown when a locale file cannot be parsed. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/** Pick a {@link FileFormat} from a filename, or `null` if unsupported. */
export function formatFromPath(path: string): FileFormat | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".properties")) return "properties";
  return null;
}

/** Parse `text` in the given format into a JSON value. */
export function parseByFormat(text: string, format: FileFormat): JsonValue {
  switch (format) {
    case "json":
      return parseJson(text);
    case "yaml":
      return parseYaml(text);
    case "properties":
      return parseProperties(text);
  }
}

/** Parse JSON, wrapping syntax errors in a {@link ParseError}. */
export function parseJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch (err) {
    throw new ParseError(`invalid JSON: ${(err as Error).message}`);
  }
}

// --- properties -----------------------------------------------------------

/**
 * Parse a Java `.properties` file into a flat object. Keys keep their literal
 * dots (`a.b.c`). Supports `#`/`!` comments, `=`, `:` and whitespace separators,
 * trailing-backslash line continuation, and the common `\n \t \r \\ \: \=`
 * plus `\uXXXX` escapes in values.
 */
export function parseProperties(text: string): JsonValue {
  const out: Record<string, JsonValue> = {};
  const raw = text.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i]!;
    const trimmed = line.replace(/^\s+/, "");
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    // line continuation: an odd number of trailing backslashes.
    while (countTrailingBackslashes(line) % 2 === 1 && i + 1 < raw.length) {
      line = line.replace(/\\+$/, (m) => "\\".repeat(m.length - 1)) + raw[++i]!.replace(/^\s+/, "");
    }
    const { key, value } = splitProperty(line);
    if (key !== "") out[key] = value;
  }
  return out;
}

function countTrailingBackslashes(s: string): number {
  const m = /\\+$/.exec(s);
  return m ? m[0].length : 0;
}

function splitProperty(line: string): { key: string; value: string } {
  let i = 0;
  let key = "";
  // key ends at first unescaped =, : or whitespace.
  for (; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\\") {
      key += unescapeProp(line[i + 1] ?? "", line, i);
      // handle \uXXXX advancing extra chars
      if (line[i + 1] === "u") i += 4;
      i++;
      continue;
    }
    if (ch === "=" || ch === ":" || ch === " " || ch === "\t" || ch === "\f") break;
    key += ch;
  }
  // skip separator + surrounding whitespace
  while (i < line.length && (line[i] === " " || line[i] === "\t" || line[i] === "\f")) i++;
  if (line[i] === "=" || line[i] === ":") {
    i++;
    while (i < line.length && (line[i] === " " || line[i] === "\t" || line[i] === "\f")) i++;
  }
  let value = "";
  for (; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\\") {
      value += unescapeProp(line[i + 1] ?? "", line, i);
      if (line[i + 1] === "u") i += 4;
      i++;
      continue;
    }
    value += ch;
  }
  return { key: key.trim(), value };
}

function unescapeProp(next: string, line: string, i: number): string {
  switch (next) {
    case "n": return "\n";
    case "t": return "\t";
    case "r": return "\r";
    case "f": return "\f";
    case "u": {
      const hex = line.slice(i + 2, i + 6);
      const code = parseInt(hex, 16);
      return Number.isNaN(code) ? "u" : String.fromCharCode(code);
    }
    default: return next;
  }
}

// --- YAML (subset) --------------------------------------------------------

interface YamlLine {
  indent: number;
  content: string;
}

/** Parse the supported YAML subset into a JSON value (see module docs). */
export function parseYaml(text: string): JsonValue {
  const lines: YamlLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.includes("\t") && /^\s*\t/.test(rawLine)) {
      throw new ParseError("YAML indentation must use spaces, not tabs");
    }
    const noComment = stripComment(rawLine);
    if (noComment.trim() === "") continue;
    if (noComment.trim() === "---" || noComment.trim() === "...") continue;
    const indent = noComment.length - noComment.replace(/^\s+/, "").length;
    lines.push({ indent, content: noComment.trim() });
  }
  if (lines.length === 0) return {};
  const [value] = parseBlock(lines, 0, lines[0]!.indent);
  return value;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      // a comment must be at start of line or preceded by whitespace
      if (i === 0 || line[i - 1] === " " || line[i - 1] === "\t") return line.slice(0, i);
    }
  }
  return line;
}

function parseBlock(lines: YamlLine[], start: number, indent: number): [JsonValue, number] {
  if (lines[start]!.content.startsWith("- ") || lines[start]!.content === "-") {
    return parseSequence(lines, start, indent);
  }
  return parseMap(lines, start, indent);
}

function parseMap(lines: YamlLine[], start: number, indent: number): [JsonValue, number] {
  const map: Record<string, JsonValue> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < indent) break;
    if (line.indent > indent) throw new ParseError(`unexpected indent in YAML map near "${line.content}"`);
    const colon = findColon(line.content);
    if (colon === -1) throw new ParseError(`expected "key: value" in YAML near "${line.content}"`);
    const key = unquote(line.content.slice(0, colon).trim());
    const rest = line.content.slice(colon + 1).trim();
    if (rest === "") {
      const next = lines[i + 1];
      if (next && next.indent > indent) {
        const [child, consumed] = parseBlock(lines, i + 1, next.indent);
        map[key] = child;
        i = consumed;
      } else if (next && next.indent === indent && (next.content.startsWith("- ") || next.content === "-")) {
        const [child, consumed] = parseSequence(lines, i + 1, indent);
        map[key] = child;
        i = consumed;
      } else {
        map[key] = null;
        i++;
      }
    } else {
      map[key] = parseScalar(rest);
      i++;
    }
  }
  return [map, i];
}

function parseSequence(lines: YamlLine[], start: number, indent: number): [JsonValue, number] {
  const arr: JsonValue[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < indent) break;
    if (line.indent > indent) throw new ParseError(`unexpected indent in YAML sequence near "${line.content}"`);
    if (!(line.content.startsWith("- ") || line.content === "-")) break;
    const after = line.content === "-" ? "" : line.content.slice(2).trim();
    const childIndent = indent + 2;
    if (after === "") {
      const next = lines[i + 1];
      if (next && next.indent > indent) {
        const [child, consumed] = parseBlock(lines, i + 1, next.indent);
        arr.push(child);
        i = consumed;
      } else {
        arr.push(null);
        i++;
      }
    } else if (findColon(after) !== -1) {
      // sequence of maps: reinterpret the after-dash text as the first map line.
      const synthetic: YamlLine[] = [{ indent: childIndent, content: after }];
      let j = i + 1;
      while (j < lines.length && lines[j]!.indent >= childIndent && !isDashAt(lines[j]!, indent)) {
        synthetic.push(lines[j]!);
        j++;
      }
      const [child] = parseMap(synthetic, 0, childIndent);
      arr.push(child);
      i = j;
    } else {
      arr.push(parseScalar(after));
      i++;
    }
  }
  return [arr, i];
}

function isDashAt(line: YamlLine, indent: number): boolean {
  return line.indent === indent && (line.content.startsWith("- ") || line.content === "-");
}

function findColon(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      if (i === s.length - 1 || s[i + 1] === " ") return i;
    }
  }
  return -1;
}

function parseScalar(raw: string): JsonValue {
  const s = raw.trim();
  if (s === "") return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return unquote(s);
  }
  if (s === "null" || s === "~" || s === "Null" || s === "NULL") return null;
  if (s === "true" || s === "True" || s === "TRUE") return true;
  if (s === "false" || s === "False" || s === "FALSE") return false;
  if (/^[-+]?\d+$/.test(s)) return Number(s);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}
