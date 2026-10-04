import type {
  ChatChunk,
  ChatOptions,
  ChatResponse,
  FinishReason,
  Message,
  Part,
  Tool,
  ToolCall,
  Usage,
} from "../types.js";
import type { SseEvent } from "../sse.js";
import {
  compact,
  parseArgs,
  safeJson,
  type BuiltRequest,
  type ProviderAdapter,
} from "./common.js";

const DEFAULT_BASE = "https://api.openai.com/v1";

function mapFinish(reason: unknown): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    case null:
    case undefined:
      return null;
    default:
      return "other";
  }
}

function partsToOpenAi(parts: Part[]): unknown {
  return parts.map((p) => {
    if (p.type === "text") return { type: "text", text: p.text };
    if ("url" in p) return { type: "image_url", image_url: { url: p.url } };
    return {
      type: "image_url",
      image_url: { url: `data:${p.mimeType};base64,${p.data}` },
    };
  });
}

function messagesToOpenAi(messages: Message[]): unknown[] {
  return messages.map((m) => {
    const content =
      typeof m.content === "string" ? m.content : partsToOpenAi(m.content);
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: typeof m.content === "string" ? m.content : content,
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      return compact({
        role: "assistant",
        content: m.content ? content : null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.argsRaw || JSON.stringify(tc.args) },
        })),
      });
    }
    return compact({ role: m.role, content, name: m.name });
  });
}

function toolsToOpenAi(tools: Tool[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: compact({
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object", properties: {} },
    }),
  }));
}

/** Normalize an OpenAI-style usage block, including reasoning tokens when reported. */
function openAiUsage(u: Record<string, any>): Usage {
  const r = u.completion_tokens_details?.reasoning_tokens ?? u.reasoning_tokens;
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    ...(typeof r === "number" && r > 0 ? { reasoningTokens: r } : {}),
  };
}

/** True when usage shows the output was (almost) entirely reasoning. */
function reasoningFilledBudget(u?: Usage): boolean {
  return !!u && !!u.reasoningTokens && u.reasoningTokens >= u.outputTokens - 1;
}

export function makeOpenAiAdapter(providerName: "openai" | "openai-compatible"): ProviderAdapter {
  return {
    buildRequest(opts: ChatOptions, stream: boolean): BuiltRequest {
      const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
      const url = `${base}/chat/completions`;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        ...(opts.headers ?? {}),
      };
      const body = compact({
        model: opts.model,
        messages: messagesToOpenAi(opts.messages),
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        top_p: opts.topP,
        stop: opts.stop,
        tools: opts.tools?.length ? toolsToOpenAi(opts.tools) : undefined,
        stream: stream || undefined,
        stream_options: stream ? { include_usage: true } : undefined,
      });
      return { url, headers, body };
    },

    parseResponse(json: unknown, model: string): ChatResponse {
      const j = (json ?? {}) as Record<string, any>;
      const choice = j.choices?.[0] ?? {};
      const msg = choice.message ?? {};
      const text = typeof msg.content === "string" ? msg.content : "";
      const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls)
        ? msg.tool_calls.map((tc: any) => {
            const { args, argsRaw } = parseArgs(tc?.function?.arguments);
            return {
              id: tc?.id ?? "",
              name: tc?.function?.name ?? "",
              args,
              argsRaw,
            };
          })
        : [];
      const usage = j.usage ? openAiUsage(j.usage) : undefined;
      const reasoning =
        typeof msg.reasoning === "string" ? msg.reasoning
        : typeof msg.reasoning_content === "string" ? msg.reasoning_content
        : undefined;
      let finishReason = mapFinish(choice.finish_reason);
      // Reasoning models can spend the whole budget thinking and return "" with
      // finish "stop" on some hosts; report it as "length" so callers can retry bigger.
      if (!text && !toolCalls.length && reasoning && finishReason === "stop" && reasoningFilledBudget(usage)) finishReason = "length";
      return {
        text,
        toolCalls,
        finishReason,
        usage,
        model: j.model ?? model,
        raw: json,
        ...(reasoning ? { reasoning } : {}),
      };
    },

    createStreamDecoder() {
      return (event: SseEvent): ChatChunk[] => {
        const j = safeJson(event.data) as Record<string, any> | null;
        if (!j) {
          // `[DONE]` sentinel — nothing to emit; done chunk comes from usage/finish.
          if (event.data.trim() === "[DONE]") return [{ type: "done" }];
          return [];
        }
        const out: ChatChunk[] = [];
        const choice = j.choices?.[0];
        if (choice) {
          const delta = choice.delta ?? {};
          if (typeof delta.content === "string" && delta.content) {
            out.push({ type: "text", delta: delta.content });
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              out.push({
                type: "tool_call",
                index: tc.index ?? 0,
                id: tc.id,
                name: tc.function?.name,
                argsDelta: tc.function?.arguments,
              });
            }
          }
          if (choice.finish_reason) {
            out.push({
              type: "done",
              finishReason: mapFinish(choice.finish_reason),
              usage: j.usage ? openAiUsage(j.usage) : undefined,
            });
          }
        } else if (j.usage) {
          // Final usage-only chunk (stream_options.include_usage).
          out.push({
            type: "done",
            usage: openAiUsage(j.usage),
          });
        }
        return out;
      };
    },
  };
}
