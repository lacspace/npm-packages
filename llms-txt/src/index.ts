/**
 * @lacspace/llms-txt
 * Generate and parse llms.txt and llms-full.txt (the llmstxt.org standard).
 *
 * llms.txt is a Markdown file at your site root that gives LLMs a curated map of
 * your most useful content; llms-full.txt inlines the full text so a model can
 * read everything in one request.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface LlmsLink {
  title: string;
  url: string;
  /** Short note shown after the link. */
  notes?: string;
}

export interface LlmsSection {
  title: string;
  links: LlmsLink[];
}

export interface LlmsDoc {
  /** The site / project name (rendered as the H1). */
  title: string;
  /** One-line summary (rendered as a blockquote). */
  summary?: string;
  /** Free-form Markdown shown before the sections. */
  details?: string;
  sections: LlmsSection[];
}

/**
 * Render an `llms.txt` document.
 * @example
 * llmsTxt({
 *   title: "Lacspace",
 *   summary: "Open-source TypeScript packages and products.",
 *   sections: [{ title: "Docs", links: [{ title: "Packages", url: "https://lacspace.com/packages" }] }],
 * });
 */
export function llmsTxt(doc: LlmsDoc): string {
  const out: string[] = [`# ${doc.title}`];
  if (doc.summary) out.push("", `> ${doc.summary}`);
  if (doc.details) out.push("", doc.details.trim());
  for (const section of doc.sections) {
    out.push("", `## ${section.title}`, "");
    for (const l of section.links) {
      out.push(`- [${l.title}](${l.url})${l.notes ? `: ${l.notes}` : ""}`);
    }
  }
  return out.join("\n") + "\n";
}

export interface LlmsFullSection {
  title: string;
  /** Full Markdown content for this section. */
  content: string;
  /** Optional source URL, added as a heading link. */
  url?: string;
}

export interface LlmsFullDoc {
  title: string;
  summary?: string;
  sections: LlmsFullSection[];
}

/** Render an `llms-full.txt` document with the full content inlined. */
export function llmsFullTxt(doc: LlmsFullDoc): string {
  const out: string[] = [`# ${doc.title}`];
  if (doc.summary) out.push("", `> ${doc.summary}`);
  for (const section of doc.sections) {
    out.push("", "---", "", `## ${section.title}`);
    if (section.url) out.push("", `Source: ${section.url}`);
    out.push("", section.content.trim());
  }
  return out.join("\n") + "\n";
}

/** Parse an `llms.txt` string back into a structured document. */
export function parseLlmsTxt(txt: string): LlmsDoc {
  const lines = txt.split(/\r?\n/);
  const doc: LlmsDoc = { title: "", sections: [] };
  let current: LlmsSection | null = null;
  const detailBuf: string[] = [];
  const linkRe = /^-\s*\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*))?$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      doc.title = line.slice(2).trim();
    } else if (line.startsWith("> ")) {
      doc.summary = (doc.summary ? doc.summary + " " : "") + line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), links: [] };
      doc.sections.push(current);
    } else if (current && linkRe.test(line)) {
      const m = line.match(linkRe)!;
      current.links.push({ title: m[1]!, url: m[2]!, notes: m[3]?.trim() || undefined });
    } else if (!current && line && !line.startsWith("#")) {
      detailBuf.push(line);
    }
  }
  const details = detailBuf.join("\n").trim();
  if (details) doc.details = details;
  return doc;
}

/* ------------------------------ from sitemap ------------------------------ */

/** A sitemap-ish entry — accepts `url` or `loc`, plus optional title/section. */
export interface SitemapEntryLike {
  url?: string;
  loc?: string;
  title?: string;
  section?: string;
}

function titleFromUrl(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const seg = path.split("/").filter(Boolean).pop();
  if (!seg) return "Home";
  return decodeURIComponent(seg).replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build an `llms.txt` from a list of sitemap entries — group by `section`,
 * derive titles from the URL when not given. Pairs with `@lacspace/sitemap`.
 */
export function llmsTxtFromSitemap(
  entries: SitemapEntryLike[],
  meta: { title: string; summary?: string; details?: string; defaultSection?: string },
): string {
  const bySection = new Map<string, LlmsLink[]>();
  for (const e of entries) {
    const url = e.url ?? e.loc;
    if (!url) continue;
    const section = e.section ?? meta.defaultSection ?? "Pages";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push({ title: e.title ?? titleFromUrl(url), url });
  }
  const doc: LlmsDoc = {
    title: meta.title,
    summary: meta.summary,
    details: meta.details,
    sections: [...bySection].map(([title, links]) => ({ title, links })),
  };
  return llmsTxt(doc);
}

/* ------------------------------ adapters ------------------------------ */

/** `llms.txt` as a Fetch/edge `Response` (text/plain) for app/llms.txt/route.ts. */
export function llmsTxtResponse(doc: LlmsDoc, init: ResponseInit = {}): Response {
  return new Response(llmsTxt(doc), {
    ...init,
    headers: { "content-type": "text/plain; charset=utf-8", ...(init.headers ?? {}) },
  });
}

/** `llms-full.txt` as a Fetch/edge `Response` (text/plain). */
export function llmsFullTxtResponse(doc: LlmsFullDoc, init: ResponseInit = {}): Response {
  return new Response(llmsFullTxt(doc), {
    ...init,
    headers: { "content-type": "text/plain; charset=utf-8", ...(init.headers ?? {}) },
  });
}
