/**
 * Zero-dependency locale format conversion. Reads and writes JSON, YAML,
 * `.properties` (reusing the existing readers / serializer) plus a pragmatic
 * subset of gettext `.po`, and converts between any pair.
 *
 * ## gettext `.po` subset
 * Supported: `msgid` / `msgstr` entries, `msgctxt` (context — the key becomes
 * `contextmsgid`), multi-line continuation strings (`""` folding), the
 * standard `\n \t \r \" \\` escapes, `#` comments (ignored) and the empty-id
 * header entry (skipped on read, emitted on write). NOT supported: plural forms
 * (`msgid_plural` / `msgstr[N]`) — a plural entry keeps only `msgstr[0]`.
 *
 * The flat key model is shared with the rest of the tool (dotted keys), so a PO
 * whose ids are dotted keys round-trips through JSON/YAML/properties cleanly.
 */
import type { FlatMap, JsonValue } from "./flatten.js";
import { flatten } from "./flatten.js";
import { parseByFormat } from "./readers.js";
import type { FileFormat } from "./readers.js";
import { serialize } from "./sort.js";

/** Formats {@link convert} understands (the three file formats plus `po`). */
export type ConvertFormat = FileFormat | "po";

/** gettext's context/id separator (EOT, U+0004); folds `msgctxt` into a key. */
const GETTEXT_CONTEXT = "\u0004";

/** Pick a {@link ConvertFormat} from a filename, or `null` if unsupported. */
export function convertFormatFromPath(path: string): ConvertFormat | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".properties")) return "properties";
  if (lower.endsWith(".po") || lower.endsWith(".pot")) return "po";
  return null;
}

/** Parse any supported format's text into a flat, dotted key map. */
export function parseToFlat(text: string, format: ConvertFormat): FlatMap {
  if (format === "po") return parsePo(text);
  return flatten(parseByFormat(text, format));
}

/** Serialize a flat map to any supported format's text. */
export function serializeFlat(flat: FlatMap, format: ConvertFormat, indent = 2): string {
  if (format === "po") return serializePo(flat);
  return serialize(flat, format, indent);
}

/** Convert locale text from one format to another. */
export function convert(text: string, from: ConvertFormat, to: ConvertFormat, indent = 2): string {
  return serializeFlat(parseToFlat(text, from), to, indent);
}

// --- gettext .po ----------------------------------------------------------

/** Parse a gettext `.po` (subset) into a flat map (`msgid` → `msgstr`). */
export function parsePo(text: string): FlatMap {
  const out: FlatMap = {};
  const lines = text.split(/\r?\n/);
  let ctxt: string | null = null;
  let id: string | null = null;
  let str: string | null = null;
  let target: "ctxt" | "id" | "str" | null = null;

  const commit = (): void => {
    if (id !== null && id !== "") {
      const key = ctxt ? `${ctxt}${GETTEXT_CONTEXT}${id}` : id;
      out[key] = str ?? "";
    }
    ctxt = null;
    id = null;
    str = null;
    target = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      commit();
      continue;
    }
    if (line.startsWith("#")) continue; // comments / flags
    if (line.startsWith("msgctxt")) {
      if (id !== null) commit();
      ctxt = decodePo(firstString(line));
      target = "ctxt";
    } else if (line.startsWith("msgid_plural")) {
      target = null; // plural id ignored (subset)
    } else if (line.startsWith("msgid")) {
      if (id !== null) commit();
      id = decodePo(firstString(line));
      target = "id";
    } else if (line.startsWith("msgstr[0]")) {
      str = decodePo(firstString(line));
      target = "str";
    } else if (/^msgstr\[\d+\]/.test(line)) {
      target = null; // additional plural forms ignored (subset)
    } else if (line.startsWith("msgstr")) {
      str = decodePo(firstString(line));
      target = "str";
    } else if (line.startsWith('"')) {
      const piece = decodePo(unquotePo(line));
      if (target === "ctxt") ctxt = (ctxt ?? "") + piece;
      else if (target === "id") id = (id ?? "") + piece;
      else if (target === "str") str = (str ?? "") + piece;
    }
  }
  commit();
  return out;
}

/** Serialize a flat map into a gettext `.po` (subset), keys sorted. */
export function serializePo(flat: FlatMap): string {
  const out: string[] = [];
  out.push('msgid ""');
  out.push('msgstr ""');
  out.push('"Content-Type: text/plain; charset=UTF-8\\n"');
  out.push('"Generated-By: lacspace-i18n\\n"');
  out.push("");
  for (const key of Object.keys(flat).sort()) {
    const value = flat[key];
    const sep = key.indexOf(GETTEXT_CONTEXT);
    const ctxt = sep === -1 ? null : key.slice(0, sep);
    const id = sep === -1 ? key : key.slice(sep + 1);
    if (ctxt !== null) out.push(`msgctxt "${encodePo(ctxt)}"`);
    out.push(`msgid "${encodePo(id)}"`);
    out.push(`msgstr "${encodePo(value === null || value === undefined ? "" : String(value))}"`);
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

/** Extract the first `"..."` string body from a `msgid "x"` style line. */
function firstString(line: string): string {
  const q = line.indexOf('"');
  if (q === -1) return "";
  return unquotePo(line.slice(q));
}

/** Return the raw (still-escaped) body of a leading `"..."`. */
function unquotePo(s: string): string {
  const start = s.indexOf('"');
  if (start === -1) return "";
  let out = "";
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\") {
      out += ch + (s[i + 1] ?? "");
      i++;
    } else if (ch === '"') {
      break;
    } else {
      out += ch;
    }
  }
  return out;
}

function decodePo(s: string): string {
  return s.replace(/\\(.)/g, (_m, ch: string) => {
    switch (ch) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case '"': return '"';
      case "\\": return "\\";
      default: return ch;
    }
  });
}

function encodePo(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}

// re-export so callers importing "./convert.js" get JsonValue typing if needed
export type { JsonValue };
