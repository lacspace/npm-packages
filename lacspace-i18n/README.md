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

### New in 0.2.0

- **ICU MessageFormat validation** — a real MessageFormat parser (`parseIcu`) plus `checkIcu` / an `icu` command that flags malformed structure, argument mismatches, and any plural/select missing its required `other` branch across locales (without forcing identical plural categories).
- **Format conversion** — read/write **gettext `.po`** alongside JSON, YAML and `.properties`, and convert between any pair: `lacspace-i18n convert messages.po -o en.json`.
- **Auto-sync / fix** — the `sync` command fills every locale with the base's missing keys (a `__MISSING__` marker, or the base value with `--from-base`) while never losing an existing translation.
- **Coverage `--min` gate** — `coverage --min 90` exits non-zero for CI, and now excludes fill markers from the translated count.
- **`findKeyUsage` / `reconcile`** — the code-usage core exposed as small, fs-free functions.

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
- **gettext `.po`** (0.2.0) — a pragmatic subset (`msgid`/`msgstr`/`msgctxt`, multi-line folding, standard escapes) available via the `convert` command and `parsePo`/`serializePo`; `msgid_plural` forms are not expanded.

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
| `sync` | Fill each locale with the base's missing keys (marker or `--from-base` value); `--write` applies |
| `icu` | Deep ICU MessageFormat check: plural/select structure + argument parity per locale |
| `convert` | Convert a locale file between `json` / `yaml` / `properties` / `po` (gettext) |

| Flag | Description |
| --- | --- |
| `-b, --base <locale>` | Base locale to compare against (default: `en`, else the first locale) |
| `--src <dir>` | Scan a source tree for `t()` / `<Trans>` / `$t` key usages |
| `--func <names>` | Comma list of usage funcs/attrs (default `t,$t,i18n.t,i18nKey`) |
| `--ignore <globs>` | Comma list of key prefixes/globs to treat as used (`admin.*,errors.`) |
| `--fail-on <list>` | Exit non-zero on any of `missing,extra,empty,identical,icu,undefined,dead` |
| `-f, --format <fmt>` | `human` (default) `\| json \| md` (`--json` = `-f json`) |
| `--write` | (sort/sync) write changes to disk instead of a dry-run |
| `--fill[=marker]` | (sort) add base keys missing from a locale (marker value, default `""`) |
| `--prune` | (sort/sync) remove keys not present in the base |
| `--indent <n>` | indent width for JSON/YAML/convert output (default `2`) |
| `--min <n>` | (coverage) exit non-zero if any locale is below `n`% coverage |
| `--marker <s>` | (sync/coverage) missing-key marker (default `__MISSING__`) |
| `--from-base` | (sync) fill missing keys with the base **value** instead of a marker |
| `-o, --out <file>` | (convert) write output to a file (else stdout) |
| `--from <fmt>` / `--to <fmt>` | (convert) format override (`json\|yaml\|properties\|po`); inferred from extensions otherwise |
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

**Auto-sync a locale to the base** — fill every missing key (from the base value here) without touching existing translations:

```bash
npx lacspace-i18n sync ./locales --from-base --write
#   /locales/ne.json  +3
#      fill   nav.about, nav.help, footer.copyright
```

**Deep ICU MessageFormat check** — catches a plural missing its `other` branch or a dropped argument, which a plain diff won't:

```bash
npx lacspace-i18n icu ./locales
#   ne  items     target plural {count} is missing the required 'other' branch
#   ne  greeting  argument {name} (simple) is missing in the target
```

**Convert between formats** — including gettext `.po`:

```bash
npx lacspace-i18n convert messages.po -o en.json     # po → json (inferred)
npx lacspace-i18n convert en.json --to po > en.po    # json → po (stdout)
```

**Gate CI on coverage**:

```bash
npx lacspace-i18n coverage ./locales --min 90        # exits 1 if any locale < 90%
```

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
| `findKeyUsage` / `reconcile` | `(code, funcs?) => { used, dynamic }` · `(baseKeys, used, ignore?) => { dead, undefinedKeys }` |
| `sortLocales` / `normalizeFile` / `serialize` | sort/fill/prune + re-serialize |
| `parseIcu` / `isValidIcu` / `checkIcu` | ICU MessageFormat AST + cross-locale structural check |
| `convert` / `parsePo` / `serializePo` | `(text, from, to) => text` + gettext `.po` reader/writer |
| `mergeLocale` / `syncLocales` | fill missing keys from the base without losing translations |
| `localeCoverage` / `coverageReport` / `belowThreshold` | marker-aware coverage + `--min` math |
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
