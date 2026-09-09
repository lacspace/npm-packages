# @lacspace/result

Typed, functional **error handling** for TypeScript — `Result<T, E>` (`Ok`/`Err`) and `Option<T>` (`Some`/`None`), so functions return errors as **values** instead of throwing. Zero dependencies, isomorphic, TypeScript-first.

Everything is a plain-object tagged union plus standalone helper functions — no classes, no prototypes — so it's fully tree-shakeable and trivial to serialise.

```bash
npm i @lacspace/result
```

## Quick start

```ts
import { ok, err, map, andThen, match } from "@lacspace/result";

function parse(s: string) {
  const n = Number(s);
  return Number.isNaN(n) ? err(new Error("not a number")) : ok(n);
}

const result = andThen(parse("21"), (n) => (n > 0 ? ok(n * 2) : err(new Error("not positive"))));

match(result, {
  ok: (n) => console.log("got", n),   // got 42
  err: (e) => console.error(e.message),
});
```

## Result

A `Result<T, E = Error>` is either `{ ok: true, value: T }` or `{ ok: false, error: E }`. Build them with `ok` / `err`, then transform without ever unwrapping:

```ts
map(ok(2), (n) => n + 1);                 // Ok(3)
mapErr(err("boom"), (e) => new Error(e)); // Err(Error)
andThen(ok(4), (n) => ok(Math.sqrt(n)));  // Ok(2) — flatMap, errors short-circuit

unwrap(ok(1));            // 1  (throws on Err)
unwrapOr(err("x"), 0);    // 0
unwrapOrElse(err(404), (code) => code === 404 ? "missing" : "other");
```

## Option

An `Option<T>` is either `{ some: true, value: T }` or `{ some: false }` — a null-safe container for "maybe there's a value":

```ts
import { fromNullable, mapOption, unwrapOptionOr, okOr } from "@lacspace/result";

const port = fromNullable(process.env.PORT); // Some(...) | None
mapOption(port, (p) => Number(p));
unwrapOptionOr(port, "3000");

okOr(fromNullable(user), new Error("no user")); // Option → Result
```

## Turning throws into values

Wrap code that might throw (or a promise that might reject) and get a `Result` back — non-`Error` throws are wrapped in an `Error`:

```ts
import { trySync, tryAsync } from "@lacspace/result";

const parsed = trySync(() => JSON.parse(input));          // Ok(value) | Err(Error)
const fetched = await tryAsync(() => fetch(url));         // from a thunk
const same = await tryAsync(fetch(url));                  // …or a promise directly
```

## Combining

```ts
import { all } from "@lacspace/result";

all([ok(1), ok(2), ok(3)]);    // Ok([1, 2, 3])
all([ok(1), err("x"), ok(3)]); // Err("x") — first failure short-circuits
```

## API

| Export | What |
|---|---|
| `ok(value)` / `err(error)` | Build `Ok<T>` / `Err<E>`. |
| `some(value)` / `none` | Build `Some<T>` / the `None` constant. |
| `fromNullable(v)` | `null`/`undefined` → `None`, else `Some`. |
| `isOk` / `isErr` / `isSome` / `isNone` | Type-narrowing guards. |
| `map(r, fn)` / `mapErr(r, fn)` | Transform the value / the error. |
| `andThen(r, fn)` | Chain a step that itself returns a `Result` (flatMap). |
| `unwrap(r)` | Value, or **throws** the error. |
| `unwrapOr(r, fallback)` / `unwrapOrElse(r, fn)` | Value or a fallback. |
| `match(r, { ok, err })` | Fold both arms into one value. |
| `mapOption(o, fn)` | Transform a `Some`, pass `None` through. |
| `unwrapOption(o)` | Value, or **throws** on `None`. |
| `unwrapOptionOr(o, fallback)` | Value or a fallback. |
| `okOr(o, error)` / `toNullable(o)` | `Option` → `Result` / nullable. |
| `trySync(fn)` | Run a fn, catch throws → `Result<T, Error>`. |
| `tryAsync(fn \| promise)` | Await, catch rejections → `Result<T, Error>`. |
| `all(results)` | `Result<T, E>[]` → `Result<T[], E>`. |

## Why

- **Errors are values** — the type checker forces you to handle failure; no invisible `throw` escaping a signature.
- **Zero dependencies** — nothing to audit, tiny install.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Tree-shakeable** — plain functions over plain objects; bundle only what you import.
- **Serialisable** — a `Result` is just `{ ok, value }` / `{ ok, error }`, safe to log or send over the wire.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.
