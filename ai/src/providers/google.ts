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

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

function mapFinish(reason: unknown): FinishReason {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content_filter";
    case null:
    case undefined:
      return null;
    default:
      return "other";
  }
}

function partsToGoogle(parts: Part[]): unknown[] {
  return parts.map((p) => {
    if (p.type === "text") return { text: p.text };
    if ("url" in p) return { fileData: { fileUri: p.url } };
    return { inlineData: { mimeType: p.mimeType, data: p.data } };
  });
}

/** Google uses `systemInstruction` + `contents` (roles "user"/"model"). */
function messagesToGoogle(messages: Message[]): {
  systemInstruction?: { parts: unknown[] };
  contents: unknown[];
} {
  const systemParts: string[] = [];
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(contentToText(m.content));
      continue;
    }
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.name ?? m.toolCallId ?? "tool",
              response: { content: contentToText(m.content) },
            },
          },
        ],
      });
      continue;
    }
    const role = m.role === "assistant" ? "model" : "user";
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      const parts: unknown[] = [];
      const text = contentToText(m.content);
      if (text) parts.push({ text });
      for (const tc of m.toolCalls) {
        parts.push({ functionCall: { name: tc.name, args: tc.args } });
      }
      contents.push({ role, parts });
      continue;
    }
    const parts =
      typeof m.content === "string"
        ? [{ text: m.content }]
        : partsToGoogle(m.content);
    contents.push({ role, parts });
  }
  return {
    systemInstruction: systemParts.length
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : undefined,
    contents,
  };
}

function toolsToGoogle(tools: Tool[]): unknown[] {
  return [
    {
      functionDeclarations: tools.map((t) =>
        compact({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }),
      ),
    },
  ];
}

function parseCandidate(json: unknown, model: string): ChatResponse {
  const j = (json ?? {}) as Record<string, any>;
  const cand = j.candidates?.[0] ?? {};
  const parts: any[] = cand.content?.parts ?? [];
  let text = "";
  const toolCalls: ToolCall[] = [];
  let idx = 0;
  for (const p of parts) {
    if (typeof p?.text === "string") text += p.text;
    else if (p?.functionCall) {
      const args = (p.functionCall.args ?? {}) as Record<string, unknown>;
      toolCalls.push({
        id: `call_${p.functionCall.name ?? "fn"}_${idx++}`,
        name: p.functionCall.name ?? "",
        args,
        argsRaw: JSON.stringify(args),
      });
    }
  }
  const um = j.usageMetadata;
  const usage = um
    ? {
        inputTokens: um.promptTokenCount ?? 0,
        outputTokens: um.candidatesTokenCount ?? 0,
      }
    : undefined;
  return {
    text,
    toolCalls,
    finishReason: mapFinish(cand.finishReason),
    usage,
    model: j.modelVersion ?? model,
    raw: json,
  };
}

export const googleAdapter: ProviderAdapter = {
  buildRequest(opts: ChatOptions, stream: boolean): BuiltRequest {
    const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const method = stream ? "streamGenerateContent" : "generateContent";
    const q = new URLSearchParams();
    if (stream) q.set("alt", "sse");
    if (opts.apiKey) q.set("key", opts.apiKey);
    const qs = q.toString();
    const url = `${base}/models/${opts.model}:${method}${qs ? `?${qs}` : ""}`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    };
    const { systemInstruction, contents } = messagesToGoogle(opts.messages);
    const generationConfig = compact({
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
      topP: opts.topP,
      stopSequences: toStopArray(opts.stop),
    });
    const body = compact({
      systemInstruction,
      contents,
      tools: opts.tools?.length ? toolsToGoogle(opts.tools) : undefined,
      generationConfig: Object.keys(generationConfig).length
        ? generationConfig
        : undefined,
    });
    return { url, headers, body };
  },

  parseResponse(json: unknown, model: string): ChatResponse {
    return parseCandidate(json, model);
  },

  createStreamDecoder() {
    let toolIndex = 0;
    return (event: SseEvent): ChatChunk[] => {
      const j = safeJson(event.data) as Record<string, any> | null;
      if (!j) return [];
      const out: ChatChunk[] = [];
      const cand = j.candidates?.[0];
      if (cand) {
        const parts: any[] = cand.content?.parts ?? [];
        for (const p of parts) {
          if (typeof p?.text === "string" && p.text) {
            out.push({ type: "text", delta: p.text });
          } else if (p?.functionCall) {
            const args = p.functionCall.args ?? {};
            out.push({
              type: "tool_call",
              index: toolIndex++,
              id: `call_${p.functionCall.name ?? "fn"}_${toolIndex}`,
              name: p.functionCall.name,
              argsDelta: JSON.stringify(args),
            });
          }
        }
        if (cand.finishReason) {
          const um = j.usageMetadata;
          out.push({
            type: "done",
            finishReason: mapFinish(cand.finishReason),
            usage: um
              ? {
                  inputTokens: um.promptTokenCount ?? 0,
                  outputTokens: um.candidatesTokenCount ?? 0,
                }
              : undefined,
          });
        }
      }
      return out;
    };
  },
};
