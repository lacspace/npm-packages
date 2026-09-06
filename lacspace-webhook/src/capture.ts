/**
 * The captured-request record + its (de)serialization and body parsing.
 * A record is a plain JSON object so it round-trips through an NDJSON file.
 */

/** A single incoming request captured by the receiver. */
export interface CapturedRequest {
  /** Stable id for this capture (short random hex). */
  id: string;
  /** ISO timestamp of when it arrived. */
  at: string;
  /** HTTP method, upper-cased (GET, POST, …). */
  method: string;
  /** The request path, without the query string (e.g. `/hooks/github`). */
  path: string;
  /** The full original request-target (path + query), e.g. `/x?a=1`. */
  url: string;
  /** Parsed query-string parameters. Repeated keys become arrays. */
  query: Record<string, string | string[]>;
  /** Request headers as received (lower-cased keys). */
  headers: Record<string, string | string[] | undefined>;
  /** The raw request body, verbatim, as a UTF-8 string. */
  body: string;
  /** The `content-type` header value, if any. */
  contentType?: string;
  /** Byte length of the raw body. */
  bytes: number;
}

/** How a body was interpreted for pretty-printing. */
export type ParsedBodyKind = "json" | "form" | "text" | "empty";

/** The result of {@link parseBody}. */
export interface ParsedBody {
  kind: ParsedBodyKind;
  /** For `json` the parsed value; for `form` a params object; for `text` the string. */
  data: unknown;
}

/**
 * Interpret a raw body by its content-type: JSON, form-urlencoded, or text.
 * Falls back to `text` when JSON is declared but does not parse.
 */
export function parseBody(rawBody: string, contentType?: string): ParsedBody {
  if (rawBody.length === 0) return { kind: "empty", data: "" };
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/json") || ct.includes("+json")) {
    try {
      return { kind: "json", data: JSON.parse(rawBody) };
    } catch {
      return { kind: "text", data: rawBody };
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params: Record<string, string | string[]> = {};
    for (const [k, v] of new URLSearchParams(rawBody)) {
      const existing = params[k];
      if (existing === undefined) params[k] = v;
      else if (Array.isArray(existing)) existing.push(v);
      else params[k] = [existing, v];
    }
    return { kind: "form", data: params };
  }
  // No/other content-type: sniff for JSON, else treat as text.
  if (ct === "" || ct.includes("text/")) {
    const trimmed = rawBody.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return { kind: "json", data: JSON.parse(rawBody) };
      } catch {
        /* fall through to text */
      }
    }
  }
  return { kind: "text", data: rawBody };
}

/** Parse a query string (without leading `?`) into a params object. */
export function parseQuery(qs: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!qs) return out;
  for (const [k, v] of new URLSearchParams(qs)) {
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing, v];
  }
  return out;
}

/** Serialize one captured request to a single NDJSON line (no trailing newline). */
export function serializeCapture(record: CapturedRequest): string {
  return JSON.stringify(record);
}

/** Parse one NDJSON line back into a {@link CapturedRequest}. Throws on malformed input. */
export function parseCaptureLine(line: string): CapturedRequest {
  const obj = JSON.parse(line) as Partial<CapturedRequest>;
  if (typeof obj !== "object" || obj === null || typeof obj.method !== "string") {
    throw new Error("Not a valid captured-request record");
  }
  return {
    id: typeof obj.id === "string" ? obj.id : "",
    at: typeof obj.at === "string" ? obj.at : new Date(0).toISOString(),
    method: obj.method,
    path: typeof obj.path === "string" ? obj.path : "/",
    url: typeof obj.url === "string" ? obj.url : (obj.path ?? "/"),
    query: (obj.query as CapturedRequest["query"]) ?? {},
    headers: (obj.headers as CapturedRequest["headers"]) ?? {},
    body: typeof obj.body === "string" ? obj.body : "",
    bytes: typeof obj.bytes === "number" ? obj.bytes : Buffer.byteLength(obj.body ?? "", "utf8"),
    ...(typeof obj.contentType === "string" ? { contentType: obj.contentType } : {}),
  };
}

/** Read all captured records from an NDJSON string (blank lines skipped). */
export function parseCaptureFile(text: string): CapturedRequest[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(parseCaptureLine);
}
