/**
 * Normalize (sort) locale files, and optionally SYNC them against a base:
 * `fill` adds base keys missing from a target as empty strings or a marker,
 * `prune` removes keys not present in the base. Output is serialized back to
 * the file's own format (JSON / YAML / .properties). Default is a dry-run: the
 * caller decides whether to write `after` to disk.
 */
import { readFileSync } from "node:fs";
import type { FlatMap, JsonValue } from "./flatten.js";
import { unflatten, compareKeys } from "./flatten.js";
import type { FileFormat } from "./readers.js";
import type { LoadResult, LocaleFile } from "./load.js";

export interface SortOptions {
  /** Indent width for JSON / YAML output. Default `2`. */
  indent?: number;
  /** Add base keys missing from a target locale. */
  fill?: boolean;
  /** Value written for filled keys. Default `""`. */
  fillMarker?: string;
  /** Remove keys not present in the base locale. */
  prune?: boolean;
}

/** The normalization outcome for one physical file. */
export interface FileSortResult {
  path: string;
  locale: string;
  namespace: string | null;
  format: FileFormat;
  before: string;
  after: string;
  changed: boolean;
  /** Keys added by `fill`. */
  added: string[];
  /** Keys removed by `prune`. */
  removed: string[];
  /** True if only key ordering / formatting changed. */
  reordered: boolean;
}

/** Serialize a flat map to text in the given format, keys sorted. */
export function serialize(flat: FlatMap, format: FileFormat, indent: number): string {
  const keys = Object.keys(flat).sort(compareKeys);
  const sorted: FlatMap = {};
  for (const k of keys) sorted[k] = flat[k]!;
  switch (format) {
    case "json":
      return JSON.stringify(unflatten(sorted), null, indent) + "\n";
    case "yaml":
      return serializeYaml(unflatten(sorted), indent);
    case "properties":
      return keys.map((k) => `${escapePropKey(k)}=${escapePropValue(String(flat[k] ?? ""))}`).join("\n") + "\n";
  }
}

function isContainer(v: JsonValue): v is JsonValue[] | { [k: string]: JsonValue } {
  return v !== null && typeof v === "object";
}
function isEmptyContainer(v: JsonValue): boolean {
  return isContainer(v) && (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);
}

function serializeYaml(value: JsonValue, indent: number): string {
  const step = " ".repeat(indent);
  const emit = (node: JsonValue): string[] => {
    if (Array.isArray(node)) {
      const out: string[] = [];
      for (const item of node) {
        if (isContainer(item) && !isEmptyContainer(item)) {
          const sub = emit(item);
          out.push(`- ${sub[0]}`);
          for (const l of sub.slice(1)) out.push(`  ${l}`);
        } else {
          out.push(`- ${isEmptyContainer(item) ? (Array.isArray(item) ? "[]" : "{}") : scalarYaml(item)}`);
        }
      }
      return out;
    }
    const out: string[] = [];
    for (const [k, v] of Object.entries(node as { [k: string]: JsonValue })) {
      if (isContainer(v) && !isEmptyContainer(v)) {
        out.push(`${keyYaml(k)}:`);
        for (const l of emit(v)) out.push(`${step}${l}`);
      } else if (isEmptyContainer(v)) {
        out.push(`${keyYaml(k)}: ${Array.isArray(v) ? "[]" : "{}"}`);
      } else {
        out.push(`${keyYaml(k)}: ${scalarYaml(v)}`);
      }
    }
    return out;
  };
  if (!isContainer(value)) return scalarYaml(value) + "\n";
  return emit(value).join("\n") + "\n";
}

function keyYaml(k: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(k) ? k : JSON.stringify(k);
}

function scalarYaml(v: JsonValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const s = String(v);
  if (s === "" ||
    /^[\s]|[\s]$/.test(s) ||
    /[:#{}\[\],&*!|>'"%@`]/.test(s) ||
    /^(null|Null|NULL|~|true|True|TRUE|false|False|FALSE)$/.test(s) ||
    /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ||
    s.includes("\n")) {
    return JSON.stringify(s);
  }
  return s;
}

function escapePropKey(k: string): string {
  return k.replace(/([=:\s\\])/g, "\\$1");
}

function escapePropValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

/**
 * Normalize one file. `baseSubset` is the base locale's keys for this file's
 * namespace (unprefixed), or `null` for the base locale itself (sort only).
 */
export function normalizeFile(file: LocaleFile, baseSubset: FlatMap | null, opts: SortOptions = {}): FileSortResult {
  const indent = opts.indent ?? 2;
  const marker = opts.fillMarker ?? "";
  const next: FlatMap = { ...file.data };
  const added: string[] = [];
  const removed: string[] = [];

  if (opts.prune && baseSubset) {
    for (const k of Object.keys(next)) {
      if (!(k in baseSubset)) {
        delete next[k];
        removed.push(k);
      }
    }
  }
  if (opts.fill && baseSubset) {
    for (const k of Object.keys(baseSubset)) {
      if (!(k in next)) {
        next[k] = marker;
        added.push(k);
      }
    }
  }

  let before = "";
  try {
    before = readFileSync(file.path, "utf8");
  } catch {
    before = "";
  }
  const after = serialize(next, file.format, indent);
  const reordered = added.length === 0 && removed.length === 0 && before !== after;

  return {
    path: file.path,
    locale: file.locale,
    namespace: file.namespace,
    format: file.format,
    before,
    after,
    changed: before !== after,
    added: added.sort(compareKeys),
    removed: removed.sort(compareKeys),
    reordered,
  };
}

/** Strip a `<namespace>:` prefix subset out of the base's merged flat map. */
export function baseSubsetFor(baseFlat: FlatMap, namespace: string | null): FlatMap {
  if (!namespace) {
    // exclude any prefixed keys (mixed layouts) — take unprefixed only
    const out: FlatMap = {};
    for (const [k, v] of Object.entries(baseFlat)) if (!k.includes(":")) out[k] = v;
    return out;
  }
  const prefix = namespace + ":";
  const out: FlatMap = {};
  for (const [k, v] of Object.entries(baseFlat)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

/** Normalize every file across all locales, wiring base subsets per namespace. */
export function sortLocales(load: LoadResult, baseCode: string, opts: SortOptions = {}): FileSortResult[] {
  const base = load.locales.find((l) => l.code === baseCode);
  const results: FileSortResult[] = [];
  for (const loc of load.locales) {
    const isBase = loc.code === baseCode;
    for (const file of loc.files) {
      const subset = isBase || !base ? null : baseSubsetFor(base.flat, file.namespace);
      results.push(normalizeFile(file, subset, opts));
    }
  }
  return results;
}
