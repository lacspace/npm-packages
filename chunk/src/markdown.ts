import type { Chunk, SplitMarkdownOptions } from "./types";
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
  DEFAULT_SEPARATORS,
  type Range,
  charLength,
  lineStarts,
  mergeRanges,
  recursiveSplit,
} from "./core";

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const WS = /\s/;

interface Section {
  /** Full breadcrumb trail (ancestor headings + this heading), raw lines. */
  trail: string[];
  /** Line index of the heading (or -1 for the leading preamble). */
  headingLine: number;
  /** First content line (line after the heading, or 0 for preamble). */
  bodyStart: number;
  /** One past the last content line of this section. */
  bodyEnd: number;
}

/**
 * Split Markdown on heading structure. Each heading starts a section; chunks
 * are optionally prefixed with the heading breadcrumb so retrieved chunks keep
 * context. Fenced code blocks are kept intact (never split mid-fence).
 *
 * Offsets (`start`/`end`) point at the source body; when `includeBreadcrumb`
 * is on, `text` additionally carries the breadcrumb prefix.
 */
export function splitMarkdown(md: string, opts: SplitMarkdownOptions = {}): Chunk[] {
  if (!md) return [];
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.chunkOverlap ?? DEFAULT_OVERLAP;
  const separators = opts.separators ?? [...DEFAULT_SEPARATORS];
  const lengthFn = opts.lengthFn ?? charLength;
  const includeBreadcrumb = opts.includeBreadcrumb ?? true;
  const crumbSep = opts.breadcrumbSeparator ?? " > ";

  const lines = md.split("\n");
  const starts = lineStarts(md);
  const lineRange = (i: number): Range => [
    starts[i]!,
    i + 1 < starts.length ? starts[i + 1]! : md.length,
  ];

  // Mark which lines are headings (ignoring headings inside code fences).
  const isHeading: boolean[] = new Array(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && HEADING.test(line)) isHeading[i] = true;
  }

  // Build sections with breadcrumb trails from the heading stack.
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let preambleEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isHeading[i]) {
      preambleEnd = Math.min(preambleEnd, i);
      break;
    }
  }
  if (preambleEnd > 0) {
    sections.push({ trail: [], headingLine: -1, bodyStart: 0, bodyEnd: preambleEnd });
  }
  for (let i = 0; i < lines.length; i++) {
    if (!isHeading[i]) continue;
    const m = HEADING.exec(lines[i]!)!;
    const level = m[1]!.length;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text: lines[i]!.trim() });
    let bodyEnd = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (isHeading[j]) {
        bodyEnd = j;
        break;
      }
    }
    sections.push({
      trail: stack.map((s) => s.text),
      headingLine: i,
      bodyStart: i + 1,
      bodyEnd,
    });
  }

  const out: Chunk[] = [];
  for (const section of sections) {
    const crumb =
      includeBreadcrumb && section.trail.length > 0
        ? section.trail.join(crumbSep) + "\n\n"
        : "";
    const crumbLen = lengthFn(crumb);
    const budget = Math.max(1, chunkSize - crumbLen);

    // Build code-fence-aware atomic blocks over the section body.
    const blocks = atomicBlocks(md, lines, lineRange, section.bodyStart, section.bodyEnd);

    // Expand oversized non-code blocks; keep code blocks whole.
    const pieces: Range[] = [];
    for (const b of blocks) {
      const len = lengthFn(md.slice(b.range[0], b.range[1]));
      if (b.code || len <= budget) {
        pieces.push(b.range);
      } else {
        pieces.push(...recursiveSplit(md, b.range[0], b.range[1], separators, budget, lengthFn));
      }
    }

    const merged = mergeRanges(md, pieces, budget, overlap, lengthFn);
    for (const [rs, re] of merged) {
      let s = rs;
      let e = re;
      while (s < e && WS.test(md[s]!)) s++;
      while (e > s && WS.test(md[e - 1]!)) e--;
      if (e <= s) continue;
      out.push({
        text: crumb + md.slice(s, e),
        index: out.length,
        start: s,
        end: e,
      });
    }

    // A heading with no body still deserves a chunk so it is not lost.
    if (merged.length === 0 && crumb) {
      const [hs, he] = lineRange(section.headingLine >= 0 ? section.headingLine : 0);
      out.push({ text: crumb.trimEnd(), index: out.length, start: hs, end: he });
    }
  }
  return out;
}

interface Block {
  range: Range;
  code: boolean;
}

/** Group body lines into blocks, keeping fenced code blocks as single units. */
function atomicBlocks(
  md: string,
  lines: string[],
  lineRange: (i: number) => Range,
  from: number,
  to: number,
): Block[] {
  const blocks: Block[] = [];
  let i = from;
  while (i < to) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      // Consume through the closing fence (or end of section).
      let j = i + 1;
      while (j < to && !FENCE.test(lines[j]!)) j++;
      const endLine = j < to ? j : to - 1;
      blocks.push({ range: [lineRange(i)[0], lineRange(endLine)[1]], code: true });
      i = endLine + 1;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Accumulate a run of non-blank, non-fence lines.
    let j = i;
    while (j < to && lines[j]!.trim() !== "" && !FENCE.test(lines[j]!)) j++;
    const endLine = j - 1;
    blocks.push({ range: [lineRange(i)[0], lineRange(endLine)[1]], code: false });
    i = j;
  }
  return blocks;
}
