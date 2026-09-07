/**
 * `defineTool` — describe a function-calling tool once (name, description,
 * parameters, handler) and get a provider-agnostic {@link Tool} back.
 */
import { SchemaNode, type JSONSchema } from "./jsonSchema";
import { validateAgainstSchema, ToolArgumentError } from "./validate";
import { buildSpec, type Provider, type ToolSpec } from "./spec";

/**
 * Anything usable as `parameters`:
 *  - a plain JSON Schema object, or
 *  - a `jsonSchema.object(...)` node, or
 *  - any schema exposing `toJsonSchema()` / `jsonSchema` / `.parse()`
 *    (so `@lacspace/validate` and Zod-like schemas work un-imported).
 */
export type ParametersInput =
  | JSONSchema
  | SchemaNode<any>
  | { toJsonSchema(): JSONSchema; parse?: (x: unknown) => unknown }
  | { jsonSchema: JSONSchema; parse?: (x: unknown) => unknown }
  | { parse: (x: unknown) => unknown };

/**
 * Infer the handler argument type from the parameters schema, if possible.
 * `jsonSchema.object(...)` and validator schemas with a typed `.parse()` give
 * precise types; a plain JSON Schema (which carries no static type) falls back
 * to `any` so you can annotate the handler argument yourself.
 */
export type InferArgs<S> =
  S extends SchemaNode<infer T> ? T :
  S extends { parse: (x: any) => infer T } ? T :
  S extends { _type?: infer T } ? T :
  any;

export interface ToolConfig<S extends ParametersInput, R, C> {
  /** Unique tool name the model will call. */
  name: string;
  /** Natural-language description — this is your prompt to the model. */
  description: string;
  /** JSON Schema, a `jsonSchema.object(...)`, or any validator schema. */
  parameters: S;
  /** Your implementation. Receives validated, typed args (and optional ctx). */
  handler: (args: InferArgs<S>, ctx?: C) => R | Promise<R>;
}

/** A defined tool: produce provider specs, validate args, run the handler. */
export interface Tool<Args = any, Result = any, Ctx = unknown> {
  readonly name: string;
  readonly description: string;
  /** The resolved plain JSON Schema for the parameters. */
  readonly parameters: JSONSchema;
  /** The provider-shaped tool/function definition. */
  spec(provider: Provider): ToolSpec;
  /** Validate/coerce raw args (string or object) — throws on invalid input. */
  validate(rawArgs: unknown): Args;
  /** Validate raw args, then call the handler. */
  run(rawArgs: unknown, ctx?: Ctx): Promise<Result>;
}

interface Resolved {
  schema: JSONSchema;
  parse?: (x: unknown) => unknown;
}

/** Pull a JSON Schema (and an optional `.parse` validator) out of `parameters`. */
export function resolveParameters(parameters: ParametersInput): Resolved {
  const p = parameters as Record<string, any> | null;
  if (!p || typeof p !== "object") {
    return { schema: { type: "object", properties: {} } };
  }
  const parse = typeof p.parse === "function" ? (x: unknown) => p.parse(x) : undefined;

  if (typeof p.toJsonSchema === "function") {
    return { schema: p.toJsonSchema() as JSONSchema, parse };
  }
  if (p.jsonSchema && typeof p.jsonSchema === "object") {
    return { schema: p.jsonSchema as JSONSchema, parse };
  }
  // Looks like a plain JSON Schema already?
  if (
    "type" in p ||
    "properties" in p ||
    "enum" in p ||
    "$schema" in p ||
    "anyOf" in p ||
    "oneOf" in p ||
    "allOf" in p
  ) {
    return { schema: p as JSONSchema, parse };
  }
  // Only a `.parse()` — we can validate but can't derive a rich schema.
  if (parse) return { schema: { type: "object" }, parse };
  return { schema: p as JSONSchema };
}

/** Parse raw args tolerantly: a JSON *string* is parsed; objects pass through. */
function normalizeRaw(rawArgs: unknown): unknown {
  if (typeof rawArgs === "string") {
    const trimmed = rawArgs.trim();
    if (trimmed === "") return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new ToolArgumentError(`Arguments were not valid JSON: ${rawArgs}`);
    }
  }
  return rawArgs ?? {};
}

/**
 * Define a tool once, use it with any provider.
 *
 * ```ts
 * const getWeather = defineTool({
 *   name: "get_weather",
 *   description: "Get the current weather for a city.",
 *   parameters: jsonSchema.object({ city: jsonSchema.string() }),
 *   handler: ({ city }) => ({ city, tempC: 21 }),
 * });
 *
 * getWeather.spec("openai");        // OpenAI tool definition
 * await getWeather.run('{"city":"Kathmandu"}'); // { city: "Kathmandu", tempC: 21 }
 * ```
 */
export function defineTool<S extends ParametersInput, R, C = unknown>(
  config: ToolConfig<S, R, C>,
): Tool<InferArgs<S>, Awaited<R>, C> {
  const { name, description, parameters, handler } = config;
  if (!name || typeof name !== "string") {
    throw new Error("defineTool: `name` is required.");
  }
  const { schema, parse } = resolveParameters(parameters);

  const validate = (rawArgs: unknown): InferArgs<S> => {
    const args = normalizeRaw(rawArgs);
    if (parse) return parse(args) as InferArgs<S>;
    return validateAgainstSchema(args, schema) as InferArgs<S>;
  };

  const run = (async (rawArgs: unknown, ctx?: C) =>
    handler(validate(rawArgs), ctx)) as Tool<InferArgs<S>, Awaited<R>, C>["run"];

  return {
    name,
    description,
    parameters: schema,
    spec: (provider) => buildSpec(provider, name, description, schema),
    validate,
    run,
  };
}
