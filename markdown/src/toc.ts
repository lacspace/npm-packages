/**
 * Heading anchors + table of contents.
 *
 * `slugifyHeading` produces GitHub-style anchor slugs (unicode-aware) and
 * `tableOfContents` walks a document's headings into a nested tree of
 * `{ level, text, slug, children }` — the shape a sidebar/TOC component wants.
 *
 * Slugs are DETERMINISTIC for a given document: within one call to
 * `tableOfContents` duplicate headings are disambiguated the way GitHub does,
 * by appending `-1`, `-2`, … in document order.
 *
 * Zero dependencies · isomorphic.
 */

import { parseFrontmatter } from "./frontmatter";

/**
 * GitHub-style heading slug: lowercase, drop HTML tags, remove punctuation that
 * isn't a letter/number/space/hyphen (keeping unicode letters), and turn runs of
 * whitespace into single hyphens.
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A node in the {@link tableOfContents} tree. */
export interface TocNode {
  /** Heading level, 1–6. */
  level: number;
  /** The heading's rendered text. */
  text: string;
  /** The anchor slug (unique within the document). */
  slug: string;
  /** Nested headings of a deeper level. */
  children: TocNode[];
}

/** Options for {@link tableOfContents}. */
export interface TocOptions {
  /** Lowest heading level to include (inclusive). Default `1`. */
  minLevel?: number;
  /** Highest heading level to include (inclusive). Default `6`. */
  maxLevel?: number;
}

/** Scan a document for ATX headings, honouring code fences and frontmatter. */
function scanHeadings(src: string): Array<{ level: number; text: string }> {
  const { content } = parseFrontmatter(src);
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const out: Array<{ level: number; text: string }> = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1]!.length, text: m[2]!.trim() });
  }
  return out;
}

/**
 * Build a nested table of contents from a Markdown document. Frontmatter and
 * fenced code are ignored; slugs are unique and deterministic.
 */
export function tableOfContents(src: string, options: TocOptions = {}): TocNode[] {
  const minLevel = options.minLevel ?? 1;
  const maxLevel = options.maxLevel ?? 6;

  const used = new Map<string, number>();
  const uniqueSlug = (text: string): string => {
    const base = slugifyHeading(text);
    const seen = used.get(base);
    if (seen === undefined) {
      used.set(base, 0);
      return base;
    }
    const next = seen + 1;
    used.set(base, next);
    return `${base}-${next}`;
  };

  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const h of scanHeadings(src)) {
    if (h.level < minLevel || h.level > maxLevel) continue;
    const node: TocNode = { level: h.level, text: h.text, slug: uniqueSlug(h.text), children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= h.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return roots;
}
