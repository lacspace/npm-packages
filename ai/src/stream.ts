import type {
  ChatChunk,
  ChatOptions,
  FetchLike,
  FinishReason,
  ToolCall,
  Usage,
} from "./types.js";
import { AiError, extractErrorMessage } from "./errors.js";
import { getAdapter } from "./providers/index.js";
import { parseSse } from "./sse.js";
import { parseArgs } from "./providers/common.js";

/**
 * Send a streaming chat request and yield unified {@link ChatChunk}s as tokens
 * arrive. Works across every supported provider; the provider's SSE format is
 * normalized internally.
 *
 * Throws {@link AiError} on a non-2xx response before the stream starts.
 *
 * ```ts
 * for await (const chunk of stream(opts)) {
 *   if (chunk.type === "text") process.stdout.write(chunk.delta);
 * }
 * ```
 */
export async function* stream(
  opts: ChatOptions,
): AsyncGenerator<ChatChunk, void, unknown> {
  const adapter = getAdapter(opts.provider);
  const { url, headers, body } = adapter.buildRequest(opts, true);

  const doFetch: FetchLike = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
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
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }
    throw new AiError(
      extractErrorMessage(
        parsed,
        `${opts.provider} request failed with status ${res.status}`,
      ),
      { provider: opts.provider, status: res.status, raw: parsed },
    );
  }

  if (!res.body) {
    throw new AiError(`${opts.provider} returned no response body to stream`, {
      provider: opts.provider,
      status: res.status,
    });
  }

  const decode = adapter.createStreamDecoder();
  for await (const event of parseSse(res.body)) {
    for (const chunk of decode(event)) {
      yield chunk;
    }
  }
}

/**
 * Collapse a sequence (or async sequence) of {@link ChatChunk}s into the final
 * `{ text, toolCalls, finishReason?, usage? }`, reconstructing streamed tool
 * calls (which arrive as `argsDelta` fragments).
 */
export async function accumulate(
  chunks: Iterable<ChatChunk> | AsyncIterable<ChatChunk>,
): Promise<{
  text: string;
  toolCalls: ToolCall[];
  finishReason?: FinishReason;
  usage?: Usage;
}> {
  let text = "";
  const byIndex = new Map<
    number,
    { id?: string; name?: string; argsRaw: string }
  >();
  const order: number[] = [];
  let finishReason: FinishReason | undefined;
  let usage: Usage | undefined;

  const iterate = async () => {
    for await (const chunk of chunks as AsyncIterable<ChatChunk>) {
      handle(chunk);
    }
  };
  const handle = (chunk: ChatChunk) => {
    if (chunk.type === "text") {
      text += chunk.delta;
    } else if (chunk.type === "tool_call") {
      let slot = byIndex.get(chunk.index);
      if (!slot) {
        slot = { argsRaw: "" };
        byIndex.set(chunk.index, slot);
        order.push(chunk.index);
      }
      if (chunk.id) slot.id = chunk.id;
      if (chunk.name) slot.name = chunk.name;
      if (chunk.argsDelta) slot.argsRaw += chunk.argsDelta;
    } else if (chunk.type === "done") {
      if (chunk.finishReason !== undefined) finishReason = chunk.finishReason;
      if (chunk.usage) usage = chunk.usage;
    }
  };

  await iterate();

  const toolCalls: ToolCall[] = order.map((i) => {
    const slot = byIndex.get(i)!;
    const { args, argsRaw } = parseArgs(slot.argsRaw);
    return { id: slot.id ?? "", name: slot.name ?? "", args, argsRaw };
  });

  return { text, toolCalls, finishReason, usage };
}
