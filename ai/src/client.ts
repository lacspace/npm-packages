import type {
  ChatChunk,
  ChatOptions,
  ChatResponse,
  ClientCallOptions,
  ClientConfig,
} from "./types.js";
import { chat } from "./chat.js";
import { stream } from "./stream.js";

/** A provider/key-bound client returned by {@link createClient}. */
export interface AiClient {
  chat(opts: ClientCallOptions): Promise<ChatResponse>;
  stream(opts: ClientCallOptions): AsyncGenerator<ChatChunk, void, unknown>;
  readonly config: ClientConfig;
}

/**
 * Bind a provider, API key, base URL and default model once, then call
 * `chat` / `stream` with only `messages` (plus any per-call overrides).
 *
 * ```ts
 * const ai = createClient({
 *   provider: "openai",
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: "gpt-4o-mini",
 * });
 * const res = await ai.chat({ messages: [{ role: "user", content: "Hi" }] });
 * ```
 */
export function createClient(config: ClientConfig): AiClient {
  const resolve = (opts: ClientCallOptions): ChatOptions => {
    const model = opts.model ?? config.defaultModel;
    if (!model) {
      throw new Error(
        "createClient: no model given — pass `model` or set `defaultModel`.",
      );
    }
    return {
      ...opts,
      model,
      provider: config.provider,
      apiKey: opts.apiKey ?? config.apiKey,
      baseUrl: opts.baseUrl ?? config.baseUrl,
      headers: { ...(config.headers ?? {}), ...(opts.headers ?? {}) },
    };
  };

  return {
    config,
    chat: (opts) => chat(resolve(opts)),
    stream: (opts) => stream(resolve(opts)),
  };
}
