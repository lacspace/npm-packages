<div align="center">

# @lacspace/csv

**Correct, RFC 4180 CSV parsing & stringifying — quoted fields, escaped quotes, newlines in cells, typed rows.**

[![npm version](https://img.shields.io/npm/v/@lacspace/csv?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/csv)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/csv?label=minzip)](https://bundlephobia.com/package/@lacspace/csv)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/csv)
[![license](https://img.shields.io/npm/l/@lacspace/csv?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> CSV looks trivial and then eats you alive: commas inside quotes, quotes inside quotes, newlines inside cells, CRLF, BOM. This handles the RFC 4180 edge cases correctly, returns typed row objects, and stringifies with minimal quoting — in a few hundred bytes.

- ✅ Full RFC 4180: quoted fields, `""` escaping, embedded newlines, CRLF
- 🧩 `header: true` → array of typed objects; `false` → arrays of strings
- 🔁 `stringify()` quotes only when needed · custom delimiters · `parseAuto()` (comma/tab/semicolon)
- ⚡ zero dependencies · isomorphic

> **New in 1.2.0** — opt-in **type coercion** (`coerce` / `inferValue`), **column mapping** (`mapColumns`: rename / select+reorder / drop), full-**dialect** parsing (custom quote/escape, comments, BOM strip, TSV helpers), a **chunked/streaming** parser (`CsvStreamParser`, `parseStream`, `parseChunks`) that never buffers the whole input, and **strict vs relaxed** ragged-row handling with a typed `CsvError`. All additive — existing `parse`/`stringify`/`parseAuto` behave byte-for-byte as before.

## Install

```bash
npm install @lacspace/csv      # or pnpm add / yarn add / bun add
```

## Parse

```ts
import { parse } from "@lacspace/csv";

parse("name,note\nAda,\"says \"\"hi\"\", and, more\"");
// [{ name: "Ada", note: 'says "hi", and, more' }]

parse<{ id: string; qty: string }>(csvText);        // typed objects
parse(csvText, { header: false });                  // string[][]
```

## Stringify

```ts
import { stringify } from "@lacspace/csv";

stringify([{ name: "Ada", note: "a,b\nc" }]);
// name,note\r\nAda,"a,b\nc"    ← quotes only the field that needs it

stringify(rows, { columns: ["name", "email"], delimiter: ";" });
```

## Type coercion (new)

Parse returns strings by default. Coerce as a separate step — nothing existing changes.

```ts
import { parse, coerce } from "@lacspace/csv";

coerce(parse("id,qty,ok\n007,3,true"), { auto: true });
// [{ id: "007", qty: 3, ok: true }]   ← number + boolean inferred, leading-zero id kept

coerce(rows, { columns: { qty: "number", when: "date" } }); // per-column types
```

Infers `number`, `boolean`, ISO `Date`, and `null`/empty; per-column types are `"string" | "number" | "boolean" | "date" | "auto"`. `inferValue(str)` / `coerceValue(str, type)` expose the single-value primitives.

## Column mapping (new)

```ts
import { mapColumns } from "@lacspace/csv";

mapColumns(rows, { select: ["name", "id"], rename: { id: "ID" }, drop: ["secret"] });
// select + reorder a subset, rename headers, drop columns — pure, on parse or stringify side
```

## Dialects, TSV & BOM (new)

```ts
import { parseDialect, parseTSV, stringifyTSV, stripBom, addBom } from "@lacspace/csv";

parseDialect("a|b\n1|2", { delimiter: "|" });          // pipe-separated
parseDialect("v\n'a\\'b'", { quote: "'", escape: "\\" }); // custom quote + escape
parseDialect("# note\na,b\n1,2", { comment: "#" });     // comment lines skipped
parseTSV("a\tb\n1\t2");                                  // TSV convenience (auto BOM strip)
addBom(stringifyTSV(rows));                              // prepend a BOM for Excel
```

`parseDialect` strips a leading BOM by default and, like `parse`, returns `string[][]` with `header:false`.

## Streaming / chunked (new)

Feed partial strings and get completed rows out — no full-input buffering.

```ts
import { CsvStreamParser, parseStream, parseChunks } from "@lacspace/csv";

const p = new CsvStreamParser();
p.write('id,note\r\n1,"a,');   // []  (row not complete yet)
p.write(' b"\r\n');            // [{ id: "1", note: "a, b" }]
p.end();                       // flush the last record

// or async-iterate a fetch/file stream:
for await (const row of parseStream(response.body)) { /* ... */ }

// parseChunks(chunks) === parse(chunks.join("")) for any chunk boundaries
```

## Strict vs relaxed (new)

```ts
parseDialect(csv, { relaxed: true }); // ragged rows padded/truncated to header width
parseDialect(csv, { strict: true });  // throws CsvError { row, column } on ragged / unterminated
```

## API

| Export | Description |
| --- | --- |
| `parse(text, opts?)` | CSV → objects (or `string[][]` with `header:false`) |
| `stringify(rows, opts?)` | objects / arrays → CSV (Excel-friendly CRLF) |
| `parseAuto(text, opts?)` | auto-detect comma / tab / semicolon |
| `coerce(rows, opts?)` | typed rows — `auto` infer or per-`columns` types |
| `inferValue(str)` · `coerceValue(str, type)` | single-value type inference / coercion |
| `mapColumns(rows, opts)` | rename / select+reorder / drop columns |
| `parseDialect(text, opts?)` | one-shot parse with quote/escape/comment/BOM/strict/relaxed |
| `parseTSV` · `stringifyTSV` · `stripBom` · `addBom` · `BOM` · `DELIMITERS` | TSV & BOM helpers |
| `CsvStreamParser` · `parseChunks(chunks, opts?)` · `parseStream(source, opts?)` | chunked / async-iterator parsing |
| `CsvError` | typed error (`row`, `column`) thrown in strict mode |

Options: `delimiter`, `header`, `skipEmpty`, `trim` (parse); `columns`, `header`, `delimiter`, `eol`, `escapeFormulas` (stringify); `delimiter`, `quote`, `escape`, `comment`, `header`, `skipEmpty`, `trim`, `bom`, `strict`, `relaxed` (dialect/stream); `auto`, `columns`, `nullValues`, `trueValues`, `falseValues` (coerce); `select`, `rename`, `drop` (mapColumns).

### CSV injection (`escapeFormulas`)

When you serialize **untrusted** data, set `escapeFormulas: true`. A cell that begins with `=`, `+`, `-`, `@`, TAB or CR is otherwise treated as a formula by Excel/Google Sheets and can execute on open. With the flag on, such cells are prefixed with a single quote (`'`) so they stay literal text:

```ts
stringify(rows, { escapeFormulas: true }); // recommended for user-supplied data
```

It defaults to `false` to keep existing output byte-for-byte identical.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/csv` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/csv
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

