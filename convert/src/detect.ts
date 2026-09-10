/**
 * Format sniffing. Cheap, order-sensitive heuristics — see `detect()`.
 */
import type { Format } from "./types";
import { decodeText } from "./util";

const MD_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TOML_LINE_RE = /^\s*(\[\[?[^\]]+\]\]?|[A-Za-z0-9_"'.-]+\s*=\s*\S.*)\s*$/;
const YAML_LINE_RE = /^\s*(-\s+\S.*|-|("[^"]*"|'[^']*'|[^\s:#,|"'][^:]*):(\s.*)?)$/;

function nonEmptyLines(text: string, max = 40): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l === "" || l.startsWith("#")) continue;
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

function isJsonObjectLine(l: string): boolean {
  const t = l.trim();
  if (t[0] !== "{") return false;
  try { return typeof JSON.parse(t) === "object"; } catch { return false; }
}

function count(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
  return n;
}

/** Consistent delimiter across the first lines (ignoring quoting) → looks like csv/tsv. */
function delimiterOf(lines: string[]): "," | "\t" | ";" | "|" | null {
  const best: { d: "," | "\t" | ";" | "|"; score: number }[] = [];
  for (const d of [",", "\t", ";", "|"] as const) {
    const counts = lines.map((l) => count(l, d));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    if (consistent >= 0.6) best.push({ d, score: first * consistent });
  }
  best.sort((a, b) => b.score - a.score);
  return best[0]?.d ?? null;
}

/**
 * Sniff the format of a text or byte input. Returns `null` when nothing
 * matches (empty input, prose, binary that isn't xlsx).
 *
 * Order: xlsx (PK zip magic) → json → ndjson → html → markdown table → sql →
 * toml → yaml → csv / tsv (delimiter count on the first lines).
 *
 * @example
 * detect('[{"a":1}]');        // "json"
 * detect("a,b\n1,2");         // "csv"
 * detect("a\tb\n1\t2");       // "tsv"
 * detect("- a: 1\n- a: 2");   // "yaml"
 * detect(new Uint8Array([0x50, 0x4b, 3, 4])); // "xlsx"
 */
export function detect(input: string | Uint8Array): Format | null {
  if (typeof input !== "string") {
    if (input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) return "xlsx";
    // Refuse to sniff obviously binary payloads as text.
    const probe = input.subarray(0, 512);
    for (let i = 0; i < probe.length; i++) {
      const b = probe[i]!;
      if (b === 0 || (b < 0x09 && b !== 0)) return null;
    }
  }
  const text = decodeText(input).trim();
  if (text === "") return null;
  const lines = nonEmptyLines(text);
  const first = text[0];

  if (first === "{" || first === "[") {
    try { JSON.parse(text); return "json"; } catch { /* fallthrough */ }
    if (lines.length >= 1 && lines.every(isJsonObjectLine)) return "ndjson";
  }
  if (/^\s*<(!doctype\s+html|html|table|body|head)\b/i.test(text) || /<table\b/i.test(text)) return "html";
  if (lines.length >= 2 && lines.some((l) => l.includes("|") && MD_SEPARATOR_RE.test(l))) return "markdown";
  if (/\b(INSERT\s+INTO|CREATE\s+TABLE)\b/i.test(text)) return "sql";

  const tomlHits = lines.filter((l) => TOML_LINE_RE.test(l)).length;
  const yamlHits = lines.filter((l) => YAML_LINE_RE.test(l)).length;
  const delim = delimiterOf(lines);

  if (tomlHits >= 1 && tomlHits / lines.length >= 0.6 && lines.some((l) => /^\s*\[|^\s*\S+\s*=\s/.test(l))) return "toml";
  if (yamlHits >= 1 && yamlHits / lines.length >= 0.6 && (delim === null || delim === "|" || lines[0]!.trim().startsWith("-") || /:\s*$/.test(lines[0]!))) return "yaml";
  if (delim === "\t") return "tsv";
  if (delim !== null) return "csv";
  if (lines.length >= 2 && lines.every((l) => !/\s/.test(l.trim()))) return "csv"; // single-column csv
  return null;
}
