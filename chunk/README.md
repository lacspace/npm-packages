<div align="center">

# @lacspace/chunk

**A tiny text splitter for RAG and long-context prompts — zero dependencies, isomorphic, token-aware.**

[![npm version](https://img.shields.io/npm/v/@lacspace/chunk?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/chunk)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/chunk?label=minzip)](https://bundlephobia.com/package/@lacspace/chunk)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/chunk)
[![license](https://img.shields.io/npm/l/@lacspace/chunk?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The one primitive every retrieval pipeline needs: split documents into overlapping chunks that respect **natural boundaries** — paragraphs, sentences, Markdown structure and code. Bring your own token counter to make it token-aware, with **no hard dependency** on a tokenizer.

> **New in 1.1.0** — batch a whole corpus with [`splitDocuments`](#chunk-a-whole-corpus) (per-chunk `docId` + metadata), clean up tiny fragments with [`mergeSmallChunks`](#merge-tiny-chunks), and get token-ish budgets out of the box with the built-in [`approxTokenLength`](#built-in-approximate-token-counter) / `wordLength` length functions — all still zero-dependency. Fully backward compatible.

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

## Chunk a whole corpus

`splitDocuments` runs any splitter over a list of documents and tags every chunk with which document it came from — exactly what you upsert into a vector store:

```ts
import { splitDocuments } from "@lacspace/chunk";

const chunks = splitDocuments(
  [
    { id: "faq", text: faqMarkdown, metadata: { source: "faq" } },
    { id: "guide", text: guideText },
    "a bare string works too", // id defaults to its array index
  ],
  { chunkSize: 800, chunkOverlap: 80 },
);

// Each chunk is a Chunk plus { docId, docIndex, metadata? }
for (const c of chunks) {
  await store.upsert({ id: `${c.docId}#${c.docIndex}`, text: c.text, ...c.metadata });
}
```

Swap in a different splitter with `splitter` (e.g. `splitMarkdown`); `index` is the global position, `docIndex` is the position within the document, and `start`/`end` stay relative to each document's own text.

## Merge tiny chunks

Fold undersized fragments (a stray heading, a dangling trailing sentence) into a neighbour — a common RAG cleanup step. It only ever **combines**, never splits, so it's safe on any splitter's output:

```ts
import { splitText, mergeSmallChunks } from "@lacspace/chunk";

const raw = splitText(doc, { chunkSize: 500, chunkOverlap: 50 });
const clean = mergeSmallChunks(raw, { minChunkSize: 100, maxChunkSize: 500 });
// chunks below 100 are merged into an adjacent chunk (never exceeding 500)
```

## Built-in approximate token counter

Want token-ish budgets without pulling in a tokenizer? Pass the built-in `approxTokenLength` (or `wordLength` for word budgets) as `lengthFn`:

```ts
import { splitText, approxTokenLength, wordLength } from "@lacspace/chunk";

splitText(doc, { chunkSize: 512, lengthFn: approxTokenLength }); // ~512 approx tokens
splitText(doc, { chunkSize: 200, lengthFn: wordLength });        // ~200 words
```

`approxTokenLength` is a heuristic (word-pieces + punctuation + CJK, blended with a chars-per-token estimate) — close enough for budgeting, but **not** a substitute for your real tokenizer's `encode(t).length` when you need exact counts.

## API

| Function | Signature | Returns |
| --- | --- | --- |
| `splitText` | `(text, opts?) => Chunk[]` | Recursive character splitter |
| `chunks` | `(text, opts?) => string[]` | `splitText` as plain strings |
| `splitMarkdown` | `(md, opts?) => Chunk[]` | Heading-aware, breadcrumbed, code-safe |
| `splitCode` | `(code, { language, ... }) => Chunk[]` | Top-level, best-effort |
| `splitBySentences` | `(text, opts?) => Chunk[]` | One sentence per chunk, or packed |
| `splitByParagraphs` | `(text, opts?) => Chunk[]` | One paragraph per chunk, or packed |
| `splitDocuments` | `(docs, opts?) => DocumentChunk[]` | Batch-chunk a corpus, tag by `docId` |
| `mergeSmallChunks` | `(chunks, opts?) => Chunk[]` | Fold undersized chunks into neighbours |
| `approxTokenLength` | `(text) => number` | Dependency-free approximate token counter (a `LengthFn`) |
| `wordLength` | `(text) => number` | Word counter (a `LengthFn`) |

**`Chunk`** = `{ text: string; index: number; start: number; end: number }`

**`DocumentChunk`** = `Chunk & { docId: string; docIndex: number; metadata?: Record<string, unknown> }`

**`SplitTextOptions`** — `chunkSize` (default `1000`), `chunkOverlap` (default `100`), `separators` (default `["\n\n", "\n", ". ", " ", ""]`), `lengthFn` (default = string length).

**`SplitMarkdownOptions`** — adds `includeBreadcrumb` (default `true`) and `breadcrumbSeparator` (default `" > "`).

**`SplitCodeOptions`** — `language` (required), plus `chunkSize`/`chunkOverlap` (default `0`)/`lengthFn`.

**`SplitUnitOptions`** (sentences/paragraphs) — optional `chunkSize` to pack units together, `chunkOverlap`, `lengthFn`.

**`SplitDocumentsOptions`** — extends `SplitTextOptions` and adds `splitter` (default `splitText`) applied to each document.

**`MergeSmallChunksOptions`** — `minChunkSize` (default `0`), `maxChunkSize` (default `Infinity`), `lengthFn` (default = string length), `joiner` (default `"\n\n"`).

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
- **`approxTokenLength` is an estimate**, tuned for English/Latin + CJK; it is not calibrated to any specific tokenizer and can drift for code, unusual scripts or heavy markup. Use a real tokenizer's `encode(t).length` when you need exact token budgets.
- **`mergeSmallChunks` concatenates chunk text** (it does not re-slice the source), so a merged chunk's `text` may include joiners/breadcrumbs from its parts; its `start`/`end` span the union of the merged pieces.

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
