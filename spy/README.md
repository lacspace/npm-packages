<div align="center">

# @lacspace/spy

**Spies, stubs, mocks and deterministic fake timers — zero dependencies, isomorphic, runner-agnostic.**

[![npm version](https://img.shields.io/npm/v/@lacspace/spy?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/spy)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/spy?label=minzip)](https://bundlephobia.com/package/@lacspace/spy)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/spy)
[![license](https://img.shields.io/npm/l/@lacspace/spy?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The test-double toolkit that doesn't care which runner you use. Record calls, program return/throw/resolve/reject behaviour, wrap or replace real methods, mock whole objects and freeze time — all with **one tiny dependency-free package** that works the same in Vitest, Jest, node:test, Mocha, Bun, Deno **and the browser**.

> **New in 1.1.0** — **argument matchers** (`any`, `anything`, `predicate`, `stringMatching`, `objectContaining`, `arrayContaining`) usable anywhere a value is expected, including nested; richer **call inspection** (`.returnValues`, `.nthCall(n)`, `.nthCalledWith(n, …)`, `.calledOnceWith(…)`); two more **once-queue** behaviours (`.rejectsOnce`, `.callsFakeOnce`); and **`resetAll()`** to wipe the history of every active `spyOn`/`stub` without restoring them. All additive — nothing existing changed.

- 🕵️ **Spies** — callable recorders with `.calls`, `.calledWith(...)` (deep equal), `.results`, and behaviour programming (`.returns`/`.throws`/`.resolves`/`.rejects`/`.callsFake`)
- 🎬 **Once-queues** — `.returnsOnce`/`.resolvesOnce`/`.throwsOnce`/`.rejectsOnce`/`.callsFakeOnce` consumed FIFO before falling back to the default
- 🎯 **Argument matchers** — `any`/`anything`/`predicate`/`stringMatching`/`objectContaining`/`arrayContaining` compose anywhere a value is expected (nested too)
- 🔎 **Call inspection** — `.returnValues`, `.nthCall(n)`, `.nthCalledWith(n, …)`, `.calledOnceWith(…)`
- 🩹 **spyOn / stub** — wrap a method (call-through) or replace it entirely, with getter/setter support, and `.restore()` to put the original back
- 🧱 **Mocks** — turn every function on an object into a spy, or auto-mock an interface you only partially exercise
- ⏱️ **Fake timers** — deterministic `setTimeout`/`setInterval`/`Date` with `.tick`, `.runAllTimers`, `.runOnlyPendingTimers`, `.setSystemTime`
- 🌍 Zero dependencies · isomorphic (Node ≥18, browser, edge, serverless) · fully typed, signatures preserved

## Install

```bash
npm i @lacspace/spy
```

## Spy on calls

```ts
import { spy } from "@lacspace/spy";

const onClick = spy();
onClick({ x: 1 }, "left");

onClick.called;              // → true
onClick.callCount;           // → 1
onClick.calls;               // → [[{ x: 1 }, "left"]]
onClick.calledWith({ x: 1 }, "left"); // → true  (deep equal)
onClick.firstCall;           // → [{ x: 1 }, "left"]
```

## Wrap a real implementation (types preserved)

```ts
const add = spy((a: number, b: number) => a + b);
add(2, 3);           // → 5  (real impl runs)
add.calledWith(2, 3); // → true
add.results;          // → [{ type: "return", value: 5 }]
```

## Program behaviour

```ts
const load = spy();

load.returns(42);
load();                       // → 42

load.throws(new Error("nope"));
load();                       // throws Error: nope

load.resolves({ ok: true });
await load();                 // → { ok: true }

load.callsFake((n: number) => n * 10);
load(2);                      // → 20
```

## Queue one-shot behaviour (FIFO)

```ts
const next = spy().returns("default");
next.returnsOnce("a").returnsOnce("b");

next(); // → "a"
next(); // → "b"
next(); // → "default"
next(); // → "default"
```

## Match arguments flexibly

```ts
import { spy, any, anything, objectContaining, stringMatching } from "@lacspace/spy";

const save = spy();
save(42, { user: "ada", role: "admin" });

// Matchers slot in anywhere a value is expected — including nested.
save.calledWith(any(Number), objectContaining({ user: "ada" })); // → true
save.calledWith(any(String), anything());                        // → false

// Also: any(Date) · predicate(fn, "desc") · stringMatching(/re/) · arrayContaining([...])
save.nthCalledWith(1, any(Number), objectContaining({ role: stringMatching("adm") })); // → true
```

## Inspect calls

```ts
const parse = spy((n: number) => n * 2);
parse(2); parse(5);

parse.returnValues;         // → [4, 10]  (throws are skipped)
parse.nthCall(2);           // → [5]      (1-based)
parse.nthCalledWith(1, 2);  // → true
parse.calledOnceWith(2);    // → false    (called twice)
```

## spyOn / stub existing methods

```ts
import { spyOn, stub } from "@lacspace/spy";

const db = { save: (row: object) => "id-1" };

// spyOn: records AND calls through to the real method
const save = spyOn(db, "save");
db.save({ name: "Ada" }); // → "id-1" (real), and recorded
save.calledWith({ name: "Ada" }); // → true
save.restore();

// stub: replaces the method entirely
const s = stub(db, "save", () => "stub-id");
db.save({}); // → "stub-id"
s.restore(); // original back
```

Spy on a getter or setter with `accessType`:

```ts
const el = { get value() { return this._v ?? 0 }, _v: 3 };
const g = spyOn(el, "value", { accessType: "get" });
el.value;          // → 3, and g.callCount === 1
g.restore();
```

## Mock a whole object

```ts
import { mock, mockObject } from "@lacspace/spy";

// Real functions become spies (behaviour kept until you program them)
const svc = mockObject({ save: (x: number) => x * 2, name: "db" });
svc.save(21);              // → 42
svc.save.calledWith(21);  // → true

// Auto-mock an interface — any accessed property is a fresh spy
interface Logger { info(m: string): void; warn(m: string): void }
const log = mock<Logger>();
log.info("hi");
log.info.calledWith("hi"); // → true
```

## Freeze and control time

```ts
import { useFakeTimers } from "@lacspace/spy";

const clock = useFakeTimers(0); // start the fake epoch at 0

let count = 0;
setInterval(() => count++, 100);

clock.tick(250);       // fires at 100 and 200
count;                 // → 2
Date.now();            // → 250

clock.setSystemTime(new Date("2030-01-01"));
Date.now();            // → 1893456000000

clock.restore();       // real setInterval / Date back
```

`runAllTimers()` drains every queued timer; `runOnlyPendingTimers()` fires only the currently-pending ones (the safe way to pulse a recurring interval once).

## Clean up everything at once

```ts
import { restoreAll, resetAll } from "@lacspace/spy";

afterEach(() => restoreAll()); // undo every spyOn/stub/fake clock
// or, to keep the patches but wipe recorded history between assertions:
resetAll();                    // reset every active spyOn/stub spy (patches stay)
```

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `spy` | `spy<F>(impl?: F): Spy<F>` | Callable recorder; wraps `impl` (types preserved) or records a bare spy. |
| `spyOn` | `spyOn(obj, key, opts?): Spy` | Wrap a method/accessor, recording + calling through; `.restore()` to undo. |
| `stub` | `stub(obj, key, impl?): Spy` | Replace a method entirely with a spy; `.restore()` to undo. |
| `mock` | `mock<T>(shape?): Mocked<T>` | Typed mock: with `shape` spies its functions, without it auto-mocks on access. |
| `mockObject` | `mockObject<T>(shape): Mocked<T>` | Copy of `shape` with every function (nested too) turned into a spy. |
| `useFakeTimers` | `useFakeTimers(now?): FakeTimers` | Install deterministic fake `setTimeout`/`setInterval`/`Date`. |
| `restoreAll` | `restoreAll(): void` | Restore every active `spyOn`/`stub`/fake clock. |
| `resetAll` | `resetAll(): void` | Clear the recorded history of every active `spyOn`/`stub` spy (patches kept). |
| `deepEqual` | `deepEqual(a, b): boolean` | Structural equality used by `calledWith` (matcher-aware; exported for convenience). |
| `any` | `any(ctor?): Matcher` | Match any value of a type (`any(Number)`), or literally anything (`any()`). |
| `anything` | `anything(): Matcher` | Match any value except `null`/`undefined`. |
| `predicate` | `predicate(fn, desc?): Matcher` | Match by a custom predicate function. |
| `stringMatching` | `stringMatching(str \| re): Matcher` | Match a string by substring or `RegExp`. |
| `objectContaining` | `objectContaining(partial): Matcher` | Match an object that has (at least) these props (deep, nestable). |
| `arrayContaining` | `arrayContaining(items): Matcher` | Match an array that contains each item (order/extras ignored). |
| `isMatcher` | `isMatcher(x): x is Matcher` | Type guard for argument matchers. |

### `Spy<F>` surface

`.calls` · `.callCount` · `.called` · `.calledOnce` · `.firstCall` · `.lastCall` · `.results` · `.returnValues` · `.calledWith(...args)` · `.nthCall(n)` · `.nthCalledWith(n, ...args)` · `.calledOnceWith(...args)` · `.reset()` · `.restore()` · `.returns(v)` · `.throws(e)` · `.resolves(v)` · `.rejects(e)` · `.callsFake(fn)` · `.returnsOnce(v)` · `.resolvesOnce(v)` · `.throwsOnce(e)` · `.rejectsOnce(e)` · `.callsFakeOnce(fn)`

Types: `Spy`, `SpyResult`, `SpyOnOptions`, `Mocked`, `FakeTimers`, `AnyFn`, `Matcher`.

## Limitations

- **One fake clock at a time.** `useFakeTimers()` throws if timers are already installed; call `.restore()` (or `restoreAll()`) first.
- **`setSystemTime` does not fire timers.** It only moves the wall clock (like Sinon); use `.tick()` to run timers.
- **Timer IDs are numbers.** They are not Node `Timeout` objects, so `.unref()`/`.ref()` and `[Symbol.toPrimitive]` tricks are not emulated.
- **`.reset()` clears history only**, not programmed behaviour or the once-queue.
- **`calledWith` uses structural deep equality**; functions and class instances with custom internals compare by reference/own-enumerable keys, not by custom `equals`.
- **`process.nextTick`, microtasks and `requestAnimationFrame` are not faked** — only `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`/`Date`/`setImmediate`.
- **`resetAll()` only touches `spyOn`/`stub` spies.** Standalone `spy()`/`mock()`/`mockObject()` instances are not centrally tracked (to avoid retaining them), so reset those yourself.
- **Matchers are opt-in sentinels.** A matcher is recognised only when it is the actual matcher object returned by `any`/`objectContaining`/… — plain data is never treated as a matcher, and matchers are one-directional (they compare against the recorded value, not vice-versa).

## Licence

Released under the **Lacspace Free Licence v1.0** — see [LICENSE](./LICENSE).
