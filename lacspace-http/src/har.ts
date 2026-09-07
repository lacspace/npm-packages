/**
 * HAR 1.2 export. {@link toHar} turns a list of sent request/response pairs into
 * a valid HAR (HTTP Archive) log that can be opened in Chrome DevTools, Charles,
 * Insomnia, Postman, or any HAR viewer. It is a pure function — it does no I/O —
 * so its shape is trivially unit-testable and the CLI just writes the JSON.
 */
import type { RequestSpec, ResponseRecord } from "./request.js";

/** One request/response pair to record in the HAR log. */
export interface HarEntryInput {
  spec: RequestSpec;
  response: ResponseRecord;
  /** ISO-8601 start time; defaults to now at build time. */
  startedDateTime?: string;
}

/** A HAR name/value pair (headers, query, cookies). */
export interface HarNameValue {
  name: string;
  value: string;
}

/** The HAR entry object (subset of the spec we populate). */
export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: HarNameValue[];
    headers: HarNameValue[];
    queryString: HarNameValue[];
    headersSize: number;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: HarNameValue[];
    headers: HarNameValue[];
    content: { size: number; mimeType: string; text: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

/** A complete HAR 1.2 document. */
export interface HarLog {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

/** Options for {@link toHar}. */
export interface HarOptions {
  creatorName?: string;
  creatorVersion?: string;
}

function byteLen(s: string | undefined): number {
  return s === undefined ? 0 : Buffer.byteLength(s, "utf8");
}

function headerPairs(headers: Array<[string, string]>): HarNameValue[] {
  return headers.map(([name, value]) => ({ name, value }));
}

function headerObject(headers: Record<string, string>): HarNameValue[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function queryString(url: string): HarNameValue[] {
  try {
    const u = new URL(url);
    const out: HarNameValue[] = [];
    u.searchParams.forEach((value, name) => out.push({ name, value }));
    return out;
  } catch {
    return [];
  }
}

function contentTypeOf(spec: RequestSpec): string {
  const h = spec.headers.find(([k]) => k.toLowerCase() === "content-type");
  return h?.[1] ?? "application/octet-stream";
}

/** Build a HAR entry from one request/response pair. Pure. */
export function toHarEntry(input: HarEntryInput): HarEntry {
  const { spec, response } = input;
  const startedDateTime = input.startedDateTime ?? new Date().toISOString();
  const respMime = response.headers["content-type"] ?? "";
  const entry: HarEntry = {
    startedDateTime,
    time: response.timeMs,
    request: {
      method: spec.method,
      url: spec.url,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: headerPairs(spec.headers),
      queryString: queryString(spec.url),
      headersSize: -1,
      bodySize: byteLen(spec.body),
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: headerObject(response.headers),
      content: {
        size: response.size,
        mimeType: respMime,
        text: response.body,
      },
      redirectURL: response.headers["location"] ?? "",
      headersSize: -1,
      bodySize: response.size,
    },
    cache: {},
    timings: { send: 0, wait: response.timeMs, receive: 0 },
  };
  if (spec.body !== undefined) {
    entry.request.postData = { mimeType: contentTypeOf(spec), text: spec.body };
  }
  return entry;
}

/** Build a full HAR 1.2 log from a list of request/response pairs. Pure. */
export function toHar(entries: HarEntryInput[], opts: HarOptions = {}): HarLog {
  return {
    log: {
      version: "1.2",
      creator: {
        name: opts.creatorName ?? "lacspace-http",
        version: opts.creatorVersion ?? "0.2.0",
      },
      entries: entries.map(toHarEntry),
    },
  };
}
