<div align="center">

# @lacspace/snapshot

**Zero-dependency snapshot testing — a deterministic value serializer plus inline & file snapshot matchers. Isomorphic, runner-agnostic, fully typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/snapshot?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/snapshot)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/snapshot?label=minzip)](https://bundlephobia.com/package/@lacspace/snapshot)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/snapshot)
[![license](https://img.shields.io/npm/l/@lacspace/snapshot?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The serializer is the hard part of snapshot testing. `@lacspace/snapshot` gives you a **stable, deterministic, pretty** serializer that turns any value into the same string every time — **sorted keys**, circular-safe, plugin-extensible — plus the two matchers built on top: an isomorphic **inline** matcher and a Node-only **file** matcher. No test runner required.

> **New in 1.1.0** — three isomorphic, opt-in additions for taming volatile data: **property matchers** (`serializeWithMatchers` + `any`, `stringMatching`, …) that validate a shape while rendering volatile fields as stable labels; **redaction** (`redact`) that strips ids/timestamps/tokens by key, path or predicate before serializing; and **obsolete-snapshot detection** (`findObsoleteSnapshots`, `pruneSnapshots`) over a `.snap` name→snapshot map. All additive — the default `serialize` output is byte-for-byte unchanged.

- 🧊 **Deterministic** — object keys are sorted, and `Map`/`Set` entries are sorted too, so property/insertion order never changes the snapshot
- 🔁 **Circular-safe** — cycles render as `[Circular]` instead of throwing
- 🧩 **Every type** — primitives, `NaN`/`-0`/`bigint`/`symbol`, arrays, plain objects, class instances (named), `Map`, `Set`, `Date`, `RegExp`, `Error`, functions, typed arrays
- 🔌 **Pluggable** — jest-snapshot-style custom serializers, per-call or global
- 🌍 **Isomorphic core** — the serializer and inline matcher have **no `node:` imports**; the file matcher lives in the separate `@lacspace/snapshot/node` subpath
- 🧪 **Runner-agnostic** — works with vitest, jest, node:test, or plain assertions
- 📦 Zero dependencies · fully typed

## Install

```bash
npm i -D @lacspace/snapshot
```

## Serialize anything, deterministically

```ts
import { serialize } from "@lacspace/snapshot";

serialize({ b: 2, a: 1 });
// Object {
//   "a": 1,
//   "b": 2,
// }
```

Keys are sorted, so `{ a, b }` and `{ b, a }` produce the **same** string. Same for `Set` and `Map`:

```ts
serialize(new Set([3, 1, 2])) === serialize(new Set([1, 2, 3])); // true
```

## Handles the tricky values

```ts
import { serialize } from "@lacspace/snapshot";

class Point { constructor(public x: number, public y: number) {} }

serialize({
  n: NaN,
  neg0: -0,
  big: 10n,
  sym: Symbol("id"),
  when: new Date("2021-01-01T00:00:00.000Z"),
  re: /ab+c/gi,
  pt: new Point(1, 2),
  bytes: new Uint8Array([1, 2, 3]),
});
// Object {
//   "big": 10n,
//   "bytes": Uint8Array [
//     1,
//     2,
//     3,
//   ],
//   "n": NaN,
//   "neg0": -0,
//   "pt": Point {
//     "x": 1,
//     "y": 2,
//   },
//   "re": /ab+c/gi,
//   "sym": Symbol(id),
//   "when": 2021-01-01T00:00:00.000Z,
// }
```

## Circular references just work

```ts
const node = { name: "a" } as any;
node.self = node;

serialize(node);
// Object {
//   "name": "a",
//   "self": [Circular],
// }
```

## Inline snapshots (isomorphic)

```ts
import { toMatchInlineSnapshot } from "@lacspace/snapshot";

// Pass — returns { pass: true, ... }
toMatchInlineSnapshot({ a: 1 }, 'Object {\n  "a": 1,\n}');

// Omit the expected arg the first time — it never fails and hands you the
// snapshot to paste (see result.message / result.actual):
const { actual } = toMatchInlineSnapshot({ a: 1 });
// actual === 'Object {\n  "a": 1,\n}'

// Mismatch throws SnapshotMismatchError with a - Expected / + Received diff:
toMatchInlineSnapshot({ a: 1 }, 'Object {\n  "a": 2,\n}'); // throws

// ...or opt out of throwing and inspect the result yourself:
const r = toMatchInlineSnapshot({ a: 1 }, "wrong", { throwOnMismatch: false });
r.pass; // false
```

Only the **leading/trailing whitespace** of `expected` is ignored, so you can indent template literals freely; internal content must match exactly.

## File snapshots (Node only)

```ts
import { toMatchSnapshot } from "@lacspace/snapshot/node";

// First run creates __snapshots__/<thisfile>.snap; later runs compare.
toMatchSnapshot(result, { file: import.meta.filename, name: "renders user card" });

// Update the stored snapshot on purpose:
//   UPDATE_SNAPSHOTS=1 <your test command>
// or:
toMatchSnapshot(result, { file: import.meta.filename, name: "renders user card", update: true });
```

The `.snap` file is a jest-style CommonJS module (`exports[\`name\`] = \`...\`;`) and is re-parseable with `parseSnapshotFile`. A mismatch throws `FileSnapshotMismatchError` with a descriptive line diff.

> `import.meta.filename` is available on Node ≥ 20; on older runtimes use `fileURLToPath(import.meta.url)` (ESM) or `__filename` (CJS).

## Custom serializers (plugins)

Jest-`serialize`-style plugins: `{ test(value), serialize(value, ctx) }`. Register per-call or globally.

```ts
import { serialize, addSerializer } from "@lacspace/snapshot";

// Per call:
serialize(new URL("https://x.dev/p?q=1"), {
  serializers: [{ test: (v) => v instanceof URL, serialize: (v) => `URL<${(v as URL).pathname}>` }],
});
// URL</p>

// Global (applies to every serialize / matcher call). ctx.print recurses:
const remove = addSerializer({
  test: (v) => v instanceof Headers,
  serialize: (v, ctx) => `Headers ${ctx.print(Object.fromEntries((v as Headers).entries()))}`,
});
remove(); // unregister
```

## Property matchers — stabilise volatile fields *(new in 1.1.0)*

Embed matcher tokens in an expected **shape** and pass it to `serializeWithMatchers`. Matched fields (ids, dates, random tokens) are validated *and* rendered as stable labels, so the snapshot never changes; everything else serializes normally.

```ts
import { serializeWithMatchers, any, stringMatching } from "@lacspace/snapshot";

const { pass, actual, errors } = serializeWithMatchers(
  { id: crypto.randomUUID(), name: "Ada", createdAt: new Date() },
  { id: any(String), createdAt: any(Date) },
);
// pass === true, errors === []
// actual:
// Object {
//   "createdAt": Any<Date>,
//   "id": Any<String>,
//   "name": "Ada",
// }
```

Available matchers: `anything()`, `any(Constructor)`, `stringMatching(str|RegExp)`, `stringContaining(str)`, `closeTo(n, precision?)`, `arrayContaining([...])`, `objectContaining({...})`. A literal (non-matcher) leaf in the shape must match strictly. On a mismatch, `pass` is `false`, `errors` lists each failure, and the unsatisfied field keeps its real value so the diff stays meaningful.

## Redact volatile values *(new in 1.1.0)*

`redact` returns a deep copy with selected slots replaced by a stable placeholder — by key name, dot-path (with `*` wildcards) or a predicate — so you can strip timestamps/ids/tokens before snapshotting without describing each field.

```ts
import { redact, serialize } from "@lacspace/snapshot";

serialize(redact(payload, {
  keys: ["id", /token/i],          // by property name (string or RegExp)
  paths: ["items.*.createdAt"],    // by dot-path, `*` = one segment
  predicate: (v) => v instanceof Date,
  replacement: "[redacted]",        // default; may be a fn ({ value, key, path }) => ...
}));
```

It is circular-safe, never mutates the input, and walks plain objects & arrays only (a `Map`/`Set`/`Date`/class instance is passed through by reference unless the slot itself is redacted).

## Obsolete-snapshot detection *(new in 1.1.0)*

Pure helpers over the `name → snapshot` map from `parseSnapshotFile` — compare stored keys against the keys used in a run, then prune.

```ts
import { findObsoleteSnapshots, pruneSnapshots, parseSnapshotFile, serializeSnapshotFile } from "@lacspace/snapshot";

const stored = parseSnapshotFile(snapFileText);
const report = findObsoleteSnapshots(stored, usedKeys); // { obsolete, missing, matched, storedCount, usedCount }
if (report.obsolete.length) {
  const cleaned = serializeSnapshotFile(pruneSnapshots(stored, usedKeys)); // write back
}
```

## API

### `@lacspace/snapshot` (isomorphic, no `node:` imports)

| Export | Signature | Purpose |
| --- | --- | --- |
| `serialize` | `(value: unknown, options?: SerializeOptions) => string` | Deterministic, pretty, circular-safe serialization with sorted keys |
| `toMatchInlineSnapshot` | `(value: unknown, expected?: string, options?: InlineSnapshotOptions) => InlineSnapshotResult` | Compare against an inline string; returns the snapshot when `expected` is omitted; throws on mismatch by default |
| `addSerializer` | `(plugin: SerializerPlugin) => () => void` | Register a global plugin; returns a remover |
| `getSerializers` | `() => SerializerPlugin[]` | Snapshot of the current global plugins |
| `resetSerializers` | `() => void` | Clear all global plugins (handy in tests) |
| `serializeSnapshotFile` | `(map: Record<string,string>) => string` | Render a `.snap` file body from a name→snapshot map |
| `parseSnapshotFile` | `(content: string) => Record<string,string>` | Parse a `.snap` file back into a name→snapshot map |
| `lineDiff` | `(expected: string, received: string) => string` | Minimal LCS line diff used in messages |
| `mismatchMessage` | `(label, expected, received) => string` | A labelled `- Expected` / `+ Received` message |
| `SnapshotMismatchError` | `class extends Error` | Thrown by `toMatchInlineSnapshot`; `.result` holds the `InlineSnapshotResult` |
| `serializeWithMatchers` | `(value: unknown, shape: unknown, options?: SerializeOptions) => MatchResult` | Validate against a shape of matcher tokens; matched volatile fields render as stable labels *(1.1.0)* |
| `anything` | `() => PropertyMatcher` | Matches any value except `null`/`undefined` *(1.1.0)* |
| `any` | `(constructor: unknown) => PropertyMatcher` | Matches by `typeof` (primitives) or `instanceof` *(1.1.0)* |
| `stringMatching` | `(pattern: string \| RegExp) => PropertyMatcher` | Matches a string matching a substring/regex *(1.1.0)* |
| `stringContaining` | `(substring: string) => PropertyMatcher` | Matches a string containing a substring *(1.1.0)* |
| `closeTo` | `(expected: number, precision?: number) => PropertyMatcher` | Matches a number within `10**-precision/2` *(1.1.0)* |
| `arrayContaining` | `(items: readonly unknown[]) => PropertyMatcher` | Matches an array containing each item *(1.1.0)* |
| `objectContaining` | `(shape: Record<string,unknown>) => PropertyMatcher` | Matches an object containing each key/value *(1.1.0)* |
| `isMatcher` | `(value: unknown) => value is PropertyMatcher` | Type guard for matcher tokens *(1.1.0)* |
| `redact` | `(value, options?: RedactOptions) => unknown` | Deep copy with volatile slots replaced by a placeholder (by key/path/predicate) *(1.1.0)* |
| `findObsoleteSnapshots` | `(stored: Record<string,string>, used: Iterable<string>) => ObsoleteReport` | Compare stored vs used snapshot keys *(1.1.0)* |
| `pruneSnapshots` | `(stored: Record<string,string>, used: Iterable<string>) => Record<string,string>` | Copy of the map with obsolete keys removed *(1.1.0)* |

`SerializeOptions`: `{ indent?: number (2), maxDepth?: number (∞), printFunctionNames?: boolean (true), serializers?: SerializerPlugin[] }`.
`MatchResult`: `{ pass: boolean; actual: string; errors: string[] }`. `RedactOptions`: `{ keys?: Array<string|RegExp>; paths?: string[]; predicate?: (value, key, path) => boolean; replacement?: string | (ctx) => unknown }`. `ObsoleteReport`: `{ obsolete: string[]; missing: string[]; matched: string[]; storedCount: number; usedCount: number }`.
`SerializerPlugin`: `{ test(value): boolean; serialize(value, ctx): string }` where `ctx = { indent, indentation, depth, print(child) }`.

### `@lacspace/snapshot/node` (Node-only)

Re-exports everything above, plus:

| Export | Signature | Purpose |
| --- | --- | --- |
| `toMatchSnapshot` | `(value: unknown, options: FileSnapshotOptions) => FileSnapshotResult` | Create/compare/update a named snapshot in a `.snap` file next to `options.file` |
| `snapshotPathFor` | `(file: string) => string` | Resolve the `__snapshots__/<basename>.snap` path for a test file |
| `FileSnapshotMismatchError` | `class extends Error` | Thrown by `toMatchSnapshot`; `.result` holds the `FileSnapshotResult` |

`FileSnapshotOptions`: `SerializeOptions & { file: string; name: string; update?: boolean }`. Updating also triggers via the `UPDATE_SNAPSHOTS` env var (any value except `""`, `"0"`, `"false"`).

## Determinism notes / behaviour

- **Object keys** are sorted (string keys, then enumerable symbol keys).
- **`Map` and `Set`** entries are sorted by their serialized form, so they are order-independent. This is intentional and differs from jest's `pretty-format`, which preserves insertion order.
- **`Date`** renders as its ISO string; invalid dates render as `Date { Invalid Date }`.
- **`maxDepth`** collapses values below the limit to `[Object]` / `[ClassName]` / `[Array]` etc.

## Limitations

- Not a drop-in jest matcher — this is a runner-agnostic function API you call yourself (no automatic `.snap` cleanup of obsolete keys, no `--ci` guard). Wire it into `expect.extend` or your runner if you want fluent syntax.
- `.snap` files are compatible with the jest *format* but not a byte-for-byte match (header line differs; entries are written with sorted keys).
- The serializer walks values eagerly; extremely large graphs are held in memory while formatting.
- Getters that throw render as `[Thrown: ...]` rather than failing the whole serialization.
- No async serializers — plugins are synchronous.
- **Property matchers / redaction** descend into plain objects and arrays only. A matched *slot* holding a `Map`/`Set`/`Date`/class instance is handled, but `redact` will not recurse *inside* those containers (it passes them through by reference); `serializeWithMatchers` preserves an instance's prototype label but only rewrites the plain keys named in the shape.
- `findObsoleteSnapshots`/`pruneSnapshots` are pure map operations — collecting the "used" keys and writing the pruned map back to disk is left to you (no runner hook or automatic cleanup).

## License

Lacspace Free Licence v1.0 — see [LICENSE](https://github.com/lacspace/npm-packages/blob/main/LICENSE).
