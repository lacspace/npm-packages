/**
 * Parse + validate a HAR 1.2 JSON string into a typed {@link Har}.
 * No network or disk here — pure text in, object out.
 */
import type { Har } from "./types.js";

/** Thrown when the input isn't a readable HAR log. */
export class HarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarParseError";
  }
}

/**
 * Parse a `.har` file's text and confirm it's a HAR log. Throws a clear
 * {@link HarParseError} when the JSON is bad or the shape isn't a HAR.
 */
export function parseHar(text: string): Har {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new HarParseError(`Not valid JSON: ${(err as Error).message}`);
  }
  if (json == null || typeof json !== "object" || Array.isArray(json)) {
    throw new HarParseError("Not a HAR file: expected a top-level JSON object.");
  }
  const log = (json as { log?: unknown }).log;
  if (log == null || typeof log !== "object" || Array.isArray(log)) {
    throw new HarParseError('Not a HAR file: missing the top-level "log" object.');
  }
  const entries = (log as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    throw new HarParseError('Not a HAR file: "log.entries" is missing or not an array.');
  }
  // Spot-check the first entry has the request/response shape we rely on.
  if (entries.length > 0) {
    const first = entries[0] as { request?: unknown; response?: unknown };
    if (first == null || typeof first !== "object" || first.request == null || first.response == null) {
      throw new HarParseError('Not a HAR file: entries are missing "request"/"response".');
    }
  }
  return json as Har;
}
