import { basename, extname } from "node:path";
import { fillTemplate } from "./generate.js";

/** How single-line/block comments are written for a language. */
export type CommentStyle =
  | { kind: "line"; token: string }
  | { kind: "block" }
  | { kind: "xml" };

/** The default per-file header template (SPDX style). */
export const DEFAULT_HEADER_TEMPLATE =
  "Copyright (c) {{year}} {{holder}}\nSPDX-License-Identifier: {{id}}";

const LINE_SLASH = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "go", "rs", "java",
  "c", "h", "cpp", "hpp", "cc", "hh", "cxx", "cs", "kt", "kts", "swift",
  "scala", "dart", "php", "groovy", "gradle", "proto", "m", "mm", "v", "zig",
]);
const LINE_HASH = new Set([
  "py", "rb", "sh", "bash", "zsh", "fish", "yaml", "yml", "toml", "pl", "pm",
  "r", "ps1", "psm1", "tf", "tfvars", "ex", "exs", "nim", "cr", "coffee",
  "gemspec", "rake", "cmake", "conf", "ini", "env", "properties",
]);
const LINE_DASH = new Set(["sql", "lua", "hs", "elm", "adb", "ads", "vhdl"]);
const BLOCK = new Set(["css", "scss", "less", "styl"]);
const XML = new Set(["html", "htm", "xhtml", "xml", "svg", "vue", "svelte", "md", "markdown"]);

const FILENAME_HASH = new Set([
  "dockerfile", "makefile", "gnumakefile", "cmakelists.txt", "gemfile",
  "rakefile", "vagrantfile", "brewfile", ".gitignore", ".dockerignore",
  ".npmignore", ".env", ".editorconfig",
]);

/** Map a file path to its comment style, or `null` if unknown/unsupported. */
export function styleForFile(path: string): CommentStyle | null {
  const base = basename(path).toLowerCase();
  if (FILENAME_HASH.has(base)) return { kind: "line", token: "#" };
  const ext = extname(path).slice(1).toLowerCase();
  if (!ext) return null;
  if (LINE_SLASH.has(ext)) return { kind: "line", token: "//" };
  if (LINE_HASH.has(ext)) return { kind: "line", token: "#" };
  if (LINE_DASH.has(ext)) return { kind: "line", token: "--" };
  if (BLOCK.has(ext)) return { kind: "block" };
  if (XML.has(ext)) return { kind: "xml" };
  return null;
}

/** Options for building/adding a header. */
export interface HeaderFields {
  id: string;
  year?: string | number;
  holder?: string;
  /** Override the default header template (uses {{year}}/{{holder}}/{{id}}). */
  template?: string;
}

/** Fill the header template's placeholders (including {{id}}). */
function fillHeaderTemplate(fields: HeaderFields): string[] {
  const base = (fields.template ?? DEFAULT_HEADER_TEMPLATE).replace(
    /\{\{\s*id\s*\}\}/g,
    fields.id,
  );
  const filled = fillTemplate(base, { year: fields.year, holder: fields.holder });
  return filled.replace(/\r\n/g, "\n").replace(/\n+$/g, "").split("\n");
}

/** Render header body lines into a comment block for a given style. */
export function buildHeader(style: CommentStyle, fields: HeaderFields, eol = "\n"): string {
  const lines = fillHeaderTemplate(fields);
  let rendered: string[];
  if (style.kind === "line") {
    rendered = lines.map((l) => (l ? `${style.token} ${l}` : style.token));
  } else if (style.kind === "block") {
    rendered = ["/*", ...lines.map((l) => (l ? ` * ${l}` : " *")), " */"];
  } else {
    rendered = ["<!--", ...lines.map((l) => (l ? `  ${l}` : "")), "-->"];
  }
  return rendered.join(eol);
}

interface SplitFile {
  eol: string;
  lines: string[];
  finalNewline: boolean;
}

function splitFile(content: string): SplitFile {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const finalNewline = content.length > 0 && content.endsWith("\n");
  const lines = content.split(/\r\n|\n/);
  if (finalNewline) lines.pop(); // drop the trailing "" produced by the final newline
  return { eol, lines, finalNewline };
}

function joinFile(lines: string[], eol: string, finalNewline: boolean): string {
  return lines.join(eol) + (finalNewline ? eol : "");
}

interface HeaderBlock {
  present: boolean;
  /** first line index of the header comment */
  start: number;
  /** exclusive line index just past the header comment (before any blank sep) */
  blockEnd: number;
  /** exclusive line index including one consumed trailing blank separator */
  end: number;
  /** index just after a shebang line, if any */
  afterShebang: number;
}

/**
 * Locate an existing licence header at the top of a file (after an optional
 * shebang and leading blank lines). Only a top-of-file comment carrying an
 * `SPDX-License-Identifier:` or `Copyright` line counts — inner comments are
 * never touched.
 */
export function findHeader(content: string, style: CommentStyle): HeaderBlock {
  const { lines } = splitFile(content);
  let i = 0;
  if (lines[0]?.startsWith("#!")) i = 1;
  const afterShebang = i;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  const start = i;
  const absent: HeaderBlock = { present: false, start: afterShebang, blockEnd: afterShebang, end: afterShebang, afterShebang };
  if (i >= lines.length) return absent;
  const first = lines[i]!.trim();
  let blockEnd = -1;
  if (style.kind === "line") {
    if (!first.startsWith(style.token)) return absent;
    let j = i;
    while (j < lines.length && lines[j]!.trim().startsWith(style.token)) j++;
    blockEnd = j;
  } else if (style.kind === "block") {
    if (!first.startsWith("/*")) return absent;
    let j = i;
    while (j < lines.length && !lines[j]!.includes("*/")) j++;
    if (j >= lines.length) return absent;
    blockEnd = j + 1;
  } else {
    if (!first.startsWith("<!--")) return absent;
    let j = i;
    while (j < lines.length && !lines[j]!.includes("-->")) j++;
    if (j >= lines.length) return absent;
    blockEnd = j + 1;
  }
  const blockText = lines.slice(start, blockEnd).join("\n");
  if (!/SPDX-License-Identifier:/i.test(blockText) && !/Copyright/i.test(blockText)) {
    return absent;
  }
  let end = blockEnd;
  if (end < lines.length && lines[end]!.trim() === "") end++;
  return { present: true, start, blockEnd, end, afterShebang };
}

/** Does the file already carry a licence header? */
export function hasHeader(content: string, style: CommentStyle): boolean {
  return findHeader(content, style).present;
}

/** Result of a header mutation. */
export interface HeaderResult {
  changed: boolean;
  content: string;
}

/**
 * Add a licence header to a file if it does not already have one. Idempotent —
 * a second call is a no-op. Preserves a shebang line, the file's EOL style and
 * final-newline. Inserts the header after any shebang, separated from the code
 * by one blank line.
 */
export function addHeader(content: string, style: CommentStyle, fields: HeaderFields): HeaderResult {
  const found = findHeader(content, style);
  if (found.present) return { changed: false, content };
  const { eol, lines, finalNewline } = splitFile(content);
  const header = buildHeader(style, fields, eol).split(eol);
  const idx = lines[0]?.startsWith("#!") ? 1 : 0;
  const before = lines.slice(0, idx);
  const rest = lines.slice(idx);
  while (rest.length && rest[0]!.trim() === "") rest.shift(); // avoid stacked blanks
  const out = [...before, ...header];
  if (rest.length) out.push("", ...rest);
  const wasEmpty = content.trim() === "";
  return {
    changed: true,
    content: joinFile(out, eol, wasEmpty ? true : finalNewline || true),
  };
}

/**
 * Refresh an existing header (year / holder / id / template). If no header is
 * present, one is added.
 */
export function updateHeader(content: string, style: CommentStyle, fields: HeaderFields): HeaderResult {
  const found = findHeader(content, style);
  if (!found.present) return addHeader(content, style, fields);
  const { eol, lines, finalNewline } = splitFile(content);
  const header = buildHeader(style, fields, eol).split(eol);
  const out = [...lines.slice(0, found.start), ...header, ...lines.slice(found.blockEnd)];
  const next = joinFile(out, eol, finalNewline);
  return { changed: next !== content, content: next };
}

/**
 * Remove a licence header (and its trailing blank separator) from a file,
 * leaving everything else — including a shebang — intact.
 */
export function removeHeader(content: string, style: CommentStyle): HeaderResult {
  const found = findHeader(content, style);
  if (!found.present) return { changed: false, content };
  const { eol, lines, finalNewline } = splitFile(content);
  const out = [...lines.slice(0, found.start), ...lines.slice(found.end)];
  return { changed: true, content: joinFile(out, eol, finalNewline) };
}
