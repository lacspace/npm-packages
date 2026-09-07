# @lacspace/fixtures

**Typed, deterministic test-data factories.** Define a factory once, then `build()` realistic objects for your tests — with sequences, traits, associations and transient params. Seed it and the same data comes out every run. Zero dependencies, isomorphic, and fully typed — the build-result type is inferred from your `build(ctx)`.

```bash
npm i -D @lacspace/fixtures
```

Works in any test runner (vitest, jest, node:test) or the browser. No global setup, no config file, no plugins.

## Why

Hand-rolling test objects gets repetitive and brittle: every test spells out the same shape, and one field change means editing dozens of literals. A factory captures the shape once and lets each test override only what it cares about. Unlike a CLI data generator, this is a **typed in-code library** — your overrides are checked against the built type, and the result type flows straight into your assertions.

Everything is **deterministic**: values come from a seeded RNG, so `seed(42)` today equals `seed(42)` tomorrow, in CI, on every machine.

## Quick start

```ts
import { defineFactory, seed } from "@lacspace/fixtures";

seed(42); // reproducible across runs

const userFactory = defineFactory({
  build: (ctx) => ({
    id: ctx.sequence,                       // 1, 2, 3, … per build
    name: ctx.pick(["Ada", "Grace", "Linus"]),
    email: `user${ctx.sequence}@example.com`,
    age: ctx.int(18, 65),
    admin: false,
  }),
});

userFactory.build();                        // one user
userFactory.build({ admin: true });         // override a field
userFactory.buildList(3);                   // an array of three
```

The return type of `build()` is inferred — `userFactory.build().age` is a `number`, and `build({ agee: true })` is a type error.

## Overrides

Override any field with a value, a `(ctx) => value` function, or — for object fields — a nested partial that **deep-merges**:

```ts
userFactory.build({ name: "Ada" });
userFactory.build({ age: (ctx) => ctx.int(70, 90) });
postFactory.build({ author: { name: "Ada" } });   // deep-merges into author
```

## Traits

Name a bundle of overrides and switch it on per build:

```ts
const user = defineFactory({
  build: (ctx) => ({ id: ctx.sequence, role: "user", active: true }),
  traits: {
    admin: { role: "admin" },
    suspended: (ctx) => ({ active: false }),
  },
});

user.build({ traits: ["admin"] });
user.withTrait("admin").withTrait("suspended").build();   // chainable
user.withTrait("admin").buildList(5);
```

## Associations

A field can be another factory — built lazily so nesting just works:

```ts
import { defineFactory, assoc } from "@lacspace/fixtures";

const post = defineFactory({
  build: (ctx) => ({
    id: ctx.sequence,
    title: `Post ${ctx.sequence}`,
    author: assoc(userFactory),          // built on demand
    comments: assoc(commentFactory, 3),  // an array of three
  }),
});
```

## Transient params

Params influence the build but never appear in the output:

```ts
const list = defineFactory<{ tags: string[] }, { count: number }>({
  transient: { count: 2 },
  build: (ctx) => ({ tags: ctx.sample(["a", "b", "c", "d"], ctx.params.count) }),
});

list.build({ transient: { count: 4 } });
```

## Sequences & extend

```ts
const emails = sequence((n) => `user${n}@example.com`);
emails(); // user1@example.com
emails(); // user2@example.com

const admin = userFactory.extend({
  build: (ctx) => ({ role: "admin" as const }),   // adds a field, keeps the rest
});
```

Reset the counters (and re-seed) between tests:

```ts
import { seed, resetSequences } from "@lacspace/fixtures";
beforeEach(() => { seed(42); resetSequences(); });
```

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `defineFactory` | `<T,P>(def: FactoryDef<T,P>) => Factory<T,P>` | Define a factory; `T` is inferred from `build`. |
| `Factory.build` | `(overrides?) => T` | Build one object. |
| `Factory.buildList` / `buildMany` | `(n, overrides?) => T[]` | Build many. |
| `Factory.withTrait` | `(name) => TraitBuilder<T>` | Start a chained, trait-preloaded builder. |
| `Factory.extend` | `<U>(def) => Factory<T & U>` | Derive a factory with extra fields/traits/hooks. |
| `Factory.afterBuild` | `(hook) => Factory<T>` | Register a post-build hook. |
| `assoc` | `(factory, count?) => value` | A lazily-built associated factory field. |
| `build` | `(factoryOrDef, overrides?) => T` | One-shot build shortcut. |
| `sequence` | `<T>(fn?) => () => T` | A standalone auto-incrementing generator. |
| `seed` | `(n: number) => void` | Set the base seed for reproducible data. |
| `resetSequences` | `() => void` | Reset all build counters. |
| `makeRng` / `mulberry32` / `hashSeed` | low-level | Deterministic RNG primitives for advanced fixtures. |

The build context (`ctx`) is itself a seeded RNG: `ctx.next()`, `ctx.int(min,max)`, `ctx.float(min,max)`, `ctx.bool(p?)`, `ctx.pick(arr)`, `ctx.sample(arr,n)`, `ctx.uuid()`, plus `ctx.sequence` and `ctx.params`.

## Limitations

- The built-in RNG helpers are a small, composable set — for large realistic datasets to files (CSV/SQL/NDJSON), reach for the [`lacspace-fake`](https://developer.lacspace.com/tools/fake) CLI; this package is the typed, in-test companion.
- Determinism is per base-seed + sequence; if you build outside a `seed()`/`resetSequences()` reset, order affects values (by design).
- Factories are synchronous; async associations aren't awaited (build plain values, resolve promises in your test).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free for commercial and personal use.

Part of the **Lacspace Testing Kit**: [`@lacspace/expect`](https://developer.lacspace.com/packages/expect) · [`@lacspace/spy`](https://developer.lacspace.com/packages/spy) · [`@lacspace/fixtures`](https://developer.lacspace.com/packages/fixtures) · [`@lacspace/snapshot`](https://developer.lacspace.com/packages/snapshot).
