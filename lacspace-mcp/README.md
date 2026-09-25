# lacspace-mcp

**The Lacspace tools for AI agents.** One command gives Claude Code, Claude Desktop, Cursor, VS Code and Windsurf ten read-only tools: fetch, render, screenshot and scrape pages, crawl a site, read PDF/DOCX/PPTX/EPUB, audit SEO, profile a company from its domain, check uptime and TLS, validate an email, find business leads. No API keys. Built on the [Lacspace developer platform](https://developer.lacspace.com).

```sh
claude mcp add lacspace -- npx -y lacspace-mcp
```

Then ask: *"Read https://example.com/pricing and summarise the plans"*, *"Audit the SEO of our landing page"*, *"Is api.acme.com up and when does its certificate expire?"*, *"Extract the tables from ~/reports/q3.pdf"*, *"Find 20 dentists in Berlin with websites"*.

## What's new in 0.2.0

- **Your open folders are readable.** Editors that support MCP roots (Claude Code,
  Cursor, VS Code) tell the server which folders are open; `extract_document` can
  read files under them without `--allow-path`. Still sandboxed: nothing outside
  the roots and allowed paths, symlinks resolved.
- **`screenshot_page`**: a PNG of the rendered page the model can look at. Viewport
  by default, `fullPage` on request. Needs a local Chromium.
- **`fetch_page` `render: true`** loads the page in a headless browser first, for
  content built by JavaScript.
- **Progress while you wait.** `crawl_site` and `find_leads` stream progress to
  clients that ask for it, so the chat shows "12 of 20" instead of a spinner.
- **A question before expensive work.** Crawls over 50 pages and lead searches over
  30 with details ask the user to confirm, in clients that support elicitation.
  Others proceed as before.
- **Output schemas** on `scrape`, `check_site`, `validate_email` and `find_leads`,
  for clients that validate or render structured results.

## What's new in 0.1.1

- `find_leads` opens each listing by default, so phone, website, rating and
  address are filled in (a names-only list needed `details: true` before, which
  contradicted the tool's own description). Review-page links are no longer
  reported as websites. Default `limit` is 10.

## Install in your client

| Client | How |
|---|---|
| Claude Code | `claude mcp add lacspace -- npx -y lacspace-mcp` |
| Claude Desktop | `npx lacspace-mcp config claude-desktop` → paste into `claude_desktop_config.json` |
| Cursor | `npx lacspace-mcp config cursor` → `.cursor/mcp.json` |
| VS Code | `npx lacspace-mcp config vscode` → `.vscode/mcp.json` |
| Windsurf | `npx lacspace-mcp config windsurf` |

The config command prints the exact JSON, including any `--allow-path` / `--block-private` flags you pass to it.

## Tools

| Tool | What it does |
|---|---|
| `fetch_page` | Title, description, canonical, language, headings and text of a page; optionally links, images, tables, Open Graph and JSON-LD. Static HTML, or `render: true` for JavaScript-built pages. |
| `scrape` | Structured records with CSS selectors: `{"name": "h3", "price": ".price \| number", "link": "a@href"}`, repeated over `item`. |
| `crawl_site` | Follow links from a start page (depth, page limit, same-origin, include/exclude) and return each page's text. Streams progress. |
| `screenshot_page` | A PNG of the rendered page for the model to look at: viewport or full page, wait for a selector, scroll for lazy content. Needs a local Chromium. |
| `extract_document` | PDF, DOCX, PPTX, EPUB, HTML, CSV, XLSX, Markdown or text → Markdown, from a local file or a URL. PDF page ranges. |
| `audit_page` | Grade A–F across SEO, social, structured data, content, links, performance heuristics, security headers and crawlability, with a fix per problem. |
| `enrich_domain` | Company profile from a domain: name, description, logo, emails, phones, address, socials, tech stack, MX/SPF/DMARC, RDAP registration. |
| `check_site` | Status, redirect chain, response time, server and caching headers, TLS issuer/expiry/days left. |
| `validate_email` | Syntax, disposable, role account, free provider, typo suggestion, normalised form, MX lookup. No email is sent. |
| `find_leads` | Google Maps businesses by type and city: rating, reviews, address, phone, website, and email/socials when listed. Needs a local Chromium (`npx playwright install chromium`); about 30 s per 10 leads, or `details: false` for a names-only list in seconds. |

Every tool returns readable text for the model and `structuredContent` (JSON) for programs. Long output is capped (`maxChars`) and says when it was cut.

`npx lacspace-mcp list` prints every tool with its inputs.

## Safety switches

- **Files.** `extract_document` reads local files only under the folders your editor has open (MCP roots), the working directory, and any `--allow-path <dir>` (repeatable, or `LACSPACE_MCP_ALLOW_PATH=/a:/b`). Symlinks are resolved first, so a link pointing outside is refused.
- **Private networks.** `--block-private` (or `LACSPACE_MCP_BLOCK_PRIVATE=1`) refuses fetching localhost, private, link-local and unique-local addresses in any spelling, and cloud metadata endpoints. Off by default because reading your own `localhost:3000` is the common case in development; turn it on for shared or hosted setups.
- **Fewer tools.** `--only fetch_page,check_site` or `--disable find_leads`.
- **Read-only.** Every tool is annotated `readOnlyHint`; nothing writes, posts or sends.

## Run a tool from the terminal

The same tools work without an agent, which is also how to debug them:

```sh
npx lacspace-mcp call check_site '{"url":"https://developer.lacspace.com"}'
npx lacspace-mcp call fetch_page '{"url":"https://example.com","include":["links"]}'
npx lacspace-mcp call extract_document '{"source":"./report.pdf","pages":"1-3"}'
```

Exit code 0 on success, 1 when the tool reports an error, 2 for bad arguments. When stdout is not a terminal the JSON `structuredContent` follows the text.

## Use it as a library

```ts
import { createServer, serveStdio, type ToolDefinition } from "lacspace-mcp";

const myTool: ToolDefinition<{ id: string }> = {
  name: "get_order",
  description: "Look up an order by id.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  annotations: { readOnlyHint: true },
  run: async ({ id }) => ({ text: `Order ${id}: shipped`, data: { id, status: "shipped" } }),
};

const server = createServer({ policy: { blockPrivate: true }, extraTools: [myTool] });
await serveStdio(server);
```

`createServer` also takes `only`, `disable` and `deps` (inject implementations for tests). `McpServer` itself is transport-agnostic: `handleMessage(json)` returns the JSON-RPC response, so it can sit behind any transport.

## How it works

MCP over stdio is JSON-RPC 2.0, one message per line. This package implements the protocol itself (about 300 lines) rather than shipping an SDK at runtime, and speaks protocol versions 2025-06-18, 2025-03-26 and 2024-11-05. The interoperability tests drive the built server with the official `@modelcontextprotocol/sdk` client, the same code path Claude Code and Cursor use, and the tool tests run against a local fixture site and files. Tool failures come back as `isError` results the model can read; protocol errors are reserved for malformed requests, unknown tools and arguments that fail the tool's JSON Schema.

Diagnostics go to stderr only; stdout carries protocol. `--verbose` logs each call.

## Honest limitations

- `scrape`, `crawl_site` and `audit_page` read served HTML; content rendered only by client-side JavaScript is not visible to them. `fetch_page` with `render: true` and `screenshot_page` use a real browser and need a local Chromium.
- `find_leads` drives a real browser against Google Maps: it is slow, and Google can change its markup.
- `audit_page` is a static, heuristic audit, not a Lighthouse or Core Web Vitals run.
- No `resources` or `prompts` capability yet, and stdio only; Streamable HTTP for hosted use is planned.
- Progress and the confirmation question depend on the client: clients that pass a progress token see progress, clients with elicitation get asked; others get the plain result.

## Please use responsibly

These tools fetch other people's sites. Respect each site's Terms and robots policy, keep volumes modest, and keep `--block-private` on anywhere a stranger could choose the URL.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
