# lacspace-i18n

**Keep a multi-language app's translations honest.** Find **missing** and **unused** translation keys, **diff** locales against a base, check **interpolation / ICU** consistency, and **sort / normalize** your locale files — for JSON, YAML and `.properties`. Zero runtime dependencies, fully offline, no API key, no telemetry. Exits non-zero on problems so it drops straight into CI.

```bash
npx lacspace-i18n ./locales --base en
# ◆ lacspace-i18n  ./locales
#   base en · 5 keys · layout flat
#
#   Locale  Coverage                miss extra empty ident
#   fr      ████████████ 100.0%     0     0     0     0
#   ne      ███████░░░░░  60.0%     1     1     1     0
#     ne  missing (1)  nav.about  ·  empty (1) bye  ·  extra (1) stale
#   Placeholder mismatches: ne greeting → missing {name}
```

## Why it exists

Translations rot silently: a new key ships in `en` but never lands in `ne`, a translator drops a `{count}` from a plural, a key gets deleted from the base but lingers in ten other files, and dead keys pile up long after the UI that used them is gone. `lacspace-i18n` catches all of that in one pass — locally, with no service to sign up for and nothing sent anywhere.

## Install

```bash
# one-off, no install
npx lacspace-i18n ./locales

# or globally
npm i -g lacspace-i18n

# or as a library
npm i lacspace-i18n
```

## Locale layouts & formats

```
locales/{en,ne,fr}.json          # one file per locale
locales/{en,ne}/common.json      # namespaced — keys become  common:key
```

- **JSON** — nested objects **or** flat dotted keys (`{ "a.b.c": "x" }`).
- **YAML** — a common subset: nested maps, block sequences, sequences of maps, scalars, comments. (No anchors, tags, block scalars, or flow collections — feed those as JSON.)
- **`.properties`** — `key=value` / `key:value`, `#`/`!` comments, `\uXXXX` and `\n\t` escapes, line continuations.

Keys are flattened to a dotted form internally, so a YAML `nav: { home }` and a properties `nav.home=` compare as the same key.

## CLI

```
lacspace-i18n [dir] [options]            # default command: check
lacspace-i18n <command> [dir] [options]
```

| Command | Purpose |
| --- | --- |
| `check` | Full audit: coverage, missing/extra/empty, ICU + optional code scan (default) |
| `missing` | List keys present in the base but missing per locale |
| `coverage` | Per-locale translated-coverage table only |
| `unused` | Dead (defined-not-used) + undefined (used-not-defined) keys — needs `--src` |
| `sort` | Sort / normalize files; `--fill` adds missing, `--prune` drops extras |

| Flag | Description |
| --- | --- |
| `-b, --base <locale>` | Base locale to compare against (default: `en`, else the first locale) |
| `--src <dir>` | Scan a source tree for `t()` / `<Trans>` / `$t` key usages |
| `--func <names>` | Comma list of usage funcs/attrs (default `t,$t,i18n.t,i18nKey`) |
| `--ignore <globs>` | Comma list of key prefixes/globs to treat as used (`admin.*,errors.`) |
| `--fail-on <list>` | Exit non-zero on any of `missing,extra,empty,identical,icu,undefined,dead` |
| `-f, --format <fmt>` | `human` (default) `\| json \| md` (`--json` = `-f json`) |
| `--write` | (sort) write changes to disk instead of a dry-run |
| `--fill[=marker]` | (sort) add base keys missing from a locale (marker value, default `""`) |
| `--prune` | (sort) remove keys not present in the base |
| `--indent <n>` | (sort) indent width for JSON/YAML output (default `2`) |
| `-h, --help` / `-v, --version` | Help / version |

`NO_COLOR` (or a non-TTY stdout) disables ANSI colour. Data goes to **stdout**, the human report and errors to **stderr**.

## Examples

**Coverage at a glance**

```bash
npx lacspace-i18n coverage ./locales
```

**List exactly what a locale is missing** (great for handing to a translator):

```bash
npx lacspace-i18n missing ./locales --json
# { "ne": ["nav.about"], "fr": [] }
```

**Catch dropped interpolations / broken ICU plurals** — the classic bug:

```bash
npx lacspace-i18n check ./locales
#   Placeholder mismatches (1)
#     ne  greeting  missing {name}
```

**Find dead & undefined keys against your source**:

```bash
npx lacspace-i18n unused ./locales --src ./src --ignore "admin.*"
#   undefined — used in code, missing from en (1)   nope.missing
#   dead — defined but never referenced (2)         bye, nav.about
#   note: 1 dynamic t(var) usage(s) unresolved — 'dead' is advisory
```

**Gate a CI build**:

```bash
npx lacspace-i18n check ./locales --fail-on missing,icu,undefined
# exits 1 and prints the failing categories
```

**Sync locale files** — sort every file, fill missing keys with a marker, prune stale ones:

```bash
npx lacspace-i18n sort ./locales --fill="[TODO]" --prune --write
```

Without `--write`, `sort` is a dry-run and just prints what would change.

## Library API

```ts
import { check, loadLocales, extractPlaceholders, sortLocales } from "lacspace-i18n";

const report = check("./locales", { base: "en", src: "./src" });
report.problems;                 // { missing, extra, empty, identical, icu, undefinedKeys, dead }
report.locales[0].coverage;      // 60
```

| Export | Signature |
| --- | --- |
| `check` | `(dir, opts?) => I18nReport` — load a dir and run every check |
| `loadLocales` | `(dir) => LoadResult` — parse a locale dir (flat or namespaced) |
| `compareLocale` / `compareAll` | compare target flat maps against a base |
| `extractPlaceholders` | `(msg) => { tokens: Set<string>, errors: string[] }` |
| `checkPlaceholders` | cross-locale placeholder/ICU consistency |
| `scanDir` / `scanSource` / `crossReference` | find key usages & dead/undefined keys |
| `sortLocales` / `normalizeFile` / `serialize` | sort/fill/prune + re-serialize |
| `flatten` / `unflatten` | nested ⇄ dotted-key round-trip |
| `renderHuman` / `renderMarkdown` / `toJson` | report formatting |
| `parseJson` / `parseYaml` / `parseProperties` | the standalone readers |

Full types (`I18nReport`, `LocaleComparison`, `PlaceholderIssue`, `FileSortResult`, …) ship in `dist/lib.d.ts`.

## What "coverage" counts

`coverage = translated / baseTotal`, where a key is *translated* when it exists in the target locale with a non-empty value. **Empty** strings and **missing** keys both count against you; a value **identical** to the base is counted as translated but flagged separately (often it just hasn't been touched yet).

## Placeholder syntaxes understood

`{name}` · `{{name}}` (i18next) · `%s` `%d` `%1$s` (printf) · ICU `{count, plural, one {…} other {…}}`, `{gender, select, …}`, `{v, number|date|time, …}`. The checker reports **missing/extra** placeholders per locale and **malformed ICU** (unbalanced braces, unknown plural categories, unknown argument types).

## Limitations (honest)

- The **code scan** is regex-based. Dynamic keys (`t(variable)`, `` t(`x.${id}`) `` ) can't be resolved — they're counted as *dynamic usages* and reported as a caveat; use `--ignore` to mark their prefixes as used so they aren't flagged dead/undefined.
- The **YAML** reader is a pragmatic subset (see above) — anchors, tags, block scalars and flow collections are not supported.
- **ICU apostrophe quoting** (`'{'` for a literal brace) is not interpreted, so messages that quote literal braces may mis-report placeholders.
- `unflatten` turns a container whose keys are exactly `0..n-1` back into an array; a locale that genuinely uses those as string keys is a rare edge case.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, permissive, Lacspace-branded.

---

Part of the [Lacspace](https://developer.lacspace.com/tools) free developer tools — keyless, zero-dependency, local-first.
