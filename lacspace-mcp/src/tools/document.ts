/** extract_document — lacspace-extract. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { extractFile, toMarkdown } from "lacspace-extract";
import type { ToolDefinition } from "../server";
import { checkPath, checkUrl } from "../guard";
import { clip, lines } from "../format";

const BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/epub+zip": ".epub",
  "text/html": ".html",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

export const extractDocumentTool: ToolDefinition<{
  source: string; pages?: string; tables: boolean; maxChars: number;
}> = {
  name: "extract_document",
  title: "Extract text from a document",
  description:
    "Read a PDF, DOCX, PPTX, EPUB, HTML, CSV, XLSX, Markdown or text file and return its content as Markdown, with metadata and (for PDFs) a page count. `source` is a local file path (inside the allowed directories) or an http(s) URL, which is downloaded to a temporary file. For PDFs you can pick pages, e.g. \"1-3,7\".",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Local file path or http(s) URL." },
      pages: { type: "string", description: "PDF page range like \"1-5\" or \"2,4,9-\". Default: all." },
      tables: { type: "boolean", default: true, description: "Also detect tables." },
      maxChars: { type: "integer", minimum: 500, maximum: 500_000, default: 30_000 },
    },
    required: ["source"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    let file: string;
    let tmp: string | undefined;
    if (/^https?:\/\//i.test(args.source)) {
      const u = await checkUrl(args.source, ctx.policy);
      const res = await fetch(u, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(ctx.policy.timeoutMs)]), redirect: "follow" });
      if (!res.ok) return { text: `HTTP ${res.status} downloading ${u}`, isError: true };
      const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const ext = extname(new URL(u).pathname).toLowerCase() || BY_TYPE[type] || ".html";
      tmp = await mkdtemp(join(tmpdir(), "lacspace-mcp-"));
      file = join(tmp, (basename(new URL(u).pathname) || "document").replace(/[^\w.-]+/g, "_").replace(/\.[^.]*$/, "") + ext);
      await writeFile(file, new Uint8Array(await res.arrayBuffer()));
    } else {
      file = await checkPath(args.source, ctx.policy);
    }
    try {
      const result = await extractFile(file, { text: true, meta: true, tables: args.tables, pages: args.pages });
      if (result.encrypted) return { text: `${args.source} is an encrypted PDF; its text cannot be read.`, data: { source: args.source, encrypted: true }, isError: true };
      const markdown = toMarkdown(result);
      const body = clip(markdown, args.maxChars);
      const head = lines([["Source", args.source], ["Kind", result.kind], ["Pages", result.pageCount], ["Tables", result.tables?.length]]);
      const metaText = result.meta && Object.keys(result.meta).length ? "\n" + lines(Object.entries(result.meta)) : "";
      return {
        text: `${head}${metaText}\n\n${body.text}`,
        data: { source: args.source, kind: result.kind, pageCount: result.pageCount, meta: result.meta, tables: result.tables, markdown: body.text, truncated: body.truncated, chars: markdown.length },
      };
    } finally {
      if (tmp) await rm(tmp, { recursive: true, force: true });
    }
  },
};
