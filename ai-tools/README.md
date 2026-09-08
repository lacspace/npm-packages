<div align="center">

# @lacspace/ai-tools

**Define an LLM tool once. Use it with OpenAI, Anthropic and Google — spec _and_ dispatcher.**

[![npm version](https://img.shields.io/npm/v/@lacspace/ai-tools?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/ai-tools)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/ai-tools?label=minzip)](https://bundlephobia.com/package/@lacspace/ai-tools)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/ai-tools)
[![license](https://img.shields.io/npm/l/@lacspace/ai-tools?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> "Zod-to-tool" for agents. Describe a function-calling tool **once** — name, description, parameters, handler — and get back the provider tool spec **and** a runtime dispatcher that validates the model's arguments and calls your code. Provider-agnostic, keyless, zero dependencies, isomorphic.

- 🔌 **One definition, every provider** — `.spec("openai" | "anthropic" | "google")`
- 🧷 **Runtime dispatcher** — `toolbox.dispatch(toolCall)` routes a model tool call (even with stringified JSON args) to the right handler
- 🛡️ **Argument validation** — required keys, primitive types, enum membership, numeric-string coercion — with clear errors
- 🦆 **Bring your own validator** — pass a plain JSON Schema, the tiny built-in `jsonSchema` builder, or **any** schema with `.toJsonSchema()` / `.parse()` (so [`@lacspace/validate`](https://www.npmjs.com/package/@lacspace/validate) and Zod-like schemas work un-imported)
- 🧠 **Typed handlers** — argument types are inferred from the schema
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed

> **New in 1.1.0** — close the loop without touching your provider SDK's shapes: **`parseToolCalls(response)`** pulls the tool calls out of an OpenAI / Anthropic / Google response, **`toToolMessages(provider, results)`** formats the results back into provider messages, an opt-in **`strict: true`** (and `validateStrict`) enforces the richer JSON-Schema keywords (`minLength`/`pattern`/`format`, `minimum`/`maximum`/`multipleOf`, `minItems`/`uniqueItems`, `const`, `anyOf`/`oneOf`, unknown-prop rejection), and the `jsonSchema` builder gains `.min()` `.max()` `.pattern()` `.format()` `.nullable()` `.default()` plus `literal` / `record` / `anyOf` / `oneOf` / `null` / `any`. All additive — existing code is unchanged.

## Install

```bash
npm i @lacspace/ai-tools
```

## Define a tool once

```ts
import { defineTool, jsonSchema } from "@lacspace/ai-tools";

const getWeather = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city.",
  parameters: jsonSchema.object({
    city: jsonSchema.string("City name, e.g. \"Kathmandu\""),
    units: jsonSchema.enum(["metric", "imperial"]).optional(),
  }),
  handler: ({ city, units }) => ({ city, tempC: 21, units: units ?? "metric" }),
  //         ^ inferred: { city: string; units?: "metric" | "imperial" }
});
```

## Emit the spec for any provider

```ts
getWeather.spec("openai");
// { type: "function", function: { name, description, parameters } }

getWeather.spec("anthropic");
// { name, description, input_schema }

getWeather.spec("google");
// { name, description, parameters }   ← goes inside tools[].functionDeclarations
```

## Validate + run

`.run()` validates/coerces the raw arguments (a JSON **string** or an object), then calls your handler. Bad input throws a `ToolArgumentError`.

```ts
await getWeather.run('{"city":"Pokhara","units":"imperial"}');
// { city: "Pokhara", tempC: 21, units: "imperial" }

await getWeather.run({ units: "metric" });     // ❌ throws: city is required
await getWeather.run({ city: 42 });            // ❌ throws: city must be a string
```

## A toolbox that dispatches model tool calls

```ts
import { toolbox } from "@lacspace/ai-tools";

const kit = toolbox([getWeather, addNumbers]);

// 1) hand every spec to the API:
const tools = kit.specs("openai");

// 2) when the model returns a tool call, dispatch it — tolerant of each
//    provider's call shape and of stringified JSON arguments:
const out = await kit.dispatch({
  id: "call_abc",
  name: "get_weather",
  arguments: '{"city":"Kathmandu"}',
});
// { name: "get_weather", id: "call_abc", result: { city: "Kathmandu", tempC: 21, units: "metric" } }

// Batch (OpenAI often returns several at once):
const results = await kit.dispatchAll(toolCallsFromModel);
```

`dispatch` accepts OpenAI (`{ id, function: { name, arguments } }`), Anthropic (`{ type: "tool_use", name, input }`) and plain (`{ name, arguments }`) shapes. An unknown tool, invalid arguments, or a throwing handler come back as `{ name, error, isError: true }` — never an exception — so one bad call can't crash your loop.

## Close the loop: parse the response, dispatch, format results back

Two pure helpers handle the round-trip so you never hand-write a provider's tool-call or tool-result shape. `parseToolCalls` reads the raw response (OpenAI Chat Completions **and** the Responses API, Anthropic Messages, Google Gemini — or an array/bare message), and `toToolMessages` turns the results back into messages to append.

```ts
import { parseToolCalls, hasToolCalls, toToolMessages } from "@lacspace/ai-tools";

const response = await openai.chat.completions.create({ model, messages, tools: kit.specs("openai") });

if (hasToolCalls(response)) {
  const calls = parseToolCalls(response);      // → normalized ToolCall[]
  const results = await kit.dispatchAll(calls); // run them (in parallel)
  messages.push(response.choices[0].message);
  messages.push(...toToolMessages("openai", results)); // one { role:"tool", tool_call_id, content } per result
  // …loop back to the model
}
```

`toToolMessages` always returns an **array** of messages to append: OpenAI → one `{ role:"tool", tool_call_id, content }` per result; Anthropic → a single `{ role:"user", content:[{ type:"tool_result", tool_use_id, content, is_error? }] }`; Google → a single `{ role:"user", parts:[{ functionResponse:{ name, response } }] }`. Errored results carry their message (and `is_error:true` for Anthropic).

## Strict validation (opt-in)

The default validator is deliberately minimal. Pass `strict: true` (or call `validateStrict`) to also enforce the richer keywords — still dependency-free, still coercing numeric/boolean strings:

```ts
const register = defineTool({
  strict: true,
  name: "register",
  description: "Register a user.",
  parameters: jsonSchema.object({
    email: jsonSchema.string().format("email"),
    age: jsonSchema.integer().min(18).max(120),
    tags: jsonSchema.array(jsonSchema.string()).max(5),
  }),
  handler: ({ email, age }) => createUser(email, age),
});

await register.run({ email: "bad", age: 20 });   // ❌ throws: email must be a valid email
await register.run({ email: "a@b.com", age: 15 }); // ❌ throws: age must be >= 18
```

`strict` enforces `minLength`/`maxLength`/`pattern`/`format` (`email`/`url`/`uri`/`uuid`/`date`/`date-time`), `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`multipleOf`, `minItems`/`maxItems`/`uniqueItems`, `const`, `enum`, `anyOf`/`oneOf`, and rejects unknown properties when `additionalProperties: false`. It's off by default, so existing tools behave exactly as before.

## Bring your own validator (duck-typed)

No import of this package into your validator, and no import of the validator here. If `parameters` exposes `.parse()`, it's used to validate; if it exposes `.toJsonSchema()` (or a `.jsonSchema` field), it feeds the provider spec.

```ts
import { v } from "@lacspace/validate";

const search = defineTool({
  name: "search",
  description: "Search the docs.",
  parameters: v.object({ q: v.string().min(1), limit: v.coerce.number().optional() }),
  handler: ({ q, limit }) => runSearch(q, limit),   // args validated by v.parse
});
```

The same works with Zod, or any object shaped like `{ toJsonSchema?(): object; parse?(x): T }`.

## The `jsonSchema` builder

A tiny convenience for when you don't have a validator — it just emits a plain JSON Schema (it is **not** itself a validator).

```ts
jsonSchema.object({
  name: jsonSchema.string(),
  age: jsonSchema.number().optional(),
  role: jsonSchema.enum(["admin", "user"]),
  tags: jsonSchema.array(jsonSchema.string()),
}).toJsonSchema();
// { type: "object", additionalProperties: false,
//   required: ["name", "role", "tags"],
//   properties: { name: {type:"string"}, age: {type:"number"},
//                 role: {type:"string", enum:["admin","user"]},
//                 tags: {type:"array", items:{type:"string"}} } }
```

| Builder | Produces |
| --- | --- |
| `jsonSchema.string(desc?)` | `{ type: "string" }` |
| `jsonSchema.number(desc?)` / `jsonSchema.integer(desc?)` | `{ type: "number" \| "integer" }` |
| `jsonSchema.boolean(desc?)` | `{ type: "boolean" }` |
| `jsonSchema.enum([...] as const)` | `{ type, enum: [...] }` (typed literal union) |
| `jsonSchema.array(inner)` | `{ type: "array", items }` |
| `jsonSchema.object({...})` | `{ type: "object", properties, required, additionalProperties: false }` |
| `jsonSchema.literal(value)` | `{ const: value, type }` (typed literal) |
| `jsonSchema.record(inner)` | `{ type: "object", additionalProperties: inner }` (string-keyed map) |
| `jsonSchema.anyOf([...])` / `oneOf([...])` | `{ anyOf }` / `{ oneOf }` |
| `jsonSchema.null()` / `jsonSchema.any()` | `{ type: "null" }` / `{}` |
| `.optional()` | drops the field from `required`, widens the type with `undefined` |
| `.describe(text)` | adds a `description` (your prompt to the model) |
| `.min(n)` / `.max(n)` | `minLength`/`maxLength` (string), `minItems`/`maxItems` (array), else `minimum`/`maximum` |
| `.pattern(str \| RegExp)` / `.format(name)` | adds `pattern` / `format` |
| `.nullable()` / `.default(v)` | adds `"null"` to `type` / a `default` value |

> The constraint keywords (`.min`/`.max`/`.pattern`/`.format`/…) are always emitted into the schema (so the model sees them); they are **enforced at runtime only under `strict: true`** or `validateStrict`.

## API

| Export | Signature | Notes |
| --- | --- | --- |
| `defineTool(config)` | `{ name, description, parameters, handler }` → `Tool` | `parameters`: plain JSON Schema, a `jsonSchema` node, or any `.toJsonSchema()` / `.parse()` schema |
| `Tool.spec(provider)` | `"openai" \| "anthropic" \| "google"` → spec object | provider-shaped tool/function definition |
| `Tool.run(rawArgs, ctx?)` | `unknown` → `Promise<Result>` | validates/coerces, then calls the handler |
| `Tool.validate(rawArgs)` | `unknown` → `Args` | just the validation step; throws `ToolArgumentError` |
| `toolbox(tools)` | `Tool[]` → `Toolbox` | group tools |
| `Toolbox.specs(provider)` | → `spec[]` | pass straight to the API `tools` |
| `Toolbox.dispatch(call)` | `ToolCall` → `Promise<{ name, result }>` \| `{ name, error, isError }` | tolerant of call shapes & stringified args |
| `Toolbox.dispatchAll(calls)` | `ToolCall[]` → `Promise<DispatchResult[]>` | in parallel |
| `Toolbox.get(name)` / `Toolbox.names` | | lookup helpers |
| `jsonSchema.*` | | the builder above |
| `parseToolCalls(response)` | `unknown` → `ToolCall[]` | extract tool calls from any OpenAI/Anthropic/Google response (or message/array) |
| `hasToolCalls(response)` | `unknown` → `boolean` | quick "did the model call a tool?" |
| `toToolMessages(provider, results)` | `(Provider, DispatchResult \| DispatchResult[])` → `unknown[]` | format results back into provider messages to append |
| `defineTool({ …, strict: true })` | optional flag | validate with the richer `validateStrict` instead of the minimal checker |
| `validateStrict(value, schema)` | `(unknown, JSONSchema)` → `unknown` | dependency-free validator honouring `minLength`/`pattern`/`format`/`minimum`/`multipleOf`/`minItems`/`uniqueItems`/`const`/`anyOf`/`oneOf`/… |
| `validateAgainstSchema(value, schema)` | | the built-in (minimal) JSON-Schema checker/coercer |
| `ToolArgumentError` | `Error` with `.issues: string[]` | thrown on invalid arguments |

## How it works

`defineTool` resolves your `parameters` into a plain JSON Schema (via `.toJsonSchema()`, a `.jsonSchema` field, or as-is) and remembers a `.parse()` if one was provided. `.spec(provider)` reshapes that JSON Schema into each API's envelope — OpenAI nests it under `function.parameters`, Anthropic under `input_schema`, Google under `parameters`. `.run()` normalizes the raw arguments (JSON-parsing a string), validates them (delegating to `.parse()` when present, otherwise running the built-in checker), and calls your handler. The `toolbox` is a name→tool map with tolerant argument extraction so the same code handles every provider's tool-call shape.

## Limitations (honest)

- The built-in validator is intentionally **minimal**: required keys, primitive types (`string`/`number`/`integer`/`boolean`/`array`/`object`/`null`), enum membership, and numeric/boolean **string coercion**. It does **not** check `minLength`, `pattern`, `format`, `minimum`, tuple `items`, `anyOf`/`oneOf`, etc. For rich validation, pass a real validator (`@lacspace/validate`, Zod) — its `.parse()` is used instead.
- When you pass a **`.parse()`-only** schema (no `.toJsonSchema()`), the generated spec's `parameters` is a minimal `{ type: "object" }` — the model gets fewer hints. Provide a JSON Schema (or a schema with `.toJsonSchema()`) for a rich spec.
- Type inference is exact for `jsonSchema.object(...)` and validator schemas with a typed `.parse()`; a **plain** JSON Schema carries no static type, so the handler argument falls back to `any` (annotate it yourself).
- This package **makes no network calls** and holds no API keys — you call the provider SDK; it only builds the specs and dispatches the calls.
- **`strict` validation** covers the common keywords listed above but is still not a full JSON-Schema (Draft-2020-12) implementation — no `$ref`/`$defs`, `if`/`then`/`else`, `dependentRequired`, `patternProperties`, tuple `prefixItems`, or `not`. `format` is checked leniently (`email`/`url`/`uri`/`uuid`/`date`/`date-time`; unknown formats pass). For exhaustive validation, still pass a real validator's `.parse()`.
- **`parseToolCalls`** detects each provider's shape structurally (it isn't told which provider); it recognizes the documented OpenAI/Anthropic/Google shapes but a bespoke or future response envelope may need you to map it yourself. **`toToolMessages`** produces the standard message shapes — adjust if your SDK version expects a variant.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/ai-tools` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/ai-tools
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
