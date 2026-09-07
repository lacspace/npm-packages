/**
 * A small, dependency-free YAML subset codec (read + write).
 *
 * Supported on read: block mappings, block sequences, nesting by indentation,
 * plain / single-quoted / double-quoted scalars, numbers, booleans
 * (`true`/`false`), `null`/`~`/empty, inline flow `[a, b]` and `{a: 1}`, `#`
 * comments, and `|` (literal) / `>` (folded) block scalars. A leading `---`
 * document marker is ignored.
 *
 * NOT supported (documented): anchors & aliases (`&`/`*`), tags (`!!type`),
 * multiple documents in one stream, merge keys (`<<`), and complex keys. These
 * throw or are treated as plain text rather than silently misparsed.
 */
import { JsonToolError, safeSet, isForbiddenKey } from "./util.js";
import type { JsonValue } from "./util.js";

interface Line { indent: number; content: string; raw: string; n: number; }

function splitLines(src: string): Line[] {
  const out: Line[] = [];
  const rawLines = src.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!;
    if (/^\s*$/.test(raw)) continue;
    if (/^\s*#/.test(raw)) continue;
    const trimmedRight = raw.replace(/\s+$/, "");
    if (trimmedRight === "---" || trimmedRight === "...") continue;
    const indent = raw.length - raw.replace(/^\s+/, "").length;
    out.push({ indent, content: raw.trim(), raw, n: i + 1 });
  }
  return out;
}

function stripComment(s: string): string {
  // remove a trailing " # comment" not inside quotes
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    else if (ch === "#" && !inS && !inD && (i === 0 || s[i - 1] === " " || s[i - 1] === "\t")) {
      return s.slice(0, i).replace(/\s+$/, "");
    }
  }
  return s;
}

function parseScalar(raw: string): JsonValue {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
  if (s === "true" || s === "True" || s === "TRUE") return true;
  if (s === "false" || s === "False" || s === "FALSE") return false;
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\(["\\/ntr])/g, (_m, c) =>
      c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c);
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === "[" || s[0] === "{") return parseFlow(s);
  if (/^[-+]?(0|[1-9][0-9]*)$/.test(s)) return parseInt(s, 10);
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) && /\d/.test(s)) {
    const num = Number(s);
    if (!Number.isNaN(num)) return num;
  }
  return s;
}

function parseFlow(s: string): JsonValue {
  // Minimal flow parser for [ ... ] and { ... }
  let i = 0;
  const parseValue = (): JsonValue => {
    skipWs();
    const ch = s[i];
    if (ch === "[") return parseArr();
    if (ch === "{") return parseObj();
    return parseFlowScalar();
  };
  const skipWs = (): void => { while (i < s.length && /\s/.test(s[i]!)) i++; };
  const parseArr = (): JsonValue => {
    i++; // [
    const arr: JsonValue[] = [];
    skipWs();
    if (s[i] === "]") { i++; return arr; }
    while (i < s.length) {
      arr.push(parseValue());
      skipWs();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "]") { i++; break; }
      throw new JsonToolError(`YAML: malformed flow sequence near "${s.slice(i)}"`);
    }
    return arr;
  };
  const parseObj = (): JsonValue => {
    i++; // {
    const obj: Record<string, JsonValue> = {};
    skipWs();
    if (s[i] === "}") { i++; return obj; }
    while (i < s.length) {
      skipWs();
      const key = parseFlowKey();
      skipWs();
      if (s[i] !== ":") throw new JsonToolError(`YAML: expected ':' in flow map near "${s.slice(i)}"`);
      i++;
      const val = parseValue();
      if (!isForbiddenKey(key)) safeSet(obj, key, val);
      skipWs();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "}") { i++; break; }
      throw new JsonToolError(`YAML: malformed flow map near "${s.slice(i)}"`);
    }
    return obj;
  };
  const parseFlowKey = (): string => {
    skipWs();
    if (s[i] === '"' || s[i] === "'") { const v = parseFlowScalar(); return String(v); }
    let j = i;
    while (j < s.length && s[j] !== ":" && s[j] !== "," && s[j] !== "}") j++;
    const k = s.slice(i, j).trim();
    i = j;
    return k;
  };
  const parseFlowScalar = (): JsonValue => {
    skipWs();
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i]!; let j = i + 1; let str = "";
      while (j < s.length && s[j] !== q) {
        if (q === '"' && s[j] === "\\") { str += s[j + 1] === "n" ? "\n" : s[j + 1]; j += 2; }
        else { str += s[j]; j++; }
      }
      i = j + 1;
      return str;
    }
    let j = i;
    while (j < s.length && !",]}".includes(s[j]!)) j++;
    const tok = s.slice(i, j).trim();
    i = j;
    return parseScalar(tok);
  };
  const result = parseValue();
  return result;
}

function parseBlock(lines: Line[], start: number, minIndent: number): { value: JsonValue; next: number } {
  const first = lines[start]!;
  const indent = first.indent;
  // Sequence?
  if (/^-(\s|$)/.test(first.content)) {
    const arr: JsonValue[] = [];
    let i = start;
    while (i < lines.length && lines[i]!.indent === indent && /^-(\s|$)/.test(lines[i]!.content)) {
      const line = lines[i]!;
      const after = line.content.slice(1).trim();
      if (after === "") {
        // nested block under this dash
        const inner = parseBlock(lines, i + 1, indent + 1);
        arr.push(inner.value);
        i = inner.next;
      } else if (/^[^:\s][^:]*:(\s|$)/.test(after) || isInlineMapStart(after)) {
        // "- key: value" — an inline map that may continue on following deeper lines
        const synthetic: Line[] = [{ indent: indent + 2, content: after, raw: line.raw, n: line.n }];
        let j = i + 1;
        while (j < lines.length && lines[j]!.indent > indent) { synthetic.push(lines[j]!); j++; }
        const inner = parseBlock(synthetic, 0, indent + 2);
        arr.push(inner.value);
        i = j;
      } else {
        arr.push(parseScalar(stripComment(after)));
        i++;
      }
    }
    return { value: arr, next: i };
  }
  // Mapping
  const obj: Record<string, JsonValue> = {};
  let i = start;
  while (i < lines.length && lines[i]!.indent === indent) {
    const line = lines[i]!;
    if (/^-(\s|$)/.test(line.content)) break;
    const { key, rest } = splitKey(line.content, line.n);
    const restClean = stripComment(rest);
    if (restClean === "" ) {
      // value is a nested block, block scalar, or null
      const child = lines[i + 1];
      if (child && child.indent > indent) {
        const inner = parseBlock(lines, i + 1, indent + 1);
        if (!isForbiddenKey(key)) safeSet(obj, key, inner.value);
        i = inner.next;
      } else {
        if (!isForbiddenKey(key)) safeSet(obj, key, null);
        i++;
      }
    } else if (restClean === "|" || restClean === ">" || /^[|>][-+]?$/.test(restClean)) {
      const { text, next } = readBlockScalar(lines, i + 1, indent, restClean);
      if (!isForbiddenKey(key)) safeSet(obj, key, text);
      i = next;
    } else {
      if (!isForbiddenKey(key)) safeSet(obj, key, parseScalar(restClean));
      i++;
    }
  }
  void minIndent;
  return { value: obj, next: i };
}

function isInlineMapStart(s: string): boolean {
  return /^[^:]+:\s/.test(s);
}

function splitKey(content: string, n: number): { key: string; rest: string } {
  // find first ':' that is a key separator (followed by space or EOL), respecting quotes
  let inS = false, inD = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    else if (ch === ":" && !inS && !inD && (i + 1 >= content.length || content[i + 1] === " ")) {
      let key = content.slice(0, i).trim();
      if (key.length >= 2 && ((key[0] === '"' && key.endsWith('"')) || (key[0] === "'" && key.endsWith("'")))) {
        key = key.slice(1, -1);
      }
      return { key, rest: content.slice(i + 1).trim() };
    }
  }
  throw new JsonToolError(`YAML: expected "key: value" mapping at line ${n}: "${content}"`);
}

function readBlockScalar(lines: Line[], start: number, parentIndent: number, marker: string): { text: string; next: number } {
  const folded = marker[0] === ">";
  const chomp = marker.includes("-") ? "strip" : marker.includes("+") ? "keep" : "clip";
  const body: string[] = [];
  let i = start;
  let blockIndent = -1;
  while (i < lines.length && lines[i]!.indent > parentIndent) {
    if (blockIndent < 0) blockIndent = lines[i]!.indent;
    body.push(lines[i]!.raw.slice(blockIndent));
    i++;
  }
  let text = folded ? body.join(" ") : body.join("\n");
  if (chomp === "strip") text = text.replace(/\n+$/, "");
  else if (chomp === "clip") text = text.replace(/\n+$/, "") + (body.length ? "\n" : "");
  return { text, next: i };
}

/** Parse a YAML document into a JSON value. */
export function parseYaml(src: string): JsonValue {
  const lines = splitLines(src);
  if (lines.length === 0) return null;
  // top-level scalar?
  if (lines.length === 1 && !/^-(\s|$)/.test(lines[0]!.content) && !/:\s|:$/.test(lines[0]!.content)) {
    return parseScalar(stripComment(lines[0]!.content));
  }
  const { value } = parseBlock(lines, 0, 0);
  return value;
}

// --- writer ---------------------------------------------------------------

function needsQuote(s: string): boolean {
  if (s === "") return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(s)) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return true;
  if (/^[\s]|[\s]$/.test(s)) return true;
  if (/[:#\[\]{}&*!|>'"%@`,]/.test(s)) return true;
  if (/^[?-]/.test(s)) return true;
  return false;
}

function writeScalar(v: JsonValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  const s = String(v);
  if (needsQuote(s)) return JSON.stringify(s);
  return s;
}

function writeYamlNode(v: JsonValue, indent: number): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(v)) {
    if (v.length === 0) return pad + "[]";
    return v.map((item) => {
      if (item !== null && typeof item === "object") {
        const inner = writeYamlNode(item as JsonValue, indent + 1);
        return pad + "-\n" + inner;
      }
      return pad + "- " + writeScalar(item);
    }).join("\n");
  }
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 0) return pad + "{}";
    return keys.map((k) => {
      const val = (v as Record<string, JsonValue>)[k]!;
      const keyStr = needsQuote(k) ? JSON.stringify(k) : k;
      if (val !== null && typeof val === "object" && (Array.isArray(val) ? val.length : Object.keys(val).length)) {
        const nested = writeYamlNode(val, indent + 1);
        return pad + keyStr + ":\n" + nested;
      }
      return pad + keyStr + ": " + writeScalar(val);
    }).join("\n");
  }
  return pad + writeScalar(v);
}

/** Serialize a JSON value to YAML. */
export function stringifyYaml(value: JsonValue): string {
  if (value === null || typeof value !== "object") return writeScalar(value) + "\n";
  return writeYamlNode(value, 0) + "\n";
}
