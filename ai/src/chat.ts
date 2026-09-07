import type { ChatOptions, ChatResponse } from "./types.js";
import { AiError, extractErrorMessage } from "./errors.js";
import { getAdapter } from "./providers/index.js";

/**
 * Read a Response body as JSON, tolerating empty/invalid bodies.
 * (Error responses are sometimes plain text.)
 */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Send a single, non-streaming chat completion request to the chosen provider
 * and return a normalized {@link ChatResponse}.
 *
 * Throws {@link AiError} on any non-2xx response.
 */
export async function chat(opts: ChatOptions): Promise<ChatResponse> {
  const adapter = getAdapter(opts.provider);
  const { url, headers, body } = adapter.buildRequest(opts, false);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new AiError(
      `Network request to ${opts.provider} failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { provider: opts.provider, status: 0, raw: err },
    );
  }

  if (!res.ok) {
    const errBody = await readBody(res);
    throw new AiError(
      extractErrorMessage(
        errBody,
        `${opts.provider} request failed with status ${res.status}`,
      ),
      { provider: opts.provider, status: res.status, raw: errBody },
    );
  }

  const json = await readBody(res);
  return adapter.parseResponse(json, opts.model);
}
