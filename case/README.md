<div align="center">

# @lacspace/case

**Convert strings between cases — camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title Case & more.**

[![npm version](https://img.shields.io/npm/v/@lacspace/case?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/case)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/case?label=minzip)](https://bundlephobia.com/package/@lacspace/case)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/case)
[![license](https://img.shields.io/npm/l/@lacspace/case?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The string-case toolkit — correct on the tricky inputs (acronyms like `XMLHttpRequest`, numbers like `v2`, mixed separators). One tiny, typed, dependency-free package instead of a grab-bag of one-function modules.

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
| `capitalize` | `Foo` |
| `words(str)` | `["foo","bar"]` — the splitter behind them all |
| `changeCase(str, name)` | runtime case by name |

`words()` splits on spaces, `_ - . /`, camelCase boundaries, acronym boundaries and letter/number boundaries — so every conversion is consistent.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/case` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/case
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

