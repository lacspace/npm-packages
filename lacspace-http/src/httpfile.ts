/**
 * A hand-written parser for the well-known `.http` / `.rest` file format (the
 * one VS Code's REST Client and JetBrains HTTP Client use). Requests are
 * separated by `###`, may carry a `# @name` tag, and can declare `# @capture`
 * and `# @assert` directives that turn a file into a runnable API test suite.
 *
 * The parser is intentionally forgiving and does no network work — it only
 * turns text into structured {@link HttpFileRequest} objects.
 */

/** A `# @capture <name> = <source>` directive. `source` is an assertion LHS. */
export interface CaptureDirective {
  name: string;
  source: string;
}

/** A `# @assert <expr>` directive. `expr` is parsed later by the assert engine. */
export interface AssertDirective {
  expr: string;
}

/** One request block parsed out of a `.http` file. */
export interface HttpFileRequest {
  /** `# @name <id>` if present. */
  name?: string;
  method: string;
  url: string;
  /** Header pairs in source order (values may still contain `{{vars}}`). */
  headers: Array<[string, string]>;
  /** Raw request body (may contain `{{vars}}`), or undefined if none. */
  body?: string;
  captures: CaptureDirective[];
  assertions: AssertDirective[];
  /** 1-based line number of the request line, for diagnostics. */
  line: number;
}

const METHODS = new Set([
  "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT",
]);

function isSeparator(line: string): boolean {
  return /^###/.test(line.trim());
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("#") || t.startsWith("//");
}

/** Strip the leading `#`/`//` from a comment line and return the remainder. */
function commentBody(line: string): string {
  const t = line.trim();
  if (t.startsWith("//")) return t.slice(2).trim();
  return t.replace(/^#+/, "").trim();
}

/** Parse the request line: `METHOD url [HTTP/1.1]` (method + version optional). */
function parseRequestLine(line: string): { method: string; url: string } {
  const parts = line.trim().split(/\s+/);
  let method = "GET";
  let rest = parts;
  const first = (parts[0] ?? "").toUpperCase();
  if (METHODS.has(first)) {
    method = first;
    rest = parts.slice(1);
  }
  // Drop a trailing HTTP-version token if present.
  if (rest.length > 1 && /^HTTP\/\d/i.test(rest[rest.length - 1]!)) rest = rest.slice(0, -1);
  const url = rest.join(" ").trim();
  return { method, url };
}

/**
 * Parse a whole `.http` document into an ordered list of requests. Directive
 * comments (`# @name`, `# @capture`, `# @assert`) are extracted; plain comments
 * are ignored.
 */
export function parseHttpFile(source: string): HttpFileRequest[] {
  const rawLines = source.split(/\r?\n/);
  // Split into blocks on `###` separators.
  const blocks: Array<{ start: number; lines: string[] }> = [];
  let current: { start: number; lines: string[] } = { start: 0, lines: [] };
  rawLines.forEach((line, idx) => {
    if (isSeparator(line)) {
      blocks.push(current);
      current = { start: idx + 1, lines: [] };
    } else {
      current.lines.push(line);
    }
  });
  blocks.push(current);

  const requests: HttpFileRequest[] = [];
  for (const block of blocks) {
    const req = parseBlock(block.lines, block.start);
    if (req) requests.push(req);
  }
  return requests;
}

function parseBlock(lines: string[], startLine: number): HttpFileRequest | undefined {
  let name: string | undefined;
  const captures: CaptureDirective[] = [];
  const assertions: AssertDirective[] = [];

  let i = 0;
  // Leading comment / directive lines.
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    if (!isComment(line)) break;
    const body = commentBody(line);
    const at = /^@(\w+)\s*(.*)$/.exec(body);
    if (at) {
      const directive = at[1]!.toLowerCase();
      const arg = at[2]!.trim();
      if (directive === "name") name = arg.replace(/^=?\s*/, "").trim() || undefined;
      else if (directive === "capture") {
        const eq = arg.indexOf("=");
        if (eq !== -1) {
          const cname = arg.slice(0, eq).trim();
          const source = arg.slice(eq + 1).trim();
          if (cname && source) captures.push({ name: cname, source });
        }
      } else if (directive === "assert") {
        if (arg) assertions.push({ expr: arg });
      }
    }
    // other comments ignored
  }

  // The request line.
  for (; i < lines.length; i++) {
    if (lines[i]!.trim() === "") continue;
    break;
  }
  if (i >= lines.length) return undefined;
  const requestLineIdx = i;
  const { method, url: firstUrl } = parseRequestLine(lines[i]!);
  i++;

  // URL continuation lines (indented lines beginning with ? or &).
  let url = firstUrl;
  while (i < lines.length) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (t !== "" && /^[?&]/.test(t) && /^\s/.test(raw)) {
      url += t;
      i++;
    } else break;
  }

  // Headers until a blank line.
  const headers: Array<[string, string]> = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") { i++; break; }
    if (isComment(line)) {
      // Allow interleaved directive comments in the header section too.
      const body = commentBody(line);
      const at = /^@(\w+)\s*(.*)$/.exec(body);
      if (at) {
        const directive = at[1]!.toLowerCase();
        const arg = at[2]!.trim();
        if (directive === "assert" && arg) assertions.push({ expr: arg });
        else if (directive === "capture") {
          const eq = arg.indexOf("=");
          if (eq !== -1) captures.push({ name: arg.slice(0, eq).trim(), source: arg.slice(eq + 1).trim() });
        }
      }
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) headers.push([key, value]);
  }

  // Body: the rest of the block. Directive comments (`# @name/@capture/@assert`)
  // may trail the body — pull those out and keep everything else as the body.
  const bodyLines: string[] = [];
  const directive = /^\s*(?:#+|\/\/)\s*@(name|capture|assert)\b\s*(.*)$/;
  for (const line of lines.slice(i)) {
    const m = directive.exec(line);
    if (m) {
      const kind = m[1]!.toLowerCase();
      const arg = m[2]!.trim();
      if (kind === "name") { if (arg) name = arg.replace(/^=?\s*/, "").trim(); }
      else if (kind === "capture") {
        const eq = arg.indexOf("=");
        if (eq !== -1) {
          const cname = arg.slice(0, eq).trim();
          const source = arg.slice(eq + 1).trim();
          if (cname && source) captures.push({ name: cname, source });
        }
      } else if (kind === "assert" && arg) {
        assertions.push({ expr: arg });
      }
      continue;
    }
    bodyLines.push(line);
  }
  const bodyText = bodyLines.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  const body = bodyText.length > 0 ? bodyText : undefined;

  const req: HttpFileRequest = {
    method,
    url,
    headers,
    captures,
    assertions,
    line: startLine + requestLineIdx + 1,
  };
  if (name !== undefined) req.name = name;
  if (body !== undefined) req.body = body;
  return req;
}
