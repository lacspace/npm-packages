/**
 * `toolbox` — group tools, emit all provider specs at once, and dispatch the
 * model's tool calls to the right handler.
 */
import type { Tool } from "./tool";
import type { Provider, ToolSpec } from "./spec";

/**
 * A tool call as it arrives from a provider. Shapes differ, so every field is
 * optional and dispatch is tolerant:
 *  - OpenAI: `{ id, function: { name, arguments: "<json string>" } }`
 *  - Anthropic: `{ type: "tool_use", id, name, input: {...} }`
 *  - Google / plain: `{ name, arguments | args: {...} }`
 */
export interface ToolCall {
  id?: string;
  name?: string;
  arguments?: unknown;
  args?: unknown;
  input?: unknown;
  function?: { name?: string; arguments?: unknown };
  [key: string]: unknown;
}

/** Result of dispatching one tool call. */
export interface DispatchResult {
  name: string;
  /** Present on success. */
  result?: unknown;
  /** Present on failure (unknown tool, bad args, or a throwing handler). */
  error?: string;
  /** `true` when `error` is set. */
  isError?: boolean;
  /** Echoed from the call when it carried an `id` (for provider round-trips). */
  id?: string;
}

export interface Toolbox {
  /** The underlying tools, in registration order. */
  readonly tools: Tool[];
  /** Tool names, in registration order. */
  readonly names: string[];
  /** Look up a tool by name. */
  get(name: string): Tool | undefined;
  /** Every tool's spec for a provider (pass straight to the API `tools`). */
  specs(provider: Provider): ToolSpec[];
  /** Route one tool call to its handler and return `{ name, result }` or an error. */
  dispatch(call: ToolCall): Promise<DispatchResult>;
  /** Dispatch a batch of tool calls (in parallel). */
  dispatchAll(calls: ToolCall[]): Promise<DispatchResult[]>;
}

function callName(call: ToolCall): string {
  return call.name ?? call.function?.name ?? "";
}

function callArgs(call: ToolCall): unknown {
  if (call.arguments !== undefined) return call.arguments;
  if (call.function && call.function.arguments !== undefined) return call.function.arguments;
  if (call.input !== undefined) return call.input;
  if (call.args !== undefined) return call.args;
  return {};
}

/** Create a toolbox from a list of tools. */
export function toolbox(tools: Tool[]): Toolbox {
  const map = new Map<string, Tool>();
  for (const t of tools) map.set(t.name, t);

  const dispatch = async (call: ToolCall): Promise<DispatchResult> => {
    const name = callName(call);
    const id = call.id;
    const base: DispatchResult = id !== undefined ? { name, id } : { name };
    const tool = map.get(name);
    if (!tool) {
      return { ...base, error: `No tool named "${name}".`, isError: true };
    }
    try {
      const result = await tool.run(callArgs(call));
      return { ...base, result };
    } catch (err) {
      return {
        ...base,
        error: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  };

  return {
    tools,
    names: tools.map((t) => t.name),
    get: (name) => map.get(name),
    specs: (provider) => tools.map((t) => t.spec(provider)),
    dispatch,
    dispatchAll: (calls) => Promise.all(calls.map(dispatch)),
  };
}
