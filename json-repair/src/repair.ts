/**
 * A lenient, string-aware JSON reader and the {@link repairJson} rewriter built
 * on top of it.
 *
 * Rather than patching text with regexes, we parse the messy input with a
 * forgiving recursive-descent reader into a plain JavaScript value, then let
 * `JSON.stringify` re-emit strict JSON. That single approach fixes every common
 * breakage at once:
 *
 *   - trailing commas             `{"a":1,}`        → `{"a":1}`
 *   - single-quoted strings       `{'a':'b'}`       → `{"a":"b"}`
 *   - unquoted object keys        `{a:1}`           → `{"a":1}`
 *   - Python / JS literals        `True/False/None` → `true/false/null`
 *   - non-finite numbers          `NaN/Infinity`    → `null`
 *   - line & block comments       `// …`  `/* … *\/` → removed
 *   - missing commas              `{"a":1 "b":2}`   → `{"a":1,"b":2}`
 *   - truncated output            `{"a":"hel`       → `{"a":"hel"}`
 */

const WS = new Set([" ", "\t", "\n", "\r", "\f", "\v", " ", "﻿"]);
const STRUCTURAL = new Set(["{", "}", "[", "]", ":", ",", '"', "'", "`"]);

/**
 * Parse a messy JSON-ish string into a JavaScript value, tolerating every
 * breakage listed above as well as truncated (streaming) input, where any open
 * strings, arrays and objects are closed at end-of-input.
 *
 * @throws {Error} only when the input contains no JSON value at all.
 */
export function lenientParse(input: string): unknown {
  const s = input;
  const n = s.length;
  let i = 0;

  function skipWs(): void {
    while (i < n) {
      const c = s[i]!;
      if (WS.has(c)) {
        i++;
        continue;
      }
      // line comment
      if (c === "/" && s[i + 1] === "/") {
        i += 2;
        while (i < n && s[i] !== "\n") i++;
        continue;
      }
      // block comment
      if (c === "/" && s[i + 1] === "*") {
        i += 2;
        while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      break;
    }
  }

  function parseValue(): unknown {
    skipWs();
    if (i >= n) throw new Error("Unexpected end of input");
    const c = s[i]!;
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"' || c === "'" || c === "`") return parseString();
    return parseLiteral();
  }

  function parseString(): string {
    const quote = s[i]!;
    i++; // opening quote
    let out = "";
    while (i < n) {
      const c = s[i]!;
      if (c === "\\") {
        const next = s[i + 1];
        if (next === undefined) {
          i++;
          break; // truncated escape
        }
        switch (next) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "v": out += "\v"; break;
          case "0": out += "\0"; break;
          case "/": out += "/"; break;
          case "\\": out += "\\"; break;
          case '"': out += '"'; break;
          case "'": out += "'"; break;
          case "`": out += "`"; break;
          case "\n": i += 2; continue; // escaped newline = line continuation
          case "u": {
            const hex = s.slice(i + 2, i + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              out += String.fromCharCode(parseInt(hex, 16));
              i += 6;
              continue;
            }
            out += "u";
            break;
          }
          case "x": {
            const hex = s.slice(i + 2, i + 4);
            if (/^[0-9a-fA-F]{2}$/.test(hex)) {
              out += String.fromCharCode(parseInt(hex, 16));
              i += 4;
              continue;
            }
            out += "x";
            break;
          }
          default:
            out += next;
            break;
        }
        i += 2;
        continue;
      }
      if (c === quote) {
        i++;
        return out;
      }
      out += c;
      i++;
    }
    // Unterminated string (truncated). Return what we read.
    return out;
  }

  function parseLiteral(): unknown {
    const start = i;
    while (i < n) {
      const c = s[i]!;
      if (WS.has(c) || STRUCTURAL.has(c)) break;
      if (c === "/" && (s[i + 1] === "/" || s[i + 1] === "*")) break;
      i++;
    }
    const word = s.slice(start, i);
    if (word === "") {
      // A stray structural char where a value was expected. Advance past it so
      // callers can't loop forever, then signal "no value here".
      i++;
      throw new Error(`Unexpected character ${JSON.stringify(s[start])}`);
    }
    return classifyWord(word);
  }

  function parseKey(): string | undefined {
    skipWs();
    if (i >= n) return undefined;
    const c = s[i]!;
    if (c === '"' || c === "'" || c === "`") return parseString();
    const start = i;
    while (i < n) {
      const ch = s[i]!;
      if (ch === ":" || ch === "," || STRUCTURAL.has(ch) || WS.has(ch)) break;
      i++;
    }
    const key = s.slice(start, i).trim();
    return key.length ? key : undefined;
  }

  function parseObject(): Record<string, unknown> {
    i++; // consume {
    const obj: Record<string, unknown> = {};
    while (true) {
      const before = i;
      skipWs();
      if (i >= n) break; // truncated → close object
      if (s[i] === "}") {
        i++;
        break;
      }
      if (s[i] === ",") {
        i++;
        continue; // skip stray / leading / trailing commas
      }
      const key = parseKey();
      if (key === undefined) break;
      skipWs();
      if (i < n && s[i] === ":") i++; // tolerate a missing colon otherwise
      skipWs();

      let value: unknown = null;
      let hasValue = true;
      if (i >= n) {
        hasValue = false; // truncated right after the key/colon → drop it
      } else if (s[i] === "," || s[i] === "}") {
        value = null; // empty value slot, e.g. {"a":,}
      } else {
        try {
          value = parseValue();
        } catch {
          // Unparseable / truncated value — keep the pairs gathered so far.
          return obj;
        }
      }

      // Assign safely — never let a "__proto__" key pollute the prototype.
      if (hasValue && key !== "__proto__") {
        Object.defineProperty(obj, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      skipWs();
      if (i < n && s[i] === ",") {
        i++;
        continue;
      }
      if (i < n && s[i] === "}") {
        i++;
        break;
      }
      // Otherwise a comma is simply missing — loop again to read the next pair.
      if (i >= n) break;
      if (i === before) {
        i++; // safety: guarantee forward progress
      }
    }
    return obj;
  }

  function parseArray(): unknown[] {
    i++; // consume [
    const arr: unknown[] = [];
    while (true) {
      const before = i;
      skipWs();
      if (i >= n) break; // truncated → close array
      if (s[i] === "]") {
        i++;
        break;
      }
      if (s[i] === ",") {
        i++;
        continue; // skip stray / trailing commas
      }
      if (s[i] === "}") {
        // Mismatched close belonging to a parent; stop the array here.
        break;
      }
      try {
        arr.push(parseValue());
      } catch {
        // Unparseable / truncated element — keep the elements gathered so far.
        return arr;
      }
      skipWs();
      if (i < n && s[i] === ",") {
        i++;
        continue;
      }
      if (i < n && s[i] === "]") {
        i++;
        break;
      }
      if (i >= n) break;
      // Missing comma between elements — keep going.
      if (i === before) {
        i++; // safety: guarantee forward progress
      }
    }
    return arr;
  }

  return parseValue();
}

/**
 * Map a bareword to its JSON meaning: booleans (incl. Python `True`/`False`),
 * nulls (`null`/`None`/`undefined`), non-finite numbers (`NaN`/`Infinity` → null),
 * finite numbers, and anything else as a plain string (an unquoted value).
 */
function classifyWord(word: string): unknown {
  switch (word) {
    case "true": case "True": case "TRUE": return true;
    case "false": case "False": case "FALSE": return false;
    case "null": case "Null": case "NULL": case "None": case "none": return null;
    case "undefined": return null;
    case "NaN": case "nan": return null;
    case "Infinity": case "infinity": case "+Infinity": return null;
    case "-Infinity": return null;
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(word)) {
    const num = Number(word);
    return Number.isFinite(num) ? num : null;
  }
  // Unknown bareword in a *value* position (object keys are read separately and
  // always quoted). This is genuine garbage — reject it so parseJson can honour
  // its fallback / error contract instead of silently coercing junk to a string.
  throw new Error(`Unexpected token ${JSON.stringify(word)}`);
}

/**
 * Repair a broken JSON string and return valid JSON text.
 *
 * Fixes trailing commas, single quotes, unquoted keys, Python/JS literals,
 * non-finite numbers, `//` and `/* *\/` comments, missing commas, and closes
 * unterminated strings / objects / arrays for truncated output.
 *
 * Already-valid JSON is returned **unchanged** (byte for byte).
 */
export function repairJson(str: string): string {
  if (typeof str !== "string") return str;
  // Preserve valid JSON exactly as given.
  try {
    JSON.parse(str);
    return str;
  } catch {
    /* fall through to repair */
  }
  try {
    return JSON.stringify(lenientParse(str));
  } catch {
    // Nothing JSON-like in there — hand back the original for the caller to see.
    return str;
  }
}
