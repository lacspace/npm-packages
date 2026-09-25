/** screenshot_page — a picture of the rendered page, for the model to look at. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "../server";
import { checkUrl } from "../guard";
import { browserAdvice, getBrowser } from "./browser";

export const screenshotPageTool: ToolDefinition<{ url: string; fullPage: boolean; waitFor?: string; scroll: number; waitMs: number; timeoutMs?: number }> = {
  name: "screenshot_page",
  title: "Screenshot a page",
  description:
    "Render a URL in a real browser and return a PNG screenshot the model can look at, plus the page title. Use it to check layout, a visual bug, a chart, or a JavaScript-rendered page that fetch_page cannot read. Viewport (1280×900) by default; fullPage captures the whole scroll height. Needs a local Chromium.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      fullPage: { type: "boolean", default: false, description: "Capture the whole page instead of the first screen. Large pages make large images." },
      waitFor: { type: "string", description: "CSS selector to wait for before capturing." },
      scroll: { type: "integer", minimum: 0, maximum: 20, default: 0, description: "Scroll passes to trigger lazy-loaded content." },
      waitMs: { type: "integer", minimum: 0, maximum: 15_000, default: 500, description: "Extra wait after load, for animations." },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120_000 },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const u = await checkUrl(args.url, ctx.policy);
    let browser;
    try {
      browser = await getBrowser();
    } catch (err) {
      return { text: `screenshot_page is unavailable: ${browserAdvice(err)}`, isError: true };
    }
    const dir = await mkdtemp(join(tmpdir(), "lacspace-mcp-shot-"));
    const file = join(dir, "page.png");
    try {
      const r = await browser.render(u.toString(), { screenshot: file, fullPage: args.fullPage, waitFor: args.waitFor, scroll: args.scroll, waitMs: args.waitMs, timeoutMs: args.timeoutMs ?? ctx.policy.timeoutMs });
      const png = await readFile(file).catch(() => undefined);
      if (!png) return { text: `No screenshot could be taken of ${r.url} (HTTP ${r.status}).`, isError: true };
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(r.html)?.[1]?.trim();
      const kb = Math.round(png.length / 1024);
      return {
        text: `Screenshot of ${r.url} (HTTP ${r.status}${title ? `, "${title}"` : ""}, ${args.fullPage ? "full page" : "viewport 1280×900"}, ${kb} KB PNG)`,
        data: { url: r.url, status: r.status, title, bytes: png.length, fullPage: args.fullPage },
        images: [{ data: png.toString("base64"), mimeType: "image/png" }],
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
