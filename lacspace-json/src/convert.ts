/**
 * Format detection and conversion between JSON, YAML, TOML, CSV and NDJSON.
 */
import { JsonToolError, safeSet, isForbiddenKey } from "./util.js";
import type { JsonValue } from "./util.js";
import { parseYaml, stringifyYaml } from "./yaml.js";
import { parseToml, stringifyToml } from "./toml.js";
import { parseCsv, stringifyCsv, parseNdjson, stringifyNdjson } from "./csv.js";

export type Format = "json" | "yaml" | "toml" | "csv" | "ndjson";

const EXT_MAP: Record<string, Format> = {
  json: "json", json5: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  csv: "csv", tsv: "csv",
  ndjson: "ndjson", jsonl: "ndjson",
};

/** Guess a format from a filename extension, else undefined. */
export function formatFromExt(filename: string): Format | undefined {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename);
  if (!m) return undefined;
  return EXT_MAP[m[1]!.toLowerCase()];
}

/** Best-effort format detection from the content itself. */
export function detectFormat(src: string): Format {
  const trimmed = src.trim();
  if (trimmed === "") return "json";
  // NDJSON: multiple lines each starting with { or [
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length > 1 && lines.every((l) => { const t = l.trim(); return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]")); })) {
    // could be NDJSON; verify each parses
    if (lines.every((l) => { try { JSON.parse(l); return true; } catch { return false; } })) return "ndjson";
  }
  if (trimmed[0] === "{" || trimmed[0] === "[") {
    try { JSON.parse(trimmed); return "json"; } catch { /* fallthrough */ }
  }
  // TOML: has [table] headers or key = value with no colons dominating
  if (/^\s*\[\[?[^\]]+\]\]?\s*$/m.test(trimmed) && /^\s*[A-Za-z0-9_."'-]+\s*=/m.test(trimmed)) return "toml";
  // CSV: first line has commas and no obvious YAML/JSON markers
  const first = lines[0]!.trim();
  if (first.includes(",") && !first.includes(": ") && !/^[\[{]/.test(first) && lines.length >= 1) {
    // treat as CSV only if it doesn't look like YAML flow
    if (!/^\s*-\s/.test(first)) return "csv";
  }
  // key = value TOML-ish
  if (/^\s*[A-Za-z0-9_."'-]+\s*=\s*/m.test(trimmed) && !/:\s/.test(trimmed)) return "toml";
  // default: YAML (superset-ish of many key: value docs)
  return "yaml";
}

/** Parse `src` in the given format into a JSON value. */
export function parseFormat(src: string, format: Format): JsonValue {
  switch (format) {
    case "json": {
      try { return sanitizeJson(JSON.parse(src === "" ? "null" : src)); }
      catch (err) { throw new JsonToolError(`Invalid JSON: ${(err as Error).message}`); }
    }
    case "yaml": return parseYaml(src);
    case "toml": return parseToml(src);
    case "csv": return parseCsv(src);
    case "ndjson": return parseNdjson(src);
  }
}

/** Serialize a JSON value into the given format. */
export function stringifyFormat(value: JsonValue, format: Format, opts: { indent?: number; sortKeys?: boolean; minify?: boolean } = {}): string {
  switch (format) {
    case "json": {
      const space = opts.minify ? undefined : opts.indent ?? 2;
      return JSON.stringify(value, null, space) + (opts.minify ? "" : "\n");
    }
    case "yaml": return stringifyYaml(value);
    case "toml": return stringifyToml(value);
    case "csv": return stringifyCsv(value);
    case "ndjson": return stringifyNdjson(value);
  }
}

/** Convert text from one format to another. */
export function convert(src: string, from: Format, to: Format, opts: { indent?: number; minify?: boolean } = {}): string {
  const value = parseFormat(src, from);
  return stringifyFormat(value, to, opts);
}

/**
 * Recursively rebuild a parsed JSON value dropping prototype-pollution keys.
 * `JSON.parse` itself is safe, but downstream merges/writes should never carry a
 * literal `__proto__` own key, so we strip them at the boundary.
 */
export function sanitizeJson(v: unknown): JsonValue {
  if (v === null || typeof v !== "object") return v as JsonValue;
  if (Array.isArray(v)) return v.map(sanitizeJson);
  const out: Record<string, JsonValue> = {};
  for (const k of Object.keys(v as Record<string, unknown>)) {
    if (isForbiddenKey(k)) continue;
    safeSet(out, k, sanitizeJson((v as Record<string, unknown>)[k]));
  }
  return out;
}
