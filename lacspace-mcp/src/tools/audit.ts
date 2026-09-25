/** audit_page — lacspace-inspect. */
import { formatMarkdown, inspectUrl } from "lacspace-inspect";
import type { ToolDefinition } from "../server";
import { checkUrl } from "../guard";
import { clip } from "../format";

export const auditPageTool: ToolDefinition<{ url: string; checkLinks: boolean; verbose: boolean; timeoutMs?: number }> = {
  name: "audit_page",
  title: "Audit a page (SEO, social, structured data, security)",
  description:
    "Grade a page A–F across SEO, social sharing, structured data, content, links, performance heuristics, security headers and crawlability (robots.txt, sitemap), with a concrete fix for every warning and failure. Static analysis of the served HTML; not a Lighthouse run. Use it when asked why a page ranks or shares poorly, or before shipping a landing page.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      checkLinks: { type: "boolean", default: false, description: "Also probe the page's links for broken ones (slower)." },
      verbose: { type: "boolean", default: false, description: "Include passing checks, not only problems." },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120_000 },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const u = await checkUrl(args.url, ctx.policy);
    const report = await inspectUrl(u.toString(), { checkLinks: args.checkLinks, timeout: args.timeoutMs ?? ctx.policy.timeoutMs });
    const text = formatMarkdown(report, args.verbose);
    return { text: clip(text, 60_000).text, data: report as unknown as Record<string, unknown> };
  },
};
