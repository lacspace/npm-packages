/**
 * A tiny grep over extracted text — find matching lines with optional context,
 * so you can locate something in a big PDF/doc without reading it all.
 */

export interface GrepHit {
  /** 1-based line number within the text (or within the page). */
  line: number;
  /** The matching line. */
  text: string;
  /** Context lines before + the matching line + after (in order). */
  context: string[];
  /** 1-based page number, when grepping page-by-page. */
  page?: number;
}

export interface GrepOptions {
  ignoreCase?: boolean;
  /** Lines of context to include on each side (default 0). */
  context?: number;
}

function toRe(pattern: string | RegExp, ignoreCase?: boolean): RegExp {
  if (pattern instanceof RegExp) {
    const flags = ignoreCase && !pattern.flags.includes("i") ? pattern.flags + "i" : pattern.flags;
    return new RegExp(pattern.source, flags);
  }
  return new RegExp(pattern, ignoreCase ? "i" : "");
}

/** Return every line of `text` matching `pattern`, with optional context. */
export function grepText(text: string, pattern: string | RegExp, opts: GrepOptions = {}): GrepHit[] {
  const re = toRe(pattern, opts.ignoreCase);
  const ctx = Math.max(0, opts.context ?? 0);
  const lines = text.split(/\r?\n/);
  const hits: GrepHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]!)) {
      hits.push({
        line: i + 1,
        text: lines[i]!,
        context: lines.slice(Math.max(0, i - ctx), Math.min(lines.length, i + ctx + 1)),
      });
    }
  }
  return hits;
}

/** Grep across page-tagged text blocks, tagging each hit with its page. */
export function grepPages(pages: { page: number; text: string }[], pattern: string | RegExp, opts: GrepOptions = {}): GrepHit[] {
  const out: GrepHit[] = [];
  for (const pg of pages) for (const h of grepText(pg.text, pattern, opts)) out.push({ ...h, page: pg.page });
  return out;
}
