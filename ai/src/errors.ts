import type { Provider } from "./types.js";

/**
 * Error thrown when a provider returns a non-2xx response, or when a request
 * cannot be built (e.g. a missing API key). Carries the HTTP status and the
 * provider's own error message where available.
 */
export class AiError extends Error {
  readonly name = "AiError";
  /** HTTP status code, or 0 for client-side / pre-flight errors. */
  readonly status: number;
  readonly provider: Provider;
  /** The raw error body from the provider, if any. */
  readonly raw?: unknown;

  constructor(
    message: string,
    opts: { status?: number; provider: Provider; raw?: unknown },
  ) {
    super(message);
    this.status = opts.status ?? 0;
    this.provider = opts.provider;
    this.raw = opts.raw;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, AiError.prototype);
  }
}

/**
 * Best-effort extraction of a human-readable message from a provider's error
 * body. Handles OpenAI (`{error:{message}}`), Anthropic (`{error:{message}}`),
 * Google (`{error:{message}}`) and plain strings.
 */
export function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    const err = (body as Record<string, unknown>)["error"];
    if (typeof err === "string" && err) return err;
    if (err && typeof err === "object") {
      const msg = (err as Record<string, unknown>)["message"];
      if (typeof msg === "string" && msg) return msg;
    }
    const msg = (body as Record<string, unknown>)["message"];
    if (typeof msg === "string" && msg) return msg;
  }
  return fallback;
}
