# lacspace-fake

**Keyless, deterministic fake / seed data — schema in, JSON · NDJSON · CSV · SQL out.**

Describe a schema, get realistic rows: names, emails, phones, addresses, prices,
timestamps, UUIDs and more. Reproducible with `--seed` (byte-identical output on
every machine), **Nepal-aware** with `--locale ne`, and it emits ready-to-run
`INSERT` statements so you can seed any database in one command.

```bash
npx lacspace-fake --fields "id:autoincrement,name:fullName,email:email,age:int(18..65)" -n 5
```

## New in 0.2.0

- **Relations / linked tables** — `--relations schema.json` generates several entities where one references another's ids (`ref(users.id)`), with guaranteed referential integrity (every foreign key exists).
- **Template fields** — `full:template({{firstName}} {{lastName}})` interpolates earlier fields and inline generators.
- **`unique(...)` constraint** — `email:unique(email)` guarantees no duplicate values across rows.
- **More locales** — added `es` (Spanish) and `fr` (French) alongside `en` and `ne`.
- **`--ddl`** — for `-f sql`, also emit a `CREATE TABLE` with column types inferred from the data.
- **~15 new generators** — `ulid`, `hexColor`/`rgb`/`hsl`, `semver`, `mimeType`, `fileExt`/`fileName`/`filePath`, `timezone`, `currencyCode`, `creditCardMasked`/`cardBrand`, `iban`, `bic`.

All additive and backward compatible — existing schemas, flags and output are unchanged.

## Why it exists

- **Free & keyless.** No API key, no account, no network calls, no telemetry — runs fully offline.
- **Deterministic.** Same `--seed` ⇒ same rows, forever. Perfect for reproducible test fixtures and CI.
- **Zero dependencies.** Pure Node built-ins. Tiny install, nothing to audit.
- **Schema-driven.** One inline string or a JSON schema file → N rows in the format you need.
- **Seeds databases directly.** `-f sql --table users` gives you escaped, injection-safe `INSERT`s. Pairs with `lacspace-sql`.
- **Nepal-aware.** Romanized Nepali names, districts/provinces, NPR, `+977` mobiles, PAN/VAT numbers.

## Quick start

```bash
# 5 users as pretty JSON
npx lacspace-fake --fields "id:autoincrement,name:fullName,email:email,age:int(18..65)" -n 5 --pretty

# 100 rows as SQL INSERTs, ready to pipe into a database
npx lacspace-fake --fields "id:autoincrement,name:fullName,role:oneOf(admin|user)" -n 100 -f sql --table users

# From a JSON schema, out to a CSV file
npx lacspace-fake --schema users.json -n 50 -f csv -o users.csv

# Nepal / Spanish / French locale
npx lacspace-fake --fields "name:fullName,phone:phone,district:city" --locale ne -n 10
npx lacspace-fake --fields "name:fullName,phone:phone" --locale es -n 5

# Template + unique fields
npx lacspace-fake --fields "id:unique(uuid),first:firstName,handle:template({{first}}-{{int(1..99)}})" -n 5

# SQL with CREATE TABLE DDL
npx lacspace-fake --fields "id:autoincrement,name:fullName,score:float(0..100)" -f sql --table users --ddl

# Linked tables with foreign keys
npx lacspace-fake --relations shop.json -f sql --ddl

# Just five ULIDs
npx lacspace-fake ulid -n 5 --seed 42

# Discover every generator
npx lacspace-fake list
```

## Examples with output

**Inline schema → JSON**

```bash
$ npx lacspace-fake --fields "id:autoincrement,name:fullName,role:oneOf(admin|user)" -n 2 --seed 42 --pretty
[
  { "id": 1, "name": "Charlotte Taylor", "role": "admin" },
  { "id": 2, "name": "Michael Davis", "role": "user" }
]
```

**→ SQL (quotes escaped, injection-safe)**

```bash
$ npx lacspace-fake --fields "id:autoincrement,name:fullName" -n 2 -f sql --table users --seed 1
INSERT INTO "users" ("id", "name") VALUES
  (1, 'Mary Davis'),
  (2, 'Nora Jones');
```

**→ CSV**

```bash
$ npx lacspace-fake --fields "name:fullName,email:email" -n 2 -f csv --seed 3
name,email
Mary Miller,noah.davis27@hotmail.com
Hannah Rodriguez,henryjones@outlook.com
```

**Nepal locale → NDJSON**

```bash
$ npx lacspace-fake --fields "name:fullName,phone:phone,province:state" --locale ne -n 2 --seed 7 -f ndjson
{"name":"Aayush Maharjan","phone":"+9779704425721","province":"Gandaki"}
{"name":"Anish Gurung","phone":"+9779710956696","province":"Karnali"}
```

**JSON schema file** (`users.json`) with nested objects and arrays:

```json
{
  "id": "autoincrement",
  "name": "fullName",
  "email": "email",
  "score": { "type": "int", "min": 1, "max": 100 },
  "tags": { "type": "array", "of": "word", "count": 3 },
  "address": { "type": "object", "properties": { "city": "city", "zip": "zip" } }
}
```

```bash
$ npx lacspace-fake --schema users.json -n 50 -f csv -o users.csv
✓ wrote users.csv (csv)
```

## Field syntax

Inline `--fields` is a comma-separated list of `key:generator` (with optional args):

```
key:generator            name:fullName
key:generator(args)      age:int(18..65)   role:oneOf(admin|user)
```

- Numeric ranges use `..` — `int(18..65)`, `price(10..999)`, `float(0..1)`
- Option lists use `|` — `oneOf(admin|user|guest)`
- Weighted picks use `value:weight` — `weighted(admin:1|user:9)` (a weighted enum)
- Date windows use `..` — `between(2020-01-01..2024-12-31)`
- **Unique** wraps any generator — `email:unique(email)`, `id:unique(int(1..1000000))` — no two rows repeat a value
- **Templates** interpolate `{{...}}` — `full:template({{firstName}} {{lastName}})`, `email:template({{username}}@{{domain}})`

Fields evaluate in order, so a later field can derive from an earlier one:
`firstName:firstName,lastName:lastName,email:email` yields emails built from each row's name.
Inside a `template(...)`, a `{{token}}` that matches an earlier field reuses its value; otherwise it is evaluated as a generator.

## Generators

`firstName · lastName · fullName · gender · age · dateOfBirth · email · username ·
url · domain · ipv4 · ipv6 · mac · password · uuid · slug · phone · phoneLocal ·
street · city · state · country · countryCode · zip · address · latitude · longitude ·
latlng · company · catchphrase · jobTitle · department · productName · price · sku ·
currency · category · color · word · words · sentence · paragraph · lorem · past ·
future · recent · soon · between · timestamp · date · time · int · float · bool ·
oneOf · weighted · digit · autoincrement · nanoid · objectId · pan · vat ·
ulid · hexColor · rgb · hsl · semver · mimeType · fileExt · fileName · filePath ·
timezone · currencyCode · creditCardMasked · cardBrand · iban · bic`

Run `lacspace-fake list` for a live sample of each.

## Relations (linked tables with foreign keys)

A relations schema maps each entity to `{ count, fields }`. A field whose spec is
`ref(<entity>.<field>)` is a **foreign key**, drawn from the already-generated column of
an earlier entity — so every FK is guaranteed to exist. The whole dataset is drawn from
one seed, so it's byte-reproducible.

```json
{
  "users":  { "count": 10, "fields": { "id": "unique(int(1..99999))", "name": "fullName" } },
  "orders": { "count": 30, "fields": { "id": "autoincrement", "userId": "ref(users.id)", "total": "price(5..500)" } }
}
```

```bash
$ npx lacspace-fake --relations shop.json -f sql --ddl --seed 42
CREATE TABLE "users" ( "id" INTEGER NOT NULL, "name" TEXT NOT NULL );
INSERT INTO "users" ("id", "name") VALUES ... ;
CREATE TABLE "orders" ( "id" INTEGER NOT NULL, "userId" INTEGER NOT NULL, "total" REAL NOT NULL );
INSERT INTO "orders" ("id", "userId", "total") VALUES ... ;   -- every userId exists in users
```

Entities must be declared parent-first (a `ref(...)` can only point at an entity above it).
`json` output emits one object of arrays; `sql` emits a block per table; `csv`/`ndjson`
emit one `# <table>` section per entity.

## CLI reference

| Flag | Purpose |
|------|---------|
| `[generator]` | Positional: generate N values of one generator (e.g. `email`, `int(1..100)`) |
| `list` | Print every generator with a sample value |
| `-n, --count <n>` | Number of rows/values (default 10) |
| `-f, --format <fmt>` | `json` (default), `ndjson`, `csv`, `sql` |
| `-t, --table <name>` | Table name for `-f sql` |
| `--ddl` | For `-f sql`: also emit `CREATE TABLE` with inferred column types |
| `--fields <spec>` | Inline schema string |
| `--schema <file>` | JSON schema file (`-` for stdin) |
| `--relations <file>` | JSON relations schema → linked entities with foreign keys (`-` for stdin) |
| `-s, --seed <str>` | Seed for reproducible output (number or any string) |
| `-l, --locale <loc>` | `en` (default), `ne` (Nepal), `es` (Spanish) or `fr` (French) |
| `--pretty` | Pretty-print JSON |
| `-o, --out <file>` | Write to a file instead of stdout |
| `-h, --help` / `-v, --version` | Help / version |

Respects `NO_COLOR`. Data is written to **stdout**; status/errors to **stderr**; exits **non-zero** on any error, so it composes cleanly in scripts and CI.

## Library API

```ts
import {
  parseFields, parseJsonSchema, generateRows, generateValues, formatRows, RNG,
} from "lacspace-fake";

const fields = parseFields("id:autoincrement,name:fullName,email:email,age:int(18..65)");
const rows = generateRows(fields, { count: 3, seed: 42, locale: "en" });
formatRows(rows, { format: "sql", table: "users" });
```

| Export | Signature |
|--------|-----------|
| `parseFields(spec)` | `(input: string) => Field[]` — compile an inline field string (`unique(...)`/`template(...)` aware) |
| `parseJsonSchema(obj)` | `(schema: unknown) => Field[]` — compile a JSON schema object |
| `generateRows(fields, opts)` | `(Field[], { count?, seed?, locale? }) => Record<string, unknown>[]` — enforces `unique` fields |
| `generateValues(spec, opts)` | `(specStr: string, { count?, seed?, locale? }) => unknown[]` |
| `parseRelations(obj)` | `(schema: unknown) => CompiledEntity[]` — compile a relations schema |
| `generateDataset(entities, opts)` | `(CompiledEntity[], opts) => Record<string, Row[]>` — linked data with FKs |
| `generateRelations(obj, opts)` | parse + generate a linked dataset in one call |
| `formatRows(rows, opts)` | `(rows, { format, pretty?, table?, ddl? }) => string` |
| `formatDataset(dataset, opts)` | format a `{ entity: rows }` dataset (JSON object / per-table SQL / sections) |
| `formatValues(values, col, opts)` | scalar-value formatter |
| `toCsv(rows)` / `toSql(rows, table, { ddl? })` | direct formatters |
| `toCreateTable(rows, table)` / `inferSqlType(values)` | DDL builder + column-type inference |
| `compileTemplate(body, compile)` | build a template-field resolver |
| `sqlValue(v)` / `sqlIdent(name)` | SQL escaping primitives |
| `generators` / `callGen(name, ctx, args)` | the generator registry (built-ins + 0.2.0 extras) |
| `RNG` | the seeded mulberry32 PRNG (`int`, `float`, `bool`, `pick`, `weighted`, `uuid`, …) |
| `slugify(str)` | accent/punctuation-safe URL slug |

Types (`Field`, `Spec`, `Format`, `FormatOptions`, `GenContext`, `Locale`, …) are all exported. Ships dual **ESM + CJS** with `.d.ts`.

## Limitations

- Data is **plausible, not real** — it's for tests and demos, never production identities. `creditCardMasked`/`iban`/`bic` are structurally-shaped placeholders, never valid instruments.
- Locales are `en`, `ne`, `es` and `fr`; `en` is generic English/US-ish, not per-country.
- Relations resolve foreign keys from the parent's generated column (guaranteed to exist); a `ref(...)` must point at an entity declared earlier in the schema.
- Determinism holds for a given package version; generator internals may evolve across minor versions.
- Time-based generators (`past`, `future`, `recent`) are anchored to the current clock, so their absolute instants shift day to day (still deterministic within a run given a seed).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, keyless, offline.

Part of the [Lacspace developer tools](https://developer.lacspace.com/tools).
