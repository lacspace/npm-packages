<div align="center">

# @lacspace/markdown

**Markdown → HTML in a few KB — safe by default, with a table-of-contents extractor.**

[![npm version](https://img.shields.io/npm/v/@lacspace/markdown?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/markdown)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/markdown?label=minzip)](https://bundlephobia.com/package/@lacspace/markdown)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/markdown)
[![license](https://img.shields.io/npm/l/@lacspace/markdown?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Everything a blog or docs page needs — headings with anchor ids, nested & task lists, fenced code, blockquotes, GFM tables, images and links — rendering to clean HTML with **source HTML escaped by default**. No dependencies, isomorphic.

- ✍️ Headings (anchor ids), nested & task lists, fenced code, blockquotes, **GFM tables**, strikethrough
- 🔒 **Safe by default** — raw HTML in the source is escaped; `javascript:` / `data:` URLs neutralized
- 🧭 `extractHeadings()` / `tableOfContents()` build a (nested) TOC; `slugify()` / `slugifyHeading()` for anchor links
- 📝 `parseFrontmatter()` splits a `---` YAML-ish block into `{ data, content }`
- ✂️ `toPlainText()` / `excerpt()` for meta descriptions & previews
- 🧼 `sanitizeHtml()` to clean untrusted HTML from elsewhere
- 🎛️ Options — `headingIds`, `headingOffset`, `openLinksInNewTab`, `autolinkBareUrls`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

> **New in 1.1.0** — `parseFrontmatter`, `tableOfContents` + `slugifyHeading`, `toPlainText` + `excerpt`, `sanitizeHtml`, and an opt-in `autolinkBareUrls` option for GFM bare-URL autolinking. All additive — existing output and every existing export are unchanged.

## Install

```bash
npm i @lacspace/markdown
```

## Use it

```ts
import { markdownToHtml } from "@lacspace/markdown";

markdownToHtml("# Hello\n\nSome **bold** text & a <script>alert(1)</script>.");
// <h1 id="hello">Hello</h1>
// <p>Some <strong>bold</strong> text &amp; a &lt;script&gt;alert(1)&lt;/script&gt;.</p>
//   ↑ headings get anchor ids; raw HTML is escaped, never executed

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
// flat: [{ level: 1, text: "Getting started", id: "getting-started" }, …]
slugify("Hello, World!"); // "hello-world"

tableOfContents(md);
// nested: [{ level: 1, text: "Getting started", slug: "getting-started", children: [ … ] }]
slugifyHeading("Café déjà vu"); // "café-déjà-vu" (unicode-aware, GitHub-style)
```

### Frontmatter, plain text & excerpts

```ts
parseFrontmatter("---\ntitle: Hello\ntags: [a, b]\n---\n# Body");
// { data: { title: "Hello", tags: ["a", "b"] }, content: "# Body" }

toPlainText("# Hi\n\nSome **bold** [text](/x).");   // "Hi\nSome bold text."
excerpt(longMarkdown, { length: 160 });             // word-boundary preview + "…"
```

### Cleaning untrusted HTML

`markdownToHtml` is already safe (it escapes source HTML). `sanitizeHtml` is for HTML that came from *somewhere else* (a paste, a CMS field) that you want to display:

```ts
sanitizeHtml('<p>ok</p><script>alert(1)</script><a href="javascript:x" onclick="y">z</a>');
// '<p>ok</p><a href="#">z</a>'
```

### GFM bare-URL autolinking (opt-in)

```ts
markdownToHtml("see https://lacspace.com");                          // …see https://lacspace.com (plain)
markdownToHtml("see https://lacspace.com", { autolinkBareUrls: true }); // …<a href="https://lacspace.com">…</a>
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
| `autolinkBareUrls` | `false` | GFM-style autolink bare `https://…` / `www.…` URLs (off by default so output is unchanged) |

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `markdownToHtml` | `(md, options?) => string` | render Markdown to HTML |
| `extractHeadings` | `(md) => { level, text, id }[]` | flat heading outline |
| `slugify` | `(text) => string` | anchor slug (ASCII) |
| `slugifyHeading` | `(text) => string` | GitHub-style slug (unicode-aware) |
| `tableOfContents` | `(src, { minLevel?, maxLevel? }?) => TocNode[]` | **nested** `{ level, text, slug, children }` TOC (unique slugs) |
| `parseFrontmatter` | `(src) => { data, content }` | split a `---` YAML-ish block from the body |
| `toPlainText` | `(src) => string` | strip Markdown to readable prose |
| `excerpt` | `(src, { length?, suffix? }?) => string` | word-boundary plain-text preview |
| `sanitizeHtml` | `(html, { allowedTags?, allowedAttributes? }?) => string` | clean untrusted HTML |

## Security

`markdownToHtml` is **safe by default**: any raw HTML found in the Markdown source is **escaped**, never passed through, so injected `<script>` / `<img onerror>` cannot execute. `href`/`src` URLs are scheme-checked — only `http`, `https`, `mailto`, `tel`, fragments and relative paths survive; `javascript:` / `data:` / `vbscript:` (including control-char-obfuscated variants) become `#`. There is intentionally **no "allow raw HTML" mode** — if you need to display HTML from an untrusted source, run it through `sanitizeHtml` first. `sanitizeHtml` is a pragmatic, dependency-free regex sanitizer (removes script/style/iframe/etc., `on*` handlers, and dangerous URLs); for hostile input in a browser you may still prefer a full DOM-based sanitizer.

Perfect for a Markdown-powered blog — it's what the `blog` template in [`create-lacspace-app`](https://www.npmjs.com/package/create-lacspace-app) uses.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/markdown` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/markdown
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

