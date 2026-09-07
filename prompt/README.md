<div align="center">

# @lacspace/prompt

**A tiny, typed prompt-engineering toolkit — build, compose and render LLM prompts and chat messages with real type safety.**

[![npm version](https://img.shields.io/npm/v/@lacspace/prompt?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/prompt)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/prompt?label=minzip)](https://bundlephobia.com/package/@lacspace/prompt)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/prompt)
[![license](https://img.shields.io/npm/l/@lacspace/prompt?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The flagship of the **Lacspace AI Kit**. Write your prompt as a template, and the required variable names are **inferred from the string itself** — so `.render()` is type-checked: a missing or misspelled variable is a compile error, not a 2 a.m. production surprise. Zero dependencies, isomorphic, provider-agnostic.

- 🧠 **Type-safe templates** — `prompt("Hi {{name}}")` infers `{ name }`; `.render()` won't compile without it
- 🧩 **Control blocks** — `{{#if}}`, `{{#unless}}`, `{{#each}}` (with `{{.}}` / `{{@index}}`), inline defaults `{{tone:-neutral}}`, and `\{{escapes}}`
- 💬 **Message builder** — `messages().system().user().assistant().build()` → provider-neutral `{ role, content }[]`
- 🎯 **Few-shot** — turn `[{ input, output }]` pairs into alternating messages or a labelled text block
- 🛠️ **Composition helpers** — `section` · `list` · `numbered` · `xml` · `json` · `codeBlock` · `join`
- 🌍 Zero dependencies · isomorphic (Node ≥18, browsers, edge, serverless) · **keyless & provider-agnostic** — works with Anthropic, OpenAI, Gemini, local models

## Install

```bash
npm i @lacspace/prompt
```

## The headline: templates that type-check

The variable names are read out of the template string with TypeScript template-literal types. There is one source of truth — the string — and no separate schema to keep in sync.

```ts
import { prompt } from "@lacspace/prompt";

const p = prompt("You are {{role}}. Answer concisely: {{question}}");

p.render({ role: "a math tutor", question: "What is 2+2?" });
// "You are a math tutor. Answer concisely: What is 2+2?"

p.render({ role: "a math tutor" });
//         ~~~~~~~~~~~~~~~~~~~~~~  ✗ Property 'question' is missing

p.render({ role: "a math tutor", question: "…", tone: "dry" });
//                                             ~~~~~~~~~~~ ✗ 'tone' is not a variable
```

At runtime a missing variable throws a clear, actionable error (unless you gave it a default).

## Control blocks & defaults

```ts
const email = prompt(`Hi {{name:-there}},

{{#if isVip}}As one of our VIP members, {{/if}}here's your update.

{{#each items}}- {{.}}
{{/each}}
{{#unless items}}Nothing new today.{{/unless}}`);

email.render({
  name: "Ada",
  isVip: true,
  items: ["Invoice paid", "New comment"],
});
// Hi Ada,
//
// As one of our VIP members, here's your update.
//
// - Invoice paid
// - New comment
```

- `{{#if key}}…{{/if}}` / `{{#unless key}}…{{/unless}}` — empty arrays, `""`, `0`, `false`, `null` are falsy
- `{{#each key}}…{{/each}}` — `{{.}}` / `{{this}}` is the item, `{{@index}}`, `{{@first}}`, `{{@last}}` are available, and object items expose their fields directly (`{{title}}`)
- `{{key:-default}}` — inline fallback used when the value is missing or nullish
- `\{{literal}}` — a backslash escapes the braces so they render verbatim

## Build chat messages

```ts
import { messages, prompt } from "@lacspace/prompt";

const sys = prompt("You are {{persona}}.");

const chat = messages()
  .system(sys.render({ persona: "a terse assistant" }))
  .user("Summarize the Treaty of Westphalia in one line.")
  .build();
// [
//   { role: "system", content: "You are a terse assistant." },
//   { role: "user",   content: "Summarize the Treaty of Westphalia in one line." },
// ]
```

`build()` returns a plain, provider-neutral array — hand it straight to the Anthropic, OpenAI or Gemini SDK, or map it however a provider wants.

## Few-shot examples

```ts
import { messages, fewShot } from "@lacspace/prompt";

const shots = fewShot([
  { input: "happy", output: "positive" },
  { input: "awful", output: "negative" },
]);
// [{ role:"user", content:"happy" }, { role:"assistant", content:"positive" }, …]

const chat = messages()
  .system("Classify the sentiment.")
  .add(...shots)
  .user("meh")
  .build();

// …or as an inline text block:
fewShot(pairs, { format: "text" });
// "Input: happy\nOutput: positive\n\nInput: awful\nOutput: negative"
```

## Compose prompt fragments

Small pure helpers that return strings, plus `join()` to stitch them together with blank lines:

```ts
import { join, section, list, xml, json, codeBlock } from "@lacspace/prompt";

const p = join(
  "You are a code reviewer.",
  section("Guidelines", list(["Be specific", "Suggest fixes"])),
  xml("diff", codeBlock("ts", "const x = 1")),
  section("Context", json({ repo: "acme/web", pr: 42 })),
);
```

`xml()` produces Anthropic-style `<tag>…</tag>` delimiters. A `Prompt` is itself renderable, so one prompt can be embedded into another — pass it as a variable value, and it renders in place.

## API

| Export | Signature | Description |
| --- | --- | --- |
| `prompt` | `(template: S) => Prompt<S>` | Build a typed template; variable names inferred from `S` |
| `Prompt#render` | `(vars) => string` | Fill placeholders; `vars` is type-checked, optional when no required vars |
| `render` | `(template: string, vars?) => string` | One-off render for a **dynamic** template string (loosely typed) |
| `messages` | `() => MessageBuilder` | Chainable `.system/.user/.assistant/.push/.add/.build` |
| `fewShot` | `(examples, opts?) => Message[] \| string` | Alternating messages, or a labelled text block (`format: "text"`) |
| `section` | `(title, body) => string` | `## title` + body |
| `list` / `numbered` | `(items) => string` | Bulleted / numbered list |
| `xml` | `(tag, content) => string` | `<tag>\n…\n</tag>` |
| `json` | `(value) => string` | Pretty-printed JSON (2-space) |
| `codeBlock` | `(lang, code) => string` | Fenced code block |
| `join` | `(...parts) => string` | Join fragments (strings/Prompts) with blank lines; drops empties |
| `isPrompt` / `toText` | guards / coercion | Detect a `Prompt`; coerce a `Renderable` to text |

**Types:** `Prompt`, `PromptValue`, `Renderable`, `Message`, `Role`, `MessageBuilder`, `Example`, `RequiredVars<S>`, `OptionalVars<S>`, `RenderVars<S>`, `RenderArgs<S>`.

## How it works

`prompt()` parses the template **once** into a small AST (text / variable / if / unless / each) and caches it; `.render()` walks the AST against a scope stack, so `{{#each}}` items and parent variables resolve correctly. The type magic is pure TypeScript: template-literal types read every `{{token}}` out of the string, classify it (plain variable, block key, defaulted, escaped), and build the exact object shape `.render()` accepts — no code generation, no build step.

## Limitations (honest)

- **Type inference needs a string literal.** `prompt(someVariable)` can't infer names — use `render(str, vars)` for fully dynamic templates.
- **Variables used only inside `{{#each}}` are not statically required** (they bind to the iteration item). If such a name is actually a *parent* variable and you forget to pass it, you'll get a runtime "missing variable" error rather than a compile error.
- **One level of `{{#each}}` nesting** is understood by the *type* inference for var-stripping; deeply nested each-blocks still render fine at runtime, the types just won't reason about them.
- This is a **prompt builder, not an API client** — it makes no network calls and holds no keys. Pair it with your provider's SDK.

Pairs well with the rest of the Lacspace AI Kit and with [`@lacspace/validate`](https://www.npmjs.com/package/@lacspace/validate) for validating model output.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/prompt` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/prompt
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
