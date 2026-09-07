/**
 * Single-file byte-composition estimator (zero deps).
 *
 * Given one source file's text, it makes a crude, non-overlapping split of its
 * bytes into four buckets — code / strings / comments / whitespace — using a
 * tiny hand-written scanner (no real parser), surfaces the largest string
 * literals and lines, attempts a crude module-boundary split on bundler banners
 * (`//# sourceURL=`, esbuild `// path/to/file.js` markers), and emits a
 * treemap-friendly nested JSON. Every byte is attributed to exactly one bucket,
 * so the segment bytes always sum back to the file's byte length.
 *
 * It is an *estimate*: regex literals, template interpolation and language
 * quirks are treated loosely on purpose. Good for "where did my bundle go?",
 * not for byte-exact accounting.
 */
import { readFileSync } from "node:fs";

/** Which of the four non-overlapping byte buckets a run belongs to. */
export type SegmentKind = "code" | "strings" | "comments" | "whitespace";

export interface CompositionOptions {
  /** How many of the largest string literals to surface. Default 10. */
  topStrings?: number;
  /** How many of the largest lines to surface. Default 10. */
  topLines?: number;
  /** Cap the number of module slices returned (0 = all). Default 25. */
  topModules?: number;
}

/** One bucket of the code/strings/comments/whitespace split. */
export interface CompositionSegment {
  kind: SegmentKind;
  bytes: number;
  /** Share of the file's total bytes (0-100). */
  percent: number;
}

/** A surfaced string literal. */
export interface StringLiteral {
  /** The literal's content (may be truncated for display). */
  value: string;
  /** Byte length of the whole literal including its quotes. */
  bytes: number;
  /** 1-based line the literal starts on. */
  line: number;
}

/** A surfaced source line. */
export interface LineSlice {
  /** 1-based line number. */
  line: number;
  /** Byte length of the line (excluding its trailing newline). */
  bytes: number;
  /** The line text (may be truncated for display). */
  text: string;
}

/** A crude module slice inferred from a bundler banner. */
export interface ModuleSlice {
  /** The module path/name lifted from the banner. */
  name: string;
  /** Byte length of the slice (banner line through the next banner). */
  bytes: number;
  /** Share of the file's total bytes (0-100). */
  percent: number;
  /** 1-based line the slice starts on. */
  startLine: number;
}

/** A treemap-friendly node: leaves carry `value`, branches carry `children`. */
export interface TreemapNode {
  name: string;
  value?: number;
  children?: TreemapNode[];
}

export interface CompositionResult {
  /** Total UTF-8 byte length of the input. */
  totalBytes: number;
  /** Number of lines. */
  lines: number;
  /** The four buckets, largest-first, always summing to `totalBytes`. */
  segments: CompositionSegment[];
  /** Largest string literals, largest-first. */
  topStrings: StringLiteral[];
  /** Largest lines, largest-first. */
  topLines: LineSlice[];
  /** Crude module slices (empty when fewer than two banners were found). */
  modules: ModuleSlice[];
  /** Nested treemap: root → category → (for strings) top literals. */
  treemap: TreemapNode;
}

/** UTF-8 byte length of a single Unicode code point. */
function utf8Len(cp: number): number {
  if (cp <= 0x7f) return 1;
  if (cp <= 0x7ff) return 2;
  if (cp <= 0xffff) return 3;
  return 4;
}

function isWhitespace(cp: number): boolean {
  // space, tab, newline, CR, form-feed, vertical-tab, NBSP.
  return cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x0c || cp === 0x0b || cp === 0xa0;
}

type ScanState = "normal" | "line" | "block" | "string";

/**
 * Estimate the byte composition of a single source file.
 * Accepts a string or a byte buffer (decoded as UTF-8).
 */
export function analyzeComposition(input: string | Uint8Array, opts: CompositionOptions = {}): CompositionResult {
  const text = typeof input === "string" ? input : Buffer.from(input).toString("utf8");
  const topStrings = opts.topStrings ?? 10;
  const topLines = opts.topLines ?? 10;
  const topModules = opts.topModules ?? 25;

  const cps = Array.from(text); // iterate by code point (handles surrogates)
  const buckets: Record<SegmentKind, number> = { code: 0, strings: 0, comments: 0, whitespace: 0 };

  let state: ScanState = "normal";
  let quote = "";
  let escaped = false;
  let line = 1;
  let literalBytes = 0;
  let literalStartLine = 1;
  let literalValue = "";
  const literals: StringLiteral[] = [];

  const add = (kind: SegmentKind, bytes: number): void => {
    buckets[kind] += bytes;
  };

  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i]!;
    const cp = ch.codePointAt(0)!;
    const b = utf8Len(cp);
    const next = cps[i + 1];

    if (state === "normal") {
      if (ch === "/" && next === "/") {
        state = "line";
        add("comments", b);
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block";
        add("comments", b);
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        state = "string";
        quote = ch;
        escaped = false;
        add("strings", b); // the opening quote
        literalBytes = b;
        literalValue = "";
        literalStartLine = line;
        continue;
      }
      if (ch === "\n") {
        add("whitespace", b);
        line++;
        continue;
      }
      add(isWhitespace(cp) ? "whitespace" : "code", b);
      continue;
    }

    if (state === "line") {
      if (ch === "\n") {
        // The newline ends the comment; count it as whitespace.
        add("whitespace", b);
        line++;
        state = "normal";
        continue;
      }
      add("comments", b);
      continue;
    }

    if (state === "block") {
      add("comments", b);
      if (ch === "\n") line++;
      if (ch === "*" && next === "/") {
        add("comments", utf8Len(next.codePointAt(0)!));
        i++; // consume the '/'
        state = "normal";
      }
      continue;
    }

    // state === "string"
    add("strings", b);
    literalBytes += b;
    if (ch === "\n") line++;
    if (escaped) {
      escaped = false;
      literalValue += ch;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      literalValue += ch;
      continue;
    }
    if (ch === quote) {
      // Close the literal.
      literals.push({ value: literalValue, bytes: literalBytes, line: literalStartLine });
      state = "normal";
      quote = "";
      literalValue = "";
      literalBytes = 0;
      continue;
    }
    literalValue += ch;
  }

  // An unterminated string at EOF still counts what we saw.
  if (state === "string" && literalBytes > 0) {
    literals.push({ value: literalValue, bytes: literalBytes, line: literalStartLine });
  }

  const totalBytes = buckets.code + buckets.strings + buckets.comments + buckets.whitespace;

  const segments: CompositionSegment[] = (Object.keys(buckets) as SegmentKind[])
    .map((kind) => ({ kind, bytes: buckets[kind], percent: percentOf(buckets[kind], totalBytes) }))
    .sort((a, b) => b.bytes - a.bytes);

  // Lines.
  const rawLines = text.split("\n");
  const lineSlices: LineSlice[] = rawLines.map((t, idx) => ({
    line: idx + 1,
    bytes: Buffer.byteLength(t, "utf8"),
    text: truncate(t.trim(), 120),
  }));
  const topLineSlices = [...lineSlices].sort((a, b) => b.bytes - a.bytes).slice(0, Math.max(0, topLines));

  const topStringLiterals = [...literals]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, Math.max(0, topStrings))
    .map((l) => ({ ...l, value: truncate(l.value, 120) }));

  const modules = detectModules(rawLines, totalBytes, topModules);

  const treemap = buildTreemap(text, segments, topStringLiterals);

  return {
    totalBytes,
    lines: rawLines.length,
    segments,
    topStrings: topStringLiterals,
    topLines: topLineSlices,
    modules,
    treemap,
  };
}

/** Read a file from disk and estimate its composition. */
export function analyzeCompositionFile(path: string, opts: CompositionOptions = {}): CompositionResult {
  return analyzeComposition(readFileSync(path), opts);
}

const BANNER_PATTERNS: RegExp[] = [
  /^\s*\/\/#\s*sourceURL=(.+?)\s*$/, // eval-bundled sourceURL
  /^\s*\/\/\s+([^\s]+\.(?:js|jsx|ts|tsx|mjs|cjs|css|json|wasm))\s*$/, // esbuild `// path/to/file.js`
  /^\s*\/\*+\s*([^\s*][^*]*?\.(?:js|jsx|ts|tsx|mjs|cjs|css|json))\s*\*+\/\s*$/, // `/* path/to/file.js */`
];

function bannerName(lineText: string): string | undefined {
  for (const re of BANNER_PATTERNS) {
    const m = re.exec(lineText);
    if (m && m[1]) return m[1];
  }
  return undefined;
}

/** Crude module split: bytes between successive bundler banner lines. */
function detectModules(rawLines: string[], totalBytes: number, cap: number): ModuleSlice[] {
  const slices: { name: string; startLine: number; bytes: number }[] = [];
  let current: { name: string; startLine: number; bytes: number } | null = null;
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i]!;
    // +1 for the newline that split() stripped (except conceptually the last line).
    const bytes = Buffer.byteLength(t, "utf8") + (i < rawLines.length - 1 ? 1 : 0);
    const name = bannerName(t);
    if (name !== undefined) {
      current = { name, startLine: i + 1, bytes };
      slices.push(current);
    } else if (current) {
      current.bytes += bytes;
    }
  }
  if (slices.length < 2) return [];
  const out = slices
    .map((s) => ({ name: s.name, startLine: s.startLine, bytes: s.bytes, percent: percentOf(s.bytes, totalBytes) }))
    .sort((a, b) => b.bytes - a.bytes);
  return cap > 0 ? out.slice(0, cap) : out;
}

/** Build a treemap where the strings category drills into its largest literals. */
function buildTreemap(name: string, segments: CompositionSegment[], strings: StringLiteral[]): TreemapNode {
  const children: TreemapNode[] = segments
    .filter((s) => s.bytes > 0)
    .map((s) => {
      if (s.kind === "strings" && strings.length) {
        const shown = strings.slice(0, 8);
        const shownBytes = shown.reduce((a, b) => a + b.bytes, 0);
        const kids: TreemapNode[] = shown.map((l, i) => ({
          name: l.value ? truncate(l.value, 32) : `string #${i + 1}`,
          value: l.bytes,
        }));
        const remainder = s.bytes - shownBytes;
        if (remainder > 0) kids.push({ name: "(other strings)", value: remainder });
        return { name: "strings", children: kids };
      }
      return { name: s.kind, value: s.bytes };
    });
  const total = segments.reduce((a, s) => a + s.bytes, 0);
  return { name: "bundle", value: total, children };
}

function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Number(((part / whole) * 100).toFixed(2));
}

function truncate(s: string, w: number): string {
  const one = s.replace(/\s+/g, " ");
  if (one.length <= w) return one;
  return one.slice(0, w - 1) + "…";
}
