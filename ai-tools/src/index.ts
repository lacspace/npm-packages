/**
 * @lacspace/ai-tools
 * Define LLM function-calling / tool-use tools once and use them with any
 * provider. Generate the OpenAI, Anthropic or Google tool spec AND get a
 * runtime dispatcher that validates arguments and calls your handler.
 *
 * "Zod-to-tool" for agents — without a hard dependency on any validator.
 *
 * ```ts
 * import { defineTool, toolbox, jsonSchema } from "@lacspace/ai-tools";
 *
 * const getWeather = defineTool({
 *   name: "get_weather",
 *   description: "Get the current weather for a city.",
 *   parameters: jsonSchema.object({
 *     city: jsonSchema.string("City name"),
 *     units: jsonSchema.enum(["metric", "imperial"]).optional(),
 *   }),
 *   handler: ({ city, units }) => ({ city, tempC: 21, units }),
 * });
 *
 * const kit = toolbox([getWeather]);
 * kit.specs("openai");     // → OpenAI tools[]
 * kit.specs("anthropic");  // → Anthropic tools[]
 *
 * // Route a model tool call (arguments may be a JSON string):
 * await kit.dispatch({ name: "get_weather", arguments: '{"city":"Kathmandu"}' });
 * // → { name: "get_weather", result: { city: "Kathmandu", tempC: 21 } }
 * ```
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export { defineTool, resolveParameters } from "./tool";
export type { Tool, ToolConfig, ParametersInput, InferArgs } from "./tool";

export { toolbox } from "./toolbox";
export type { Toolbox, ToolCall, DispatchResult } from "./toolbox";

export { jsonSchema, SchemaNode } from "./jsonSchema";
export type { JSONSchema, ObjectType } from "./jsonSchema";

export { buildSpec } from "./spec";
export type {
  Provider,
  ToolSpec,
  OpenAIToolSpec,
  AnthropicToolSpec,
  GoogleToolSpec,
} from "./spec";

export { validateAgainstSchema, ToolArgumentError } from "./validate";
