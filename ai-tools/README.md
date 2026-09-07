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
| `.optional()` | drops the field from `required`, widens the type with `undefined` |
| `.describe(text)` | adds a `description` (your prompt to the model) |

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
| `validateAgainstSchema(value, schema)` | | the built-in JSON-Schema checker/coercer |
| `ToolArgumentError` | `Error` with `.issues: string[]` | thrown on invalid arguments |

## How it works

`defineTool` resolves your `parameters` into a plain JSON Schema (via `.toJsonSchema()`, a `.jsonSchema` field, or as-is) and remembers a `.parse()` if one was provided. `.spec(provider)` reshapes that JSON Schema into each API's envelope — OpenAI nests it under `function.parameters`, Anthropic under `input_schema`, Google under `parameters`. `.run()` normalizes the raw arguments (JSON-parsing a string), validates them (delegating to `.parse()` when present, otherwise running the built-in checker), and calls your handler. The `toolbox` is a name→tool map with tolerant argument extraction so the same code handles every provider's tool-call shape.

## Limitations (honest)

- The built-in validator is intentionally **minimal**: required keys, primitive types (`string`/`number`/`integer`/`boolean`/`array`/`object`/`null`), enum membership, and numeric/boolean **string coercion**. It does **not** check `minLength`, `pattern`, `format`, `minimum`, tuple `items`, `anyOf`/`oneOf`, etc. For rich validation, pass a real validator (`@lacspace/validate`, Zod) — its `.parse()` is used instead.
- When you pass a **`.parse()`-only** schema (no `.toJsonSchema()`), the generated spec's `parameters` is a minimal `{ type: "object" }` — the model gets fewer hints. Provide a JSON Schema (or a schema with `.toJsonSchema()`) for a rich spec.
- Type inference is exact for `jsonSchema.object(...)` and validator schemas with a typed `.parse()`; a **plain** JSON Schema carries no static type, so the handler argument falls back to `any` (annotate it yourself).
- This package **makes no network calls** and holds no API keys — you call the provider SDK; it only builds the specs and dispatches the calls.

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
