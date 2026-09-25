# lacspace-mcp — plan

**Goal.** One command that puts the Lacspace tools in front of AI agents (Claude Code,
Claude Desktop, Cursor, VS Code, Windsurf) through the Model Context Protocol:

    claude mcp add lacspace -- npx -y lacspace-mcp

**Scope of 0.1.0.** stdio transport (what every local client uses), the `tools`
capability, nine tools. No resources or prompts yet; Streamable HTTP later.

## Decisions

- **Own protocol implementation, no SDK at runtime.** MCP over stdio is JSON-RPC 2.0,
  one message per line. The server is ~300 lines and keeps the tool zero-dependency
  beyond our own packages. The official `@modelcontextprotocol/sdk` is a *dev*
  dependency only, used as the interoperability oracle in the end-to-end tests.
- **Protocol versions** 2025-06-18, 2025-03-26 and 2024-11-05. A client's version is
  echoed when supported, else the newest is offered (per spec). JSON-RPC batches
  (2025-03-26 only) are accepted and answered as a batch.
- **Tool errors are results, not protocol errors.** A tool that fails returns
  `isError: true` with a readable message, so the model can recover. Protocol
  errors (-32700/-32600/-32601/-32602) are reserved for malformed requests,
  unknown methods, unknown tools and arguments that fail the tool's input schema.
- **Every tool returns text for the model and `structuredContent` for programs.**
  Text is capped (`maxChars`, default 20 000) and says when it was cut.
- **Safety defaults for a tool that fetches and reads.**
  - `extract_document` reads local files only under allowed roots (default: the
    working directory; `--allow-path` adds more; symlink escapes are resolved and
    refused). URLs are downloaded to a temp file and deleted afterwards.
  - `--block-private` refuses fetching private/loopback/link-local targets and
    cloud metadata addresses (via `@lacspace/webhooks`' SSRF guard). Off by
    default because local development against `localhost` is the common case.
  - `--only a,b` / `--disable c` restrict which tools a client can see.
- **`find_leads` loads `lacspace-leads` lazily.** It needs a Chromium; when none is
  present the tool returns a clear `isError` with the install step instead of the
  server failing to start.

## Tools

| tool | wraps | read-only |
|---|---|---|
| `fetch_page` | lacspace-scraper `fetchPage` + auto extraction | yes |
| `scrape` | lacspace-scraper `scrape` with a CSS schema | yes |
| `crawl_site` | lacspace-scraper `crawl` | yes |
| `extract_document` | lacspace-extract `extractFile` (PDF/DOCX/PPTX/EPUB/HTML/CSV/XLSX) | yes |
| `audit_page` | lacspace-inspect `inspectUrl` (SEO/social/structured/security, graded, with fixes) | yes |
| `enrich_domain` | lacspace-enrich `enrichDomain` (DNS/MX/SPF/DMARC, RDAP, tech, socials) | yes |
| `check_site` | status, response time, redirects, TLS certificate expiry | yes |
| `validate_email` | @lacspace/email-validate + email-verify MX | yes |
| `find_leads` | lacspace-leads `scrapeLeads` | yes |

## Testing

1. **Unit** — JSON-RPC framing (split chunks, several messages per chunk, blank lines,
   parse errors answered with `id: null`, notifications never answered), the JSON
   Schema validator, protocol handlers (version negotiation, list shape, -32602 on
   bad arguments, `isError` on tool failure).
2. **Tools** — against a local HTTP fixture site (pages, robots.txt, sitemap) and
   local files; path allow-list and SSRF refusals; `find_leads` with an injected
   implementation for both the success and the missing-browser paths.
3. **Interoperability** — the official MCP SDK `Client` over `StdioClientTransport`
   spawns the built `dist/cli.js`: initialize, list tools, call tools, and receive
   the spec'd errors for a bad tool name and bad arguments.
4. **Release** — the usual: build → test → publish from CI with provenance;
   verify from a clean `npx` install.
