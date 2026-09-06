/**
 * Convert a `.env` map to and from JSON and a **flat** YAML mapping, plus render
 * a map back to `.env` text (with correct quoting). Import understands the same
 * two formats, so `.env ⇄ .json ⇄ .yaml` round-trips.
 *
 * The YAML support is deliberately small: a flat `KEY: value` mapping is all a
 * `.env` needs. Nested mappings, anchors, block scalars and flow collections are
 * out of scope — see the limitations in the README.
 */

/** Serialise a map as pretty JSON (values are strings). */
export function toJSON(map: Record<string, string>): string {
  return JSON.stringify(map, null, 2) + "\n";
}

/**
 * Parse a JSON object into a string map. Scalar values (string/number/boolean)
 * are coerced to strings; `null` becomes `""`; nested objects/arrays are
 * JSON-encoded so nothing is silently dropped. Throws on non-object input.
 */
export function fromJSON(text: string): Record<string, string> {
  const data: unknown = JSON.parse(text);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("expected a JSON object of key → value");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    out[k] = coerce(v);
  }
  return out;
}

function coerce(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function needsYamlQuote(v: string): boolean {
  if (v === "") return true;
  if (v !== v.trim()) return true;
  if (/^[?:\-#&*!|>'"%@`]/.test(v)) return true;
  if (/[:#]/.test(v)) return true;
  if (/[\n\t]/.test(v)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(v)) return true;
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return true; // number-like
  return false;
}

/** Serialise a map as a flat YAML mapping. */
export function toYAML(map: Record<string, string>): string {
  const lines = Object.entries(map).map(([k, v]) =>
    needsYamlQuote(v) ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`,
  );
  return lines.join("\n") + (lines.length ? "\n" : "");
}

/** Parse a flat YAML mapping into a string map. Ignores comments and `---`. */
export function fromYAML(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart();
    if (line === "" || line.startsWith("#") || line === "---" || line === "...") continue;
    const colon = findYamlColon(line);
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (key === "") continue;
    out[key] = parseYamlScalar(line.slice(colon + 1).trim());
  }
  return out;
}

/** Index of the `:` that separates key from value (a bare `:` at top level). */
function findYamlColon(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ":" && (i + 1 === line.length || /\s/.test(line[i + 1]!))) return i;
  }
  return -1;
}

function parseYamlScalar(s: string): string {
  if (s === "" || s === "~" || s.toLowerCase() === "null") return "";
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1) === -1 ? s.length : lastUnescapedQuote(s);
    try {
      return JSON.parse(s.slice(0, end + 1)) as string;
    } catch {
      return s.slice(1, end);
    }
  }
  if (s.startsWith("'")) {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") { out += "'"; i++; } // '' is an escaped quote
        else break;
      } else out += s[i];
    }
    return out;
  }
  // Unquoted: strip a trailing " # comment" (needs whitespace before #).
  const hash = s.search(/\s#/);
  return (hash === -1 ? s : s.slice(0, hash)).trim();
}

function lastUnescapedQuote(s: string): number {
  for (let i = 1; i < s.length; i++) {
    if (s[i] === '"' && s[i - 1] !== "\\") return i;
  }
  return s.length - 1;
}

/**
 * Render a map back to `.env` text. Values are quoted only when they need it
 * (empty, surrounding whitespace, `#`, quotes, `$`, or newlines/tabs), using
 * double quotes with `\n`/`\t`/`\\`/`\"` escapes so the parser round-trips them.
 */
export function renderEnv(map: Record<string, string>): string {
  const lines = Object.entries(map).map(([k, v]) => `${k}=${renderValue(v)}`);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function renderValue(v: string): string {
  if (v === "") return "";
  const needsQuote = /[\s#'"`$\\]/.test(v) || v !== v.trim();
  if (!needsQuote) return v;
  const escaped = v
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}
