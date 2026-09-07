# lacspace-license

**Generate a LICENSE, manage per-file licence headers, build THIRD-PARTY-NOTICES, and gate CI — all from the terminal.** A keyless, zero-dependency licence manager for your codebase.

Where [`lacspace-deps`](https://developer.lacspace.com/tools/deps) *audits* the licences you depend on, `lacspace-license` *creates and manages* your own: it writes a filled `LICENSE` file from an SPDX id, stamps idempotent SPDX headers into your source files with the right comment syntax per language, generates a `THIRD-PARTY-NOTICES` document from your installed dependencies, and provides a `check` command that fails CI when any of it drifts.

```bash
npx lacspace-license init MIT --author "Lacspace" --year 2026
npx lacspace-license add "src/**/*.{ts,js}" --id MIT --write
npx lacspace-license check --require-headers
```

## Why it exists

- **Free & keyless** — no account, no API, no telemetry. It only ever reads and writes files on your disk.
- **Zero dependencies** — Node built-ins only. The full licence texts are embedded, so it works completely offline.
- **Local & deterministic** — great in CI: human output by default, `--json` everywhere, and a non-zero exit on any policy violation.
- **Careful** — header insertion is idempotent, shebang-safe, comment-syntax-correct per language, and preserves your EOL style and trailing newline. It never corrupts a file.

## Supported licences

`MIT` · `Apache-2.0` · `BSD-2-Clause` · `BSD-3-Clause` · `ISC` · `MPL-2.0` · `GPL-3.0-only` · `AGPL-3.0-only` · `LGPL-3.0-only` · `Unlicense` · `CC0-1.0` · `LacspaceFree-1.0` (the [Lacspace Free Licence v1.0](https://lacspace.com/licenses)).

Run `lacspace-license list` to see them with categories. Common aliases and deprecated ids (`gpl-3.0`, `apache2`, `bsd3`, `lacspace`, …) resolve automatically.

## Quick start

```bash
# 1. Drop a LICENSE into your project (author/year read from package.json)
npx lacspace-license init MIT

# 2. Stamp a header into every source file
npx lacspace-license add "src/**/*.ts" --write

# 3. Verify in CI
npx lacspace-license check --require-headers
```

## Examples

**Generate a LICENSE**

```bash
$ npx lacspace-license init Apache-2.0 --author "Lacspace" --year 2026
✓ wrote LICENSE · Apache License 2.0
```

**Preview headers before writing (diff)**

```bash
$ npx lacspace-license add "src/**/*.ts" --dry-run
  --- src/index.ts
  + // Copyright (c) 2026 Lacspace
  + // SPDX-License-Identifier: MIT

  2 files to add a header · run again with --write to apply
```

**Add is idempotent — running twice changes nothing**

```bash
$ npx lacspace-license add "src/**/*.ts" --write   # first run: stamps 2 files
$ npx lacspace-license add "src/**/*.ts" --write   # second run: 0 files updated
```

**Refresh the year across a codebase**

```bash
$ npx lacspace-license update "src/**/*.{ts,tsx}" --year 2026 --write
```

**Build a THIRD-PARTY-NOTICES file (production deps only)**

```bash
$ npx lacspace-license notices --prod -o THIRD-PARTY-NOTICES.md
✓ wrote THIRD-PARTY-NOTICES.md · 42 dependencies
```

**CI gate**

```bash
$ npx lacspace-license check --require-headers
◆ lacspace-license check
  ✓ LICENSE file LICENSE
  ✓ detected licence MIT
  ✓ package.json declares MIT
  ✓ headers · 18 files checked, 0 missing
  ✓ all checks passed
# exits non-zero if the LICENSE is missing, mismatched, or any header is absent
```

## Comment syntax per language

Headers are written with the correct comment style for each file:

| Style | Extensions |
| --- | --- |
| `//` | js, jsx, ts, tsx, mjs, cjs, go, rs, java, c/cpp/h, cs, kt, swift, scala, php, dart, proto, … |
| `#` | py, rb, sh, bash, zsh, yaml/yml, toml, r, ps1, tf, ex, Dockerfile, Makefile, … |
| `--` | sql, lua, hs, elm |
| `/* */` | css, scss, less |
| `<!-- -->` | html, xml, svg, vue, svelte, md |

A shebang line (`#!/usr/bin/env node`) is always preserved and the header is inserted after it.

## Library API

Everything the CLI does is available as a fully-typed dual ESM/CJS library:

```ts
import {
  generateLicense, addHeader, updateHeader, removeHeader,
  styleForFile, detectLicense, scanDependencies, renderNotices, checkProject,
} from "lacspace-license";
```

| Export | Signature |
| --- | --- |
| `generateLicense` | `(id: string, fields?: { year?, holder? }) => GeneratedLicense` |
| `fillTemplate` | `(template: string, fields?: FillFields) => string` |
| `styleForFile` | `(path: string) => CommentStyle \| null` |
| `buildHeader` | `(style: CommentStyle, fields: HeaderFields, eol?) => string` |
| `addHeader` | `(content, style, fields) => { changed, content }` (idempotent) |
| `updateHeader` | `(content, style, fields) => { changed, content }` |
| `removeHeader` | `(content, style) => { changed, content }` |
| `hasHeader` / `findHeader` | header detection helpers |
| `detectLicense` | `(text: string) => string \| null` (fuzzy on whitespace/CRLF) |
| `licenseMatches` | `(text: string, expectedId: string) => boolean` |
| `scanDependencies` | `(opts?) => DependencyNotice[]` (reads node_modules) |
| `renderNotices` | `(notices, opts?) => string` (md or txt) |
| `checkProject` | `(opts?) => CheckResult` (LICENSE + headers CI gate) |
| `resolveId` / `metaOf` / `supportedIds` | SPDX metadata helpers |

## CLI reference

```
lacspace-license <command> [args] [options]

Commands
  init <spdx>          Write a filled LICENSE file for an SPDX id
  add <globs...>       Add a licence header to matching source files
  update <globs...>    Refresh the header (year/holder/id) on matching files
  remove <globs...>    Strip the licence header from matching files
  notices              Build THIRD-PARTY-NOTICES from node_modules
  check                CI gate: LICENSE exists, matches package.json, headers
  list                 List supported SPDX ids

Options
  -a, --author <name>    Author name (defaults to package.json author)
      --holder <name>    Copyright holder (defaults to author)
  -y, --year <year>      Copyright year or range (default: current year)
      --id, --spdx <id>  SPDX id for headers/check (default: package.json license)
  -o, --output <file>    Output path (init → LICENSE, notices → THIRD-PARTY-NOTICES.md)
      --src <dir>        Source dir for check --require-headers (default: src)
      --template <str>   Custom header template ({{year}}/{{holder}}/{{id}})
      --require-headers  check: also require a header on every source file
      --prod             notices: production dependencies only
      --no-text          notices: omit each dependency's bundled licence text
  -f, --format <fmt>     notices: md|txt
      --force            init: overwrite an existing LICENSE
      --dry-run          add/update/remove: preview, do not write
  -w, --write            add/update/remove: apply changes to disk
      --json             Machine-readable JSON output
  -h, --help             Show this help
  -v, --version          Print the version
```

`NO_COLOR` is respected.

## Limitations

- **Header detection is anchored at the top of the file** (after any shebang and blank lines). A licence header buried in the middle of a file is not managed — which is by design, so inner comments are never corrupted.
- **`--prod` filtering is a shallow graph walk** from your root `package.json` dependencies; it approximates what a package manager resolves and does not read a lockfile.
- **Licence detection covers the embedded set only.** An unusual or heavily-edited LICENSE may not be recognised (`check` reports it rather than guessing).
- **`init` for copyleft licences** (GPL/AGPL/LGPL/MPL) writes the full canonical text; the per-file "how to apply" notice is included but you still add headers separately with `add`.
- Custom `--template` headers must keep an `SPDX-License-Identifier:` or `Copyright` line so they can be detected on later runs.

## Licence

Published under the **Lacspace Free Licence v1.0** — a free, permissive, source-available licence. See [`LICENSE`](./LICENSE) or <https://lacspace.com/licenses>.

The embedded licence texts are the canonical public texts from the [SPDX License List](https://spdx.org/licenses/); they are reproduced verbatim and remain under their own terms.
