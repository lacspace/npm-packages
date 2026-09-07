/**
 * Build `llms.txt` and `llms-full.txt` from a set of pages (title + url +
 * full Markdown content) — e.g. your rendered routes or docs.
 *
 * Zero dependencies · isomorphic.
 */

import type { LlmsDoc, LlmsLink, LlmsFullDoc, LlmsTxtOptions } from "./index";
import { llmsTxt, llmsFullTxt } from "./index";

/** A single page: a link in `llms.txt` and a full section in `llms-full.txt`. */
export interface LlmsPage {
  title: string;
  /** Canonical URL. Pages without a `url` are inlined into `llms-full.txt` only. */
  url?: string;
  /** Full Markdown content for `llms-full.txt`. */
  content: string;
  /** Short note shown after the link in `llms.txt`. */
  notes?: string;
  /** Section heading to group under in `llms.txt`. Defaults to `defaultSection`. */
  section?: string;
  /** Route the page into the special `## Optional` block (links an LLM may skip). */
  optional?: boolean;
}

/** Meta / options for the page-based builders. */
export interface PagesToLlmsMeta extends LlmsTxtOptions {
  title: string;
  summary?: string;
  details?: string;
  /** Section name for pages with no `section`. Default `"Docs"`. */
  defaultSection?: string;
}

/** Group pages into an {@link LlmsDoc} (links grouped by section + Optional block). */
function pagesToDoc(pages: LlmsPage[], meta: PagesToLlmsMeta): LlmsDoc {
  const bySection = new Map<string, LlmsLink[]>();
  const order: string[] = [];
  const optional: LlmsLink[] = [];
  for (const p of pages) {
    if (!p.url) continue; // no URL → full-text only, not a link
    const link: LlmsLink = { title: p.title, url: p.url, notes: p.notes };
    if (p.optional) {
      optional.push(link);
      continue;
    }
    const section = p.section ?? meta.defaultSection ?? "Docs";
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push(link);
  }
  const doc: LlmsDoc = {
    title: meta.title,
    summary: meta.summary,
    details: meta.details,
    sections: order.map((title) => ({ title, links: bySection.get(title)! })),
  };
  if (optional.length) doc.optional = optional;
  return doc;
}

/**
 * Build the compact `llms.txt` from pages — a link per page (with `url`),
 * grouped by `section` (first-seen order preserved), and `optional` pages under
 * the `## Optional` block.
 */
export function llmsTxtFromPages(pages: LlmsPage[], meta: PagesToLlmsMeta): string {
  return llmsTxt(pagesToDoc(pages, meta), { sort: meta.sort, escape: meta.escape });
}

/**
 * Build the expanded `llms-full.txt` from pages — every page's full Markdown
 * `content` inlined, in the given order, each with a `Source:` line when a `url`
 * is present.
 */
export function llmsFullTxtFromPages(
  pages: LlmsPage[],
  meta: { title: string; summary?: string },
): string {
  const doc: LlmsFullDoc = {
    title: meta.title,
    summary: meta.summary,
    sections: pages.map((p) => ({ title: p.title, content: p.content, url: p.url })),
  };
  return llmsFullTxt(doc);
}

/**
 * Build BOTH files from one page list in a single call. Serve `txt` at
 * `/llms.txt` and `full` at `/llms-full.txt`.
 * @example
 * const { txt, full } = llmsFromPages(pages, { title: "Acme" });
 */
export function llmsFromPages(
  pages: LlmsPage[],
  meta: PagesToLlmsMeta,
): { txt: string; full: string } {
  return {
    txt: llmsTxtFromPages(pages, meta),
    full: llmsFullTxtFromPages(pages, { title: meta.title, summary: meta.summary }),
  };
}
