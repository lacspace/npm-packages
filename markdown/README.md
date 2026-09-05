<div align="center">

# @lacspace/markdown

**Markdown → HTML in a few KB — safe by default, with a table-of-contents extractor.**

[![npm version](https://img.shields.io/npm/v/@lacspace/markdown?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/markdown)
[![license](https://img.shields.io/npm/l/@lacspace/markdown?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Everything a blog or docs page needs — headings with anchor ids, nested & task lists, fenced code, blockquotes, GFM tables, images and links — rendering to clean HTML with **source HTML escaped by default**. No dependencies, isomorphic.

## Install

```bash
npm i @lacspace/markdown
```

## Use it

```ts
import { markdownToHtml, extractHeadings, slugify } from "@lacspace/markdown";

const html = markdownToHtml(`
# Getting started

Some **bold** text, a [link](https://lacspace.com) and \`inline code\`.

- a list
  - that nests
- [x] and task items

| Feature | Status |
| ------- | :----: |
| Tables  |   ✅   |

\`\`\`ts
const x = 1;
\`\`\`
`);
```

### A table of contents, for free

```ts
extractHeadings(md);
// [{ level: 1, text: "Getting started", id: "getting-started" }, …]
slugify("Hello, World!"); // "hello-world"
```

## Supports

- **Headings** `#`–`######` with auto anchor `id`s (toggle with `headingIds`, shift with `headingOffset`)
- **Lists** — ordered, unordered, **nested**, and **task lists** (`- [x]`)
- **Fenced code** ` ``` ` with `language-*` class (HTML-escaped)
- **Blockquotes** (nested Markdown inside)
- **GFM tables** with column alignment
- **Inline** — `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[links](…)`, `![images](…)`, `<autolinks>`, hard line breaks
- **Safety** — raw HTML in the source is escaped, not passed through

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `headingIds` | `true` | add slug `id`s to headings |
| `headingOffset` | `0` | shift levels (`1` → `#` becomes `<h2>`) |
| `openLinksInNewTab` | `false` | add `target="_blank" rel="noopener noreferrer"` to external links |

Perfect for a Markdown-powered blog — it's what the `blog` template in [`create-lacspace-app`](https://www.npmjs.com/package/create-lacspace-app) uses.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/markdown` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/markdown
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

