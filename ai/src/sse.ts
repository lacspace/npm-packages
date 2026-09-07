/**
 * Minimal, self-contained SSE (Server-Sent Events) parsing.
 *
 * Only what an LLM streaming endpoint needs: split a byte stream on blank
 * lines into events, and expose the concatenated `data:` payload of each.
 * No dependency on @lacspace/stream or anything else.
 */

/** One parsed SSE event. */
export interface SseEvent {
  /** The `event:` field, if present. */
  event?: string;
  /** The joined `data:` lines (multiple `data:` lines are newline-joined). */
  data: string;
}

/**
 * Turn a `ReadableStream<Uint8Array>` (a `fetch` Response body) into an async
 * iterable of parsed SSE events. Handles chunk boundaries that fall mid-line,
 * `\r\n` and `\n` newlines, and comment lines (starting with `:`).
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Normalize CRLF so we can split on plain "\n\n".
      buffer = buffer.replace(/\r\n/g, "\n");

      let sep: number;
      // An event is terminated by a blank line ("\n\n").
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseEventBlock(rawEvent);
        if (parsed) yield parsed;
      }
    }
    // Flush any trailing event without a terminating blank line.
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n").trim();
    if (buffer) {
      const parsed = parseEventBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEventBlock(block: string): SseEvent | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue; // blank or comment
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // Per spec, a single leading space after the colon is stripped.
    let val = colon === -1 ? "" : line.slice(colon + 1);
    if (val.startsWith(" ")) val = val.slice(1);
    if (field === "data") dataLines.push(val);
    else if (field === "event") event = val;
  }
  if (dataLines.length === 0 && event === undefined) return null;
  return { event, data: dataLines.join("\n") };
}
