/**
 * `defineTool` — an inline, dependency-free way to declare a tool for the
 * agent, and `dispatchTool` — the safe tool-call runner the loop uses.
 */
import type { AgentTool, ToolCall } from "./types";

/**
 * Passthrough helper so callers can inline a tool without pulling in
 * `@lacspace/ai-tools`. The returned object is a plain {@link AgentTool}; it is
 * also shape-compatible with `@lacspace/ai-tools`' tools, so you can mix both.
 *
 * ```ts
 * const getWeather = defineTool("get_weather", {
 *   description: "Get the current weather for a city.",
 *   parameters: { type: "object", properties: { city: { type: "string" } } },
 *   handler: ({ city }) => ({ city, tempC: 21 }),
 * });
 * ```
 */
export function defineTool(
  name: string,
  def: Omit<AgentTool, "name">,
): AgentTool {
  if (!name || typeof name !== "string") {
    throw new Error("defineTool: `name` is required.");
  }
  if (typeof def?.handler !== "function") {
    throw new Error(`defineTool(${name}): a \`handler\` function is required.`);
  }
  return {
    name,
    description: def.description,
    parameters: def.parameters,
    handler: def.handler,
  };
}

/** Index tools by name for O(1) dispatch. */
export function toolMap(tools: AgentTool[]): Map<string, AgentTool> {
  const map = new Map<string, AgentTool>();
  for (const t of tools) map.set(t.name, t);
  return map;
}

/** The outcome of dispatching one tool call. */
export interface DispatchResult {
  /** The value the handler returned, or an error marker on failure. */
  result: unknown;
  /** Human-readable error message when the handler threw / was missing. */
  error?: string;
}

/** Coerce any thrown value into a string message. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Run a single tool call against the available tools, **never throwing**: a
 * missing tool or a handler error is captured into `{ result, error }` so the
 * agent can feed it back to the model and keep going.
 */
export async function dispatchTool(
  call: ToolCall,
  tools: Map<string, AgentTool>,
): Promise<DispatchResult> {
  const tool = tools.get(call.name);
  if (!tool) {
    const error = `Unknown tool: ${call.name}`;
    return { result: { error }, error };
  }
  try {
    const result = await tool.handler(call.arguments ?? {});
    return { result };
  } catch (err) {
    const error = messageOf(err);
    return { result: { error }, error };
  }
}

/** Serialize a tool result into the string content of a `role: "tool"` message. */
export function stringifyResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result === undefined) return "";
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}
