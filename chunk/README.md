<div align="center">

# @lacspace/chunk

**A tiny text splitter for RAG and long-context prompts — zero dependencies, isomorphic, token-aware.**

[![npm version](https://img.shields.io/npm/v/@lacspace/chunk?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/chunk)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/chunk?label=minzip)](https://bundlephobia.com/package/@lacspace/chunk)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/chunk)
[![license](https://img.shields.io/npm/l/@lacspace/chunk?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The one primitive every retrieval pipeline needs: split documents into overlapping chunks that respect **natural boundaries** — paragraphs, sentences, Markdown structure and code. Bring your own token counter to make it token-aware, with **no hard dependency** on a tokenizer.

- ✂️ **Recursive character splitter** — splits on the highest-level separator that keeps pieces under budget, then merges with overlap
- 🧠 **Token-aware, optionally** — pass a `lengthFn` (e.g. a tiktoken-style counter) and budgets become token budgets, no dependency added
- 📝 **Markdown-aware** — split on heading structure, keep the **breadcrumb** on each chunk, and never split a fenced code block
- 💻 **Code-aware** — best-effort split on top-level boundaries (functions/classes) for js/ts, python, go, java, c/c++, rust and more
- 📐 **Correct offsets** — every chunk carries `{ start, end }` character offsets into the source
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed

## Install

```bash
npm i @lacspace/chunk
```

## Split any text

```ts
import { splitText } from "@lacspace/chunk";

const chunks = splitText(longDocument, { chunkSize: 1000, chunkOverlap: 100 });
// → [{ text, index, start, end }, ...]

for (const c of chunks) {
  await index.upsert({ id: c.index, text: c.text, meta: { start: c.start, end: c.end } });
}
```

A `Chunk` is `{ text, index, start, end }` where `start`/`end` are character offsets, so `source.slice(chunk.start, chunk.end)` always returns the chunk's source text.

## Make it token-aware (no tokenizer dependency)

`chunkSize` is measured with `lengthFn`, which defaults to string length. Pass **any** counter — the character offsets stay exact:

```ts
import { encode } from "gpt-tokenizer"; // or any tokenizer you already use

const chunks = splitText(doc, {
  chunkSize: 512,           // now 512 *tokens*
  chunkOverlap: 64,
  lengthFn: (t) => encode(t).length,
});
```

## Just want strings?

```ts
import { chunks } from "@lacspace/chunk";

chunks("a very long string ...", { chunkSize: 200 }); // → string[]
```

## Markdown with breadcrumbs

Each chunk is prefixed with its heading trail so a retrieved snippet still knows where it came from, and fenced code blocks are kept intact:

```ts
import { splitMarkdown } from "@lacspace/chunk";

const md = `# Guide

## Setup
Install and configure it.

\`\`\`ts
const x = 1;
\`\`\`
`;

splitMarkdown(md, { chunkSize: 800 });
// A chunk's text begins with:  "# Guide > ## Setup\n\nInstall and configure it. ..."
// The code fence is never split across chunks.
```

Turn the prefix off with `includeBreadcrumb: false`, or change the joiner with `breadcrumbSeparator`.

## Sentences & paragraphs

```ts
import { splitBySentences, splitByParagraphs } from "@lacspace/chunk";

splitBySentences("The cat sat. The dog ran! Yes.");
// → 3 chunks, one per sentence

splitBySentences(doc, { chunkSize: 400 });
// → sentences packed into ~400-char chunks

splitByParagraphs(doc); // → one chunk per blank-line-separated paragraph
```

## Code

```ts
import { splitCode } from "@lacspace/chunk";

splitCode(source, { language: "ts", chunkSize: 1500 });
// Splits on top-level boundaries so functions/classes stay whole.
```

`splitCode` is **heuristic** (a lightweight brace/indentation scanner, not a parser) — great for keeping functions together, but it does not guarantee syntactically complete chunks.

## API

| Function | Signature | Returns |
| --- | --- | --- |
| `splitText` | `(text, opts?) => Chunk[]` | Recursive character splitter |
| `chunks` | `(text, opts?) => string[]` | `splitText` as plain strings |
| `splitMarkdown` | `(md, opts?) => Chunk[]` | Heading-aware, breadcrumbed, code-safe |
| `splitCode` | `(code, { language, ... }) => Chunk[]` | Top-level, best-effort |
| `splitBySentences` | `(text, opts?) => Chunk[]` | One sentence per chunk, or packed |
| `splitByParagraphs` | `(text, opts?) => Chunk[]` | One paragraph per chunk, or packed |

**`Chunk`** = `{ text: string; index: number; start: number; end: number }`

**`SplitTextOptions`** — `chunkSize` (default `1000`), `chunkOverlap` (default `100`), `separators` (default `["\n\n", "\n", ". ", " ", ""]`), `lengthFn` (default = string length).

**`SplitMarkdownOptions`** — adds `includeBreadcrumb` (default `true`) and `breadcrumbSeparator` (default `" > "`).

**`SplitCodeOptions`** — `language` (required), plus `chunkSize`/`chunkOverlap` (default `0`)/`lengthFn`.

**`SplitUnitOptions`** (sentences/paragraphs) — optional `chunkSize` to pack units together, `chunkOverlap`, `lengthFn`.

Also exported: `DEFAULT_SEPARATORS`, `DEFAULT_CHUNK_SIZE`, `DEFAULT_OVERLAP`.

## How it works

`splitText` mirrors the well-known recursive-character strategy:

1. Try the highest-priority separator (`"\n\n"`). If the whole text fits `chunkSize`, keep it.
2. Otherwise split on that separator and recurse into any piece still over budget, walking down the separator list (`"\n"` → `". "` → `" "` → character level).
3. **Merge** adjacent pieces back up to `chunkSize`, then keep the trailing pieces of each chunk so the next one overlaps by ~`chunkOverlap`.

Because chunks are tracked as ranges into the original string, separators between merged pieces are preserved and every chunk reports exact character offsets. Budgets are always measured through `lengthFn`, which is what makes token-awareness free.

## Limitations

- **No built-in tokenizer.** Token budgets require you to pass a `lengthFn`; by design there is no dependency on any tokenizer.
- **`splitCode` is heuristic**, not a parser. It uses brace-depth (C-like) or indentation (python/yaml/ruby) scanning and does not track regex literals or template-literal interpolation. It keeps functions together well but won't guarantee valid syntax per chunk.
- **Sentence detection is punctuation-based** (`.`/`!`/`?`) — abbreviations like "Dr." or "e.g." can cause an early break.
- `lengthFn` is assumed **non-decreasing** with string length (true for character counts and typical token counters); a pathological counter could weaken the hard-split fallback.
- Offsets are UTF-16 code-unit indices (JavaScript string indices), matching `String.prototype.slice`.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/chunk` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/chunk
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
