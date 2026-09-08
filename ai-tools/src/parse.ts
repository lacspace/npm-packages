/**
 * `parseToolCalls` — pull the tool/function calls out of a raw provider
 * response (or message, or content array) into the normalized {@link ToolCall}
 * shape that {@link Toolbox.dispatch}/`dispatchAll` already understand.
 *
 * Pure and deterministic — it never touches the network. Hand it whatever your
 * provider SDK returned; get back a flat `ToolCall[]` ready to dispatch:
 *
 * ```ts
 * const calls = parseToolCalls(openaiResponse);   // OpenAI chat / responses
 * const calls = parseToolCalls(anthropicMessage); // Anthropic Messages
 * const calls = parseToolCalls(geminiResponse);   // Google Gemini
 * const results = await kit.dispatchAll(calls);
 * ```
 */
import type { ToolCall } from "./toolbox";

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/**
 * Extract every tool call from a provider response, message, or content list.
 * Recognizes OpenAI Chat Completions (`choices[].message.tool_calls`) and the
 * Responses API (`output[].type === "function_call"`), Anthropic Messages
 * (`content[].type === "tool_use"`), Google Gemini
 * (`candidates[].content.parts[].functionCall`), a bare message
 * (`{ tool_calls }` / `{ function_call }` / `{ parts }`), an array of any of
 * these, or a single already-normalized call. Returns `[]` when there are none.
 */
export function parseToolCalls(response: unknown): ToolCall[] {
  if (response == null) return [];
  if (Array.isArray(response)) return response.flatMap((r) => parseToolCalls(r));
  if (!isObj(response)) return [];

  const out: ToolCall[] = [];

  // Anthropic Messages: { content: [ { type: "tool_use", id, name, input } ] }
  if (Array.isArray(response.content)) {
    for (const block of response.content) {
      if (isObj(block) && block.type === "tool_use") {
        out.push({ id: block.id as string, name: block.name as string, input: block.input });
      }
    }
    if (out.length) return out;
  }

  // OpenAI Chat Completions: { choices: [ { message: { tool_calls: [...] } } ] }
  if (Array.isArray(response.choices)) {
    for (const ch of response.choices) {
      const msg = isObj(ch) ? ch.message : undefined;
      if (isObj(msg)) out.push(...parseToolCalls(msg));
    }
    if (out.length) return out;
  }

  // A message object: { tool_calls: [ { id, function: { name, arguments } } ] }
  if (Array.isArray(response.tool_calls)) {
    for (const tc of response.tool_calls) {
      if (!isObj(tc)) continue;
      const fn = isObj(tc.function) ? tc.function : undefined;
      out.push({
        id: tc.id as string,
        name: (fn?.name ?? tc.name) as string,
        arguments: fn ? fn.arguments : tc.arguments,
        function: fn as ToolCall["function"],
      });
    }
    if (out.length) return out;
  }

  // Legacy OpenAI single function call: { function_call: { name, arguments } }
  if (isObj(response.function_call)) {
    const fc = response.function_call;
    return [{ name: fc.name as string, arguments: fc.arguments }];
  }

  // OpenAI Responses API: { output: [ { type: "function_call", call_id, name, arguments } ] }
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (isObj(item) && item.type === "function_call") {
        out.push({
          id: (item.call_id ?? item.id) as string,
          name: item.name as string,
          arguments: item.arguments,
        });
      }
    }
    if (out.length) return out;
  }

  // Google Gemini: { candidates: [ { content: { parts: [ { functionCall } ] } } ] }
  if (Array.isArray(response.candidates)) {
    for (const cand of response.candidates) {
      const content = isObj(cand) ? cand.content : undefined;
      const parts = isObj(content) ? content.parts : undefined;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (isObj(part) && isObj(part.functionCall)) {
            out.push({ name: part.functionCall.name as string, args: part.functionCall.args });
          }
        }
      }
    }
    if (out.length) return out;
  }

  // Google content directly: { parts: [ { functionCall } ] }
  if (Array.isArray(response.parts)) {
    for (const part of response.parts) {
      if (isObj(part) && isObj(part.functionCall)) {
        out.push({ name: part.functionCall.name as string, args: part.functionCall.args });
      }
    }
    if (out.length) return out;
  }

  // A single, already-normalized-ish tool call.
  if (
    typeof response.name === "string" &&
    ("arguments" in response || "input" in response || "args" in response)
  ) {
    out.push(response as ToolCall);
  }
  return out;
}

/** `true` when `response` carries at least one tool call. */
export function hasToolCalls(response: unknown): boolean {
  return parseToolCalls(response).length > 0;
}
