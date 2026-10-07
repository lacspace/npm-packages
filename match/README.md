# @lacspace/match

Checks whether an object matches a list of conditions such as `{ field: "subject", op: "contains", value: "invoice" }`. Use it for mail rules, saved filters, alerting, feature targeting or any "if all/any of these match, do that" automation, where users build conditions and you store them as JSON. It supports dotted paths, array fields, numbers, dates, and a regex operator with ReDoS guards. It also explains which condition passed or failed, and validates conditions before you save them.

It has no dependencies and runs anywhere: Node 18+, Deno, Bun, workers and browsers.

```ts
import { evaluate, explain, validateConditions } from "@lacspace/match";

const message = {
  from: { name: "Anita K", address: "anita@acme.com" },
  to: [{ address: "me@lacspace.com" }, { address: "sales@lacspace.com" }],
  subject: "Invoice #42 for September",
  size: 2048,
  labels: ["client"],
};

const conditions = [
  { field: "from.address", op: "endsWith", value: "@acme.com" },
  { field: "to.address", op: "equals", value: "sales@lacspace.com" }, // any recipient
  { field: "subject", op: "regex", value: "invoice #\\d+" },
] as const;

validateConditions(conditions); // []
evaluate([...conditions], message); // true
evaluate([...conditions], message, { match: "any" }); // true

explain([{ field: "size", op: "gt", value: 4096 }], message);
// { result: false, match: "all",
//   conditions: [{ index: 0, field: "size", op: "gt", value: 4096, passed: false, actual: 2048 }] }
```

## Operators

| Op | Passes when |
| --- | --- |
| `equals`, `is` | the value equals the field. Strings ignore case (unless `caseSensitive`) and the condition value is trimmed. Numbers and Dates compare numerically, so `"2048"` equals `2048`. On a boolean field, `true`/`"true"`/`"yes"`/`"1"`/`"on"`/`""`/no value mean true and `false`/`"false"`/`"no"`/`"0"`/`"off"` mean false; other words never match. A `null` value (or `equals` with no value) passes when the field is missing. |
| `notEquals`, `isNot` | the opposite of `equals` / `is` |
| `contains`, `startsWith`, `endsWith` | substring tests on strings (numbers, booleans and Dates are turned into text first) |
| `notContains` | the opposite of `contains` |
| `gt`, `gte`, `lt`, `lte` | numeric comparison. Works with numbers, numeric strings, Dates and ISO date strings (`2026-09-01`, `2026-09-01T10:00:00Z`). Anything else fails. |
| `between` | `min <= field <= max`, with `value: [min, max]` or `{ min, max }`, using the same comparison |
| `in` | the field equals any item of `value` (an array, or a comma-separated string) |
| `notIn` | the opposite of `in` |
| `exists` | the field is present and not null. An empty array counts as missing. |
| `notExists` | the opposite of `exists` |
| `regex` | the pattern matches (see "Safe regex") |

**Arrays.** When the field is an array, or a path runs through an array (`to.address`), a positive op passes when **any element** passes. Negative ops (`notEquals`, `isNot`, `notContains`, `notIn`, `notExists`) are the exact opposite, so they pass only when **no element** matches. A missing field fails positive ops and passes negative ones.

**Paths.** `a.b.c` reads nested properties, `to.0.address` indexes an array, and `to.address` collects `address` from every element. Only own properties are read, and paths containing `__proto__`, `prototype` or `constructor` never resolve.

## API

- **`evaluate(conditions, record, opts?)`** returns a boolean.
- **`explain(conditions, record, opts?)`** returns `{ result, match, conditions: [{ index, field, op, value, passed, actual, error? }] }`. `error` says why a condition couldn't be evaluated (unknown op, unsafe regex, bad `between` value), and that condition fails.
- **`opts`**:
  - `match`: `"all"` (default) or `"any"`.
  - `getField(record, path)`: your own resolver, for computed or renamed fields.
  - `caseSensitive`: default false.
  - `emptyResult`: the result for an empty list. Default `false`, so an empty rule never matches everything.
  - `regex`: `{ maxPatternLength?, maxInputLength? }`.
- **`validateConditions(conditions, { regex?, maxConditions? })`** returns `[{ index, field?, message }]`, empty when everything is usable. It checks: the list is an array of at most `maxConditions` (default 100) objects; the field is a safe path; the op is known; ops that need a value have one; string ops have a non-empty string or number (an empty `contains` would match everything); order ops and `between` get comparable values with `min <= max`; `in`/`notIn` get a non-empty list; and regex patterns pass the safety check and compile.
- **Helpers**: `getPath(record, path)`, `splitPath`, `isSafePath`, `compare(a, b)`, `OPS`, `checkPattern(pattern, maxLength?)`, `compileSafe(value, caseSensitive?, opts?)`, `testCapped(re, input, max?)`.

None of these functions throw, whatever you pass in.

```ts
// Computed fields: the Lacspace Mail app matches "from" against "name address" and size in KB.
evaluate(rule.conditions, message, {
  match: rule.match,
  getField: (m, f) =>
    f === "from" ? `${m.from.name ?? ""} ${m.from.address}` :
    f === "size" ? Math.ceil((m.size ?? 0) / 1024) :
    getPath(m, f),
});
```

## Safe regex

User-supplied regular expressions can freeze a server through catastrophic backtracking (ReDoS). The `regex` op limits that risk:

- **Pattern length**: at most 256 characters by default (`regex.maxPatternLength`).
- **Nested quantifiers rejected**: a group containing `*`, `+` or `{n,m}` that is itself followed by `*`, `+` or `{…}`, at any depth. For example `(a+)+`, `(a*)*`, `((ab)+){2,}`, `(?:x+y)*` and `((a+)?)+`. Quantifier characters inside `[…]` and escaped ones like `\+` don't count.
- **Backreferences rejected**: `\1` to `\9` and `\k<name>`.
- **Input length cap**: only the first 10 000 characters of the field are tested (`regex.maxInputLength`).
- **Flags**: the value can be `"pattern"`, `"/pattern/flags"` or a `RegExp`. Only `i`, `m`, `s` and `u` are kept. `g` and `y` are dropped so repeated tests give the same answer. `i` is added unless `caseSensitive` is set.
- A pattern that fails these checks, or doesn't compile, makes the condition fail (and `explain`/`validateConditions` say why). Compiled patterns are cached (500 entries).

These are heuristics, not a proof of linear time. Alternation inside a repeated group, such as `(a|aa)+`, and long runs of adjacent quantifiers, such as `\d+\d+\d+x`, are still accepted. The input cap bounds how slow they can be. If users are untrusted and the cap is too high for your latency budget, lower `maxInputLength`, or run matching in a worker with a timeout.

## Limits

- Strings are compared as-is (after lowercasing). There is no accent folding, Unicode normalisation or locale collation.
- `gt`/`lt` don't compare non-numeric strings alphabetically. They only compare numbers and dates.
- Date strings must be ISO-like (`YYYY-MM-DD…`). Other formats aren't parsed.
- Nested arrays are flattened up to 10 levels, and path fan-out stops at 10 000 values.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
