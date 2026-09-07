<div align="center">

# @lacspace/case

**Convert strings between cases — camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title Case & more.**

[![npm version](https://img.shields.io/npm/v/@lacspace/case?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/case)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/case?label=minzip)](https://bundlephobia.com/package/@lacspace/case)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/case)
[![license](https://img.shields.io/npm/l/@lacspace/case?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The string-case toolkit — correct on the tricky inputs (acronyms like `XMLHttpRequest`, numbers like `v2`, mixed separators, accented unicode). One tiny, typed, dependency-free package instead of a grab-bag of one-function modules.

- 🐫 `camelCase` · `pascalCase` — `foo_bar` → `fooBar` / `FooBar`
- 🐍 `snakeCase` · `kebabCase` · `constantCase` — `FOO_BAR`, `foo-bar`, `foo_bar`
- 📝 `titleCase` · `sentenceCase` · `capitalize` · `dotCase` · `pathCase`
- 🚂 `headerCase` / `trainCase` · `capitalCase` · `noCase`
- 🎛️ `changeCase(str, name)` — pick the case at runtime; `words(str)` / `splitWords(str)` are the splitters
- 🔎 `isCamelCase`, `isSnakeCase`, … — detect the case (and prove a conversion is a no-op)
- 🌍 Zero dependencies · isomorphic · fully typed

**New in 1.1.0** — three more cases (`headerCase`/`trainCase`, `capitalCase`, `noCase`), a unicode-aware `splitWords()` that keeps digit groups (`v2Point` → `["v2","Point"]`) and splits acronyms (`APIResponse` → `["API","Response"]`), an opt-in **acronym registry** (`registerAcronyms("API","URL")` or per-call `{ acronyms }`) to keep known acronyms upper-cased, and `is<Case>()` detectors. Fully backward compatible — no existing output changed.

## Install

```bash
npm install @lacspace/case      # or pnpm add / yarn add / bun add
```

## Use

```ts
import { camelCase, snakeCase, kebabCase, constantCase, titleCase, changeCase } from "@lacspace/case";

camelCase("foo_bar-baz");        // "fooBarBaz"
snakeCase("fooBarBaz");          // "foo_bar_baz"
kebabCase("XMLHttpRequest");     // "xml-http-request"
constantCase("fooBar");          // "FOO_BAR"
titleCase("hello_world");        // "Hello World"

changeCase("fooBar", "kebab");   // "foo-bar"   ← pick the case at runtime
```

```ts
import {
  headerCase, capitalCase, noCase, splitWords,
  registerAcronyms, isSnakeCase,
} from "@lacspace/case";

headerCase("foo bar");           // "Foo-Bar"   (Train-Case)
capitalCase("foo_bar");          // "Foo Bar"
noCase("fooBar");                // "foo bar"

splitWords("APIResponse");       // ["API", "Response"]
splitWords("v2Point");           // ["v2", "Point"]  (keeps digit groups)
splitWords("v2Point", { splitOnNumbers: true }); // ["v", "2", "Point"]

// Preserve acronyms (opt-in — defaults unchanged)
pascalCase("apiResponse", { acronyms: ["API"] }); // "APIResponse"
registerAcronyms("API", "URL", "ID");             // or register globally
pascalCase("apiUrl");                             // "APIURL"

isSnakeCase("foo_bar");          // true — already correct, conversion is a no-op
```

## API

| Function | Example |
| --- | --- |
| `camelCase` | `fooBar` |
| `pascalCase` | `FooBar` |
| `snakeCase` | `foo_bar` |
| `kebabCase` | `foo-bar` |
| `constantCase` | `FOO_BAR` |
| `dotCase` / `pathCase` | `foo.bar` / `foo/bar` |
| `titleCase` / `sentenceCase` | `Foo Bar` / `Foo bar` |
| `headerCase` / `trainCase` | `Foo-Bar` |
| `capitalCase` / `noCase` | `Foo Bar` / `foo bar` |
| `capitalize` | `Foo` |
| `words(str)` | `["foo","bar"]` — the splitter behind them all |
| `splitWords(str, opts?)` | unicode-aware splitter; keeps digit groups, `splitOnNumbers` option |
| `changeCase(str, name)` | runtime case by name (`camel`,…,`header`,`train`,`capital`,`no`) |
| `isCase(str, name)` / `isCamelCase(str)` … | detect whether a string is already in a case |
| `registerAcronyms(...)` / `getAcronyms()` / `clearAcronyms()` | manage the global acronym registry |

`words()` splits on spaces, `_ - . /`, camelCase boundaries, acronym boundaries and letter/number boundaries — so every conversion is consistent. `splitWords()` is a unicode-aware alternative that understands accented letters and keeps digit groups (`v2`) together by default. The acronym-aware converters (`camelCase`, `pascalCase`, `titleCase`, `sentenceCase`, `capitalCase`, `headerCase`) accept an optional `{ acronyms }` and honour the global registry — off by default, so existing output is unchanged.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/case` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/case
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

