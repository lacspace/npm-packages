<div align="center">

# @lacspace/agent

**A tiny, keyless tool-calling / ReAct agent loop — zero dependencies, isomorphic, bring-your-own model and tools.**

[![npm version](https://img.shields.io/npm/v/@lacspace/agent?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/agent)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/agent?label=minzip)](https://bundlephobia.com/package/@lacspace/agent)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/agent)
[![license](https://img.shields.io/npm/l/@lacspace/agent?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The loop at the heart of every agent: **call the model → run the tools it asks for → feed the results back → repeat**, until it produces a final answer or hits a step guard. The model and the tools are **injectable, duck-typed interfaces**, so it's provider-agnostic, keyless, and fully testable with a fake model — no network, no API key, no hard dependency.

- 🔁 **The ReAct / tool-calling loop, done right** — reason → act → observe, with a hard `maxSteps` guard against runaways
- 🧩 **Bring your own everything** — pass a `chat` function and an array of tools; nothing is bundled, nothing is required
- 🛡️ **Error-recovering dispatch** — a throwing tool handler (or an unknown tool) becomes a tool result the model can react to, instead of crashing the run
- 🔍 **Full observable trace** — every message, tool call and tool result is captured in `steps` (and streamed to `onStep`)
- 🧪 **Deterministic & testable** — the whole loop runs against a scripted fake `chat`; the real one only lives in your injected function
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · **keyless** · fully typed

## Install

```bash
npm i @lacspace/agent
```

## Quick start

```ts
import { createAgent, defineTool } from "@lacspace/agent";

const add = defineTool("add", {
  description: "Add two numbers.",
  parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } },
  handler: ({ a, b }) => (a as number) + (b as number),
});

const agent = createAgent({
  chat,                                  // your injected model (see below)
  tools: [add],
  systemPrompt: "You are a helpful math assistant.",
  maxSteps: 8,
});

const run = await agent.run("What is 2 + 3?");
console.log(run.output);       // "The answer is 5."
console.log(run.finishReason); // "stop"
console.log(run.steps);        // full trace of messages / tool calls / results
```

## The injectable `chat` function

The agent never talks to a network itself — you give it a `chat` function with this shape (it's exactly what [`@lacspace/ai`](https://developer.lacspace.com/packages/ai)'s `chat` provides):

```ts
type ChatFn = (
  messages: Message[],
  opts?: { tools?: AgentTool[]; signal?: AbortSignal },
) => Promise<{ content: string; toolCalls?: ToolCall[] }>;
```

Wiring up `@lacspace/ai` (or any provider) is a few lines — normalize its response into `{ content, toolCalls }` and you're done. Because `chat` is just a function, tests inject a scripted fake and the loop is fully deterministic with **no key and no network**.

## The injectable tools

A tool is any object of this shape (it matches [`@lacspace/ai-tools`](https://developer.lacspace.com/packages/ai-tools)' definable tool, so tools built there drop straight in):

```ts
type AgentTool = {
  name: string;
  description?: string;
  parameters?: unknown;                                  // JSON Schema for the model
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
};
```

Use `defineTool(name, def)` to inline one without pulling in `@lacspace/ai-tools`, or pass `@lacspace/ai-tools` tools directly.

## One-shot

```ts
import { runAgent } from "@lacspace/agent";

const run = await runAgent({ chat, tools: [add], input: "What is 2 + 3?" });
```

## Observability & control

```ts
const agent = createAgent({
  chat,
  tools,
  onStep: (step) => console.log(step.type, step),  // stream the trace live
});

const controller = new AbortController();
const run = await agent.run(input, { maxSteps: 5, signal: controller.signal });
// finishReason is "stop" | "max_steps" | "error"
```

Every `run` returns an `AgentRun`: the final `output`, the accumulated `messages`, every `toolCalls`, the ordered `steps` trace, and a `finishReason`.

## API

| Export | Signature | Description |
| --- | --- | --- |
| `createAgent` | `(opts: AgentOptions) => Agent` | Build a reusable agent bound to a `chat`, `tools`, `systemPrompt`, `maxSteps`, `onStep`. |
| `runAgent` | `(opts & { input, signal? }) => Promise<AgentRun>` | One-shot: `createAgent` then `run`. |
| `Agent.run` | `(input: string \| Message[], opts?: RunOptions) => Promise<AgentRun>` | Drive the tool-calling loop to completion. |
| `defineTool` | `(name, def) => AgentTool` | Inline a tool without any dependency. |
| `dispatchTool` | `(call, toolMap) => Promise<DispatchResult>` | Safe, non-throwing single tool-call runner. |
| `toolMap` | `(tools) => Map<string, AgentTool>` | Index tools by name for dispatch. |
| `stringifyResult` | `(result) => string` | Serialize a tool result into message content. |

**`AgentRun`** = `{ output: string; steps: AgentStep[]; messages: Message[]; toolCalls: ToolCall[]; finishReason: "stop" | "max_steps" | "error" }`

**`AgentStep`** = `{ type: "message" | "tool_call" | "tool_result"; ... }` — a full trace entry.

**`Message`** = `{ role: "system" | "user" | "assistant" | "tool"; content: string; toolCalls?: ToolCall[]; toolCallId?: string; name?: string }`

**`ToolCall`** = `{ id: string; name: string; arguments: Record<string, unknown> }`

**`AgentOptions`** — `chat` (required), `tools`, `systemPrompt`, `maxSteps` (default `8`), `onStep`.

Also exported as types: `Message`, `ToolCall`, `AgentTool`, `Agent`, `AgentRun`, `AgentStep`, `ChatResult`, `ChatFn`, `AgentOptions`, `RunOptions`, `Role`, `FinishReason`, `DispatchResult`.

## How the loop works

1. Call `chat(messages, { tools, signal })`.
2. If the result has **no** tool calls, that's the final answer — return with `finishReason: "stop"`.
3. Otherwise, dispatch each requested tool call to its `handler`, append a `role: "tool"` result message for each (a thrown handler is captured as an error result, not a crash), and go back to step 1.
4. If the loop reaches `maxSteps` first, return with `finishReason: "max_steps"`; an abort returns `finishReason: "error"`.

## Works great with

- [`@lacspace/ai`](https://developer.lacspace.com/packages/ai) — a provider-agnostic `chat` you can inject directly as the model.
- [`@lacspace/ai-tools`](https://developer.lacspace.com/packages/ai-tools) — define tools (JSON Schema, validation, provider specs) and hand them straight to the agent.
- [`@lacspace/prompt`](https://developer.lacspace.com/packages/prompt) — build the system prompt and message templates.
- [`@lacspace/json-repair`](https://developer.lacspace.com/packages/json-repair) — heal malformed tool-call arguments before you dispatch them.

All composed via **duck-typed interfaces** — none of them is a dependency, and the agent works standalone.

## Limitations

- **The loop, not the model.** This package does not call any LLM itself — you inject `chat`. It carries no provider adapters, no key handling and no network code by design.
- **No built-in schema validation.** Tool arguments are passed to your handler as-is; validate them in the handler or with `@lacspace/ai-tools`' `defineTool`.
- **`maxSteps` counts chat turns**, not individual tool calls — a turn that requests several tools runs them all before counting as one step.
- **Tool calls within one turn run sequentially** in order (simple and deterministic); there is no built-in parallelism across a turn's calls.
- **Abort is cooperative** — it is checked between steps and forwarded to your `chat`; a handler already in flight is not force-cancelled unless it honours the signal itself.
- **No built-in retries or backoff** — wrap your injected `chat` (e.g. with `@lacspace/retry`) if you need them.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/agent` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/agent
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
