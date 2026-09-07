import type {
  ChatChunk,
  ChatOptions,
  ChatResponse,
  FinishReason,
  Message,
  Part,
  Tool,
  ToolCall,
} from "../types.js";
import type { SseEvent } from "../sse.js";
import {
  compact,
  contentToText,
  safeJson,
  toStopArray,
  type BuiltRequest,
  type ProviderAdapter,
} from "./common.js";

const DEFAULT_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

function mapStopReason(reason: unknown): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case null:
    case undefined:
      return null;
    default:
      return "other";
  }
}

function partsToAnthropic(parts: Part[]): unknown[] {
  return parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if ("url" in p) {
      return { type: "image", source: { type: "url", url: p.url } };
    }
    return {
      type: "image",
      source: { type: "base64", media_type: p.mimeType, data: p.data },
    };
  });
}

/** Anthropic has no system role and no tool role — fold them in. */
function messagesToAnthropic(messages: Message[]): {
  system?: string;
  messages: unknown[];
} {
  const systemParts: string[] = [];
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(contentToText(m.content));
      continue;
    }
    if (m.role === "tool") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: contentToText(m.content),
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      const blocks: unknown[] = [];
      const text = contentToText(m.content);
      if (text) blocks.push({ type: "text", text });
      for (const tc of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.args,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }
    const content =
      typeof m.content === "string" ? m.content : partsToAnthropic(m.content);
    out.push({ role: m.role, content });
  }
  return {
    system: systemParts.length ? systemParts.join("\n\n") : undefined,
    messages: out,
  };
}

function toolsToAnthropic(tools: Tool[]): unknown[] {
  return tools.map((t) =>
    compact({
      name: t.name,
      description: t.description,
      input_schema: t.parameters ?? { type: "object", properties: {} },
    }),
  );
}

export const anthropicAdapter: ProviderAdapter = {
  buildRequest(opts: ChatOptions, stream: boolean): BuiltRequest {
    const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const url = `${base}/messages`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      ...(opts.apiKey ? { "x-api-key": opts.apiKey } : {}),
      ...(opts.headers ?? {}),
    };
    const { system, messages } = messagesToAnthropic(opts.messages);
    const body = compact({
      model: opts.model,
      system,
      messages,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature,
      top_p: opts.topP,
      stop_sequences: toStopArray(opts.stop),
      tools: opts.tools?.length ? toolsToAnthropic(opts.tools) : undefined,
      stream: stream || undefined,
    });
    return { url, headers, body };
  },

  parseResponse(json: unknown, model: string): ChatResponse {
    const j = (json ?? {}) as Record<string, any>;
    const blocks: any[] = Array.isArray(j.content) ? j.content : [];
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const b of blocks) {
      if (b?.type === "text") text += b.text ?? "";
      else if (b?.type === "tool_use") {
        const args = (b.input ?? {}) as Record<string, unknown>;
        toolCalls.push({
          id: b.id ?? "",
          name: b.name ?? "",
          args,
          argsRaw: JSON.stringify(args),
        });
      }
    }
    const usage = j.usage
      ? {
          inputTokens: j.usage.input_tokens ?? 0,
          outputTokens: j.usage.output_tokens ?? 0,
        }
      : undefined;
    return {
      text,
      toolCalls,
      finishReason: mapStopReason(j.stop_reason),
      usage,
      model: j.model ?? model,
      raw: json,
    };
  },

  createStreamDecoder() {
    // Anthropic keys tool calls by content-block index; track name/id per index.
    let inputTokens = 0;
    return (event: SseEvent): ChatChunk[] => {
      const j = safeJson(event.data) as Record<string, any> | null;
      if (!j) return [];
      const type = j.type as string | undefined;
      const out: ChatChunk[] = [];
      switch (type) {
        case "message_start": {
          inputTokens = j.message?.usage?.input_tokens ?? 0;
          break;
        }
        case "content_block_start": {
          const block = j.content_block;
          if (block?.type === "tool_use") {
            out.push({
              type: "tool_call",
              index: j.index ?? 0,
              id: block.id,
              name: block.name,
            });
          }
          break;
        }
        case "content_block_delta": {
          const delta = j.delta ?? {};
          if (delta.type === "text_delta" && delta.text) {
            out.push({ type: "text", delta: delta.text });
          } else if (delta.type === "input_json_delta") {
            out.push({
              type: "tool_call",
              index: j.index ?? 0,
              argsDelta: delta.partial_json ?? "",
            });
          }
          break;
        }
        case "message_delta": {
          out.push({
            type: "done",
            finishReason: mapStopReason(j.delta?.stop_reason),
            usage: {
              inputTokens,
              outputTokens: j.usage?.output_tokens ?? 0,
            },
          });
          break;
        }
        default:
          break;
      }
      return out;
    };
  },
};
