/** Provider calls — embeddings and chat, for Ollama and OpenAI-compatible APIs.
 *
 * Every network call goes through an injectable `fetchImpl` (default: global
 * `fetch`), so the whole module is testable with a fake fetch and never
 * requires a running server. No API key is read here — the caller passes one. */

import type { ChatMessage, FetchImpl, Provider } from "./types.js";
import { RagError } from "./types.js";

export interface ProviderOptions {
  /** `"ollama"` (default) or `"openai"` (any OpenAI-compatible endpoint). */
  provider?: Provider;
  /** Base URL. Default `http://localhost:11434` (Ollama). */
  baseUrl?: string;
  /** API key for OpenAI-compatible providers (Ollama ignores it). */
  apiKey?: string;
  /** `fetch` implementation to use. Default: global `fetch`. */
  fetchImpl?: FetchImpl;
}

export interface EmbedOptions extends ProviderOptions {
  /** Embedding model. Default `nomic-embed-text` (Ollama). */
  model?: string;
}

export interface ChatOptions extends ProviderOptions {
  /** Chat model. Default `llama3.2` (Ollama). */
  model?: string;
  /** Sampling temperature (OpenAI + Ollama options). Default provider default. */
  temperature?: number;
}

const DEFAULT_BASE = "http://localhost:11434";

function resolve(opts: ProviderOptions): {
  provider: Provider;
  baseUrl: string;
  fetchImpl: FetchImpl;
  apiKey?: string;
} {
  const provider = opts.provider ?? "ollama";
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchImpl | undefined);
  if (typeof fetchImpl !== "function") {
    throw new RagError("No fetch implementation available. Pass opts.fetchImpl or use Node >= 20.", "config");
  }
  return opts.apiKey !== undefined
    ? { provider, baseUrl, fetchImpl, apiKey: opts.apiKey }
    : { provider, baseUrl, fetchImpl };
}

async function call(
  fetchImpl: FetchImpl,
  url: string,
  body: unknown,
  apiKey: string | undefined,
): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RagError(`Cannot reach ${url} (${msg})`, "connection");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    throw new RagError(`${url} returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`, "http");
  }
  try {
    return await res.json();
  } catch {
    throw new RagError(`${url} returned a non-JSON response`, "shape");
  }
}

/**
 * Embed one or more texts. Returns one vector per input, in order.
 *
 * - OpenAI: single `POST /v1/embeddings` with `input: string[]`.
 * - Ollama: one `POST /api/embeddings` per text (batched sequentially).
 */
export async function embed(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { provider, baseUrl, fetchImpl, apiKey } = resolve(opts);
  const model = opts.model ?? (provider === "openai" ? "text-embedding-3-small" : "nomic-embed-text");

  if (provider === "openai") {
    const json = await call(fetchImpl, `${baseUrl}/v1/embeddings`, { model, input: texts }, apiKey);
    const data = (json as { data?: Array<{ embedding?: number[] }> }).data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new RagError("Embeddings response had an unexpected shape (missing data[])", "shape");
    }
    return data.map((d, i) => {
      const v = d?.embedding;
      if (!Array.isArray(v) || v.length === 0) throw new RagError(`Empty embedding for input ${i}`, "empty");
      return v;
    });
  }

  // Ollama: one request per text.
  const out: number[][] = [];
  for (const text of texts) {
    const json = await call(fetchImpl, `${baseUrl}/api/embeddings`, { model, prompt: text }, apiKey);
    const v = (json as { embedding?: number[] }).embedding;
    if (!Array.isArray(v) || v.length === 0) {
      throw new RagError("Ollama returned an empty embedding (is the embed model pulled?)", "empty");
    }
    out.push(v);
  }
  return out;
}

/** Convenience: embed a single text and return its vector. */
export async function embedOne(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const [v] = await embed([text], opts);
  if (!v) throw new RagError("No embedding returned", "empty");
  return v;
}

/**
 * Run a chat completion and return the assistant's text content.
 *
 * - OpenAI: `POST /v1/chat/completions`, reads `choices[0].message.content`.
 * - Ollama: `POST /api/chat` with `stream: false`, reads `message.content`.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const { provider, baseUrl, fetchImpl, apiKey } = resolve(opts);
  const model = opts.model ?? (provider === "openai" ? "gpt-4o-mini" : "llama3.2");

  if (provider === "openai") {
    const body: Record<string, unknown> = { model, messages };
    if (opts.temperature !== undefined) body["temperature"] = opts.temperature;
    const json = await call(fetchImpl, `${baseUrl}/v1/chat/completions`, body, apiKey);
    const content = (json as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new RagError("Chat response had no choices[0].message.content", "shape");
    return content;
  }

  const body: Record<string, unknown> = { model, messages, stream: false };
  if (opts.temperature !== undefined) body["options"] = { temperature: opts.temperature };
  const json = await call(fetchImpl, `${baseUrl}/api/chat`, body, apiKey);
  const content = (json as { message?: { content?: string } }).message?.content;
  if (typeof content !== "string") throw new RagError("Ollama chat response had no message.content", "shape");
  return content;
}
