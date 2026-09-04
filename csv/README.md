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

## API

| Export | Description |
| --- | --- |
| `parse(text, opts?)` | CSV → objects (or `string[][]` with `header:false`) |
| `stringify(rows, opts?)` | objects / arrays → CSV (Excel-friendly CRLF) |
| `parseAuto(text, opts?)` | auto-detect comma / tab / semicolon |

Options: `delimiter`, `header`, `skipEmpty`, `trim` (parse); `columns`, `header`, `delimiter`, `eol`, `escapeFormulas` (stringify).

### CSV injection (`escapeFormulas`)

When you serialize **untrusted** data, set `escapeFormulas: true`. A cell that begins with `=`, `+`, `-`, `@`, TAB or CR is otherwise treated as a formula by Excel/Google Sheets and can execute on open. With the flag on, such cells are prefixed with a single quote (`'`) so they stay literal text:

```ts
stringify(rows, { escapeFormulas: true }); // recommended for user-supplied data
```

It defaults to `false` to keep existing output byte-for-byte identical.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
