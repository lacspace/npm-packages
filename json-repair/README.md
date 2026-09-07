<div align="center">

# @lacspace/json-repair

**Extract and repair JSON from messy LLM output — zero dependencies.**

[![npm version](https://img.shields.io/npm/v/@lacspace/json-repair?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/json-repair)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/json-repair?label=minzip)](https://bundlephobia.com/package/@lacspace/json-repair)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/json-repair)
[![license](https://img.shields.io/npm/l/@lacspace/json-repair?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Models promise you JSON and hand you JSON wrapped in prose, fenced in ` ```json `, with trailing commas, single quotes, unquoted keys, `True`/`None`, or cut off mid-object. This turns all of that back into valid, parsed data — in a package small enough to drop into any function, edge runtime or bundle. No dependencies, isomorphic, fully typed.

- 🧲 `extractJson` — pull the JSON out of prose and ` ```json ` fences (string-aware, so braces inside strings don't fool it)
- 🩹 `repairJson` — trailing commas, single quotes, unquoted keys, `True/False/None`, `NaN/Infinity`, `//` & `/* */` comments, missing commas, **and truncated output**
- ✅ `parseJson` / `safeParseJson` — extract → repair → parse, with a `fallback` or a never-throwing result
- 🌊 `parsePartial` — best-effort parse of **half-streamed** JSON, so a streaming UI can render fields as they arrive
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed · provider-agnostic & keyless

## Install

```bash
npm i @lacspace/json-repair
```

## The one you'll reach for

```ts
import { parseJson } from "@lacspace/json-repair";

const reply = `Sure! Here's the data:
\`\`\`json
{
  name: 'Ada Lovelace',   // unquoted key + single quotes
  active: True,           // python literal
  scores: [10, 20, 30,],  // trailing comma
}
\`\`\`
Hope that helps!`;

parseJson(reply);
// → { name: "Ada Lovelace", active: true, scores: [10, 20, 30] }
```

`parseJson` runs **extract → repair → `JSON.parse`** for you. Point it at the raw model response — fences, prose and all.

## Never throw: `safeParseJson` and `fallback`

```ts
import { safeParseJson, parseJson } from "@lacspace/json-repair";

const r = safeParseJson<{ ok: boolean }>(model.output);
if (r.ok) use(r.value);
else console.warn("bad JSON:", r.error.message);

// …or supply a fallback and keep the happy path linear:
const cfg = parseJson(model.output, { fallback: { ok: false } });
```

## Streaming? Render as it arrives with `parsePartial`

```ts
import { parsePartial } from "@lacspace/json-repair";

// A chunk that stopped mid-string:
parsePartial('{"title":"Weekly digest","body":"Here is what happe');
// → { title: "Weekly digest", body: "Here is what happe" }

// A field whose value hasn't started yet is simply left out:
parsePartial('{"title":"Weekly digest","body":');
// → { title: "Weekly digest" }
```

Feed it each accumulated buffer as tokens stream in — open strings, arrays and objects are closed on the fly, so you always get a usable object.

## Just the pieces

```ts
import { extractJson, repairJson } from "@lacspace/json-repair";

extractJson('blah blah {"a":1,"b":"} not a brace"} trailing');
// → '{"a":1,"b":"} not a brace"}'   (string-aware — the "}" inside the value is ignored)

repairJson('{"a":1,"b":{"c":2');   // truncated
// → '{"a":1,"b":{"c":2}}'

repairJson('{"a":1,"b":2}');        // already valid → returned byte-for-byte
// → '{"a":1,"b":2}'
```

## API

| Function | Signature | Does |
| --- | --- | --- |
| `extractJson` | `(text: string) => string \| undefined` | Strip ` ```json `/bare ``` fences and prose; return the first balanced `{…}`/`[…]` (or the tail if truncated). `undefined` if none found. |
| `repairJson` | `(str: string) => string` | Fix common breakage and return valid JSON text. Valid JSON is returned unchanged. |
| `parseJson<T>` | `(text: string, opts?: ParseJsonOptions<T>) => T` | Extract + repair + parse. Throws `JsonRepairError` on failure, or returns `opts.fallback` if given. |
| `safeParseJson<T>` | `(text: string, opts?) => { ok: true; value: T } \| { ok: false; error: Error }` | Never-throwing `parseJson`. |
| `parsePartial<T>` | `(text: string) => T \| undefined` | Best-effort parse of incomplete/streaming JSON. |
| `JsonRepairError` | `class extends Error` | Thrown by `parseJson`; carries a `.snippet` of the offending text. |

**`ParseJsonOptions<T>`** — `{ repair?: boolean = true; extract?: boolean = true; fallback?: T }`. Turn `extract` off when your input is already bare JSON; turn `repair` off to parse strictly.

## How it works

`extractJson` runs a small **string-aware scanner**: it strips a code fence if present, finds the first `{` or `[`, then walks forward tracking string state and escapes so a `}` *inside* a string value never closes the structure early. If the input ends before the structure closes (streaming), it returns everything from the opening bracket.

`repairJson` and `parsePartial` share a **lenient recursive-descent reader**. Instead of a pile of regexes, it reads the messy input into a plain JavaScript value — tolerating single quotes, unquoted keys, `//` & `/* */` comments, `True`/`False`/`None`, missing commas, and unterminated strings/objects/arrays — and then `JSON.stringify` re-emits strict JSON. One pass, every fix. Object keys named `__proto__` are dropped, so a malicious payload can't pollute `Object.prototype`.

## Honest limitations

- **Not a spec-strict validator.** The goal is to recover *usable* data from *almost*-JSON, not to reject every deviation. If you need strict validation of the recovered shape, pipe the result through [`@lacspace/validate`](https://www.npmjs.com/package/@lacspace/validate).
- **Non-finite numbers become `null`.** JSON has no `NaN`/`Infinity`, so those (and `undefined`) are normalised to `null`.
- **Unquoted *values* must be recognised literals or numbers.** Unquoted object *keys* are repaired, but an unknown bareword in a value position (e.g. `{status: active}`) is treated as garbage so `parseJson` can honour its fallback/error contract rather than silently coercing junk to a string. Quote such values.
- **Ambiguous missing commas** (`{"a":1 "b":2}`) are repaired; deeply corrupted input where structure itself is lost may parse to something unexpected — always `safeParse` untrusted output.
- **Numbers are IEEE-754.** Very large integers beyond `Number.MAX_SAFE_INTEGER` lose precision, exactly as `JSON.parse` does.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/json-repair` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/json-repair
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
