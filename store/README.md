<div align="center">

# @lacspace/store

**Minimal global state for React in ~1 KB — create a store, use selectors, no provider.**

[![npm version](https://img.shields.io/npm/v/@lacspace/store?color=%2338bdf8&label=npm)](https://www.npmjs.com/package/@lacspace/store)
[![install size](https://packagephobia.com/badge?p=@lacspace/store)](https://packagephobia.com/result?p=@lacspace/store)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/store?label=minzip)](https://bundlephobia.com/package/@lacspace/store)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/store)
[![license](https://img.shields.io/npm/l/@lacspace/store?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A **Zustand-lite** store built on React's own `useSyncExternalStore` — define state and actions in one `create` call, then select slices anywhere. No provider, no context, no reducer boilerplate. Zero dependencies, SSR-safe, fully typed.

- 🪝 `create` — a store that **is** its own hook `useStore(selector?, equalityFn?)`
- 🧩 `createStore` — a vanilla, framework-agnostic store (drive it outside React)
- 💾 `persist` — hydrate from / write to `localStorage`, `sessionStorage`, or any injectable storage
- 🎯 `shallow` — one-level equality so same-shaped selections skip re-renders
- ⚡ ~1 KB · 🌍 SSR-safe · 📦 ESM + CJS · fully typed · React peer dep only

### New in 1.2.0

All additive and **zero-dependency**. The whole vanilla engine now lives in a **React-free core** (`createStore` and everything below import no `react`), so you can drive and test it in Node/edge with no DOM.

- 🎛️ `subscribeWithSelector(api, selector, listener, opts?)` — transient slice subscription that fires only when the selected value changes (with `equalityFn`, `fireImmediately`).
- 🧱 `applyMiddleware(creator, ...middlewares)` + `logger()` — composable middleware around `set`; `logger` takes an **injectable** `log` sink (silent in tests).
- 🧮 `computed(api, compute, opts?)` — memoized derived values (recompute only when state changes) with `get()` and `subscribe()`.
- 🍰 `combineSlices(...slices)` — compose independent slices (data + actions) into one store.
- 🗄️ `persist` now accepts an **injectable `PersistStorage`** and `hydrateOnCreate` for synchronous vanilla hydration.
- 🧯 `store.destroy()` — detach every subscriber.

## Install

```sh
npm i @lacspace/store
```

React `>=18` is a peer dependency (the library relies on `useSyncExternalStore`).

## Usage

### 1. A counter store with actions

Define your data and actions together in the initializer, then use the returned hook. No `<Provider>` needed.

```tsx
import { create } from "@lacspace/store";

const useCounter = create<{
  count: number;
  inc: () => void;
  dec: () => void;
  reset: () => void;
}>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
  dec: () => set((s) => ({ count: s.count - 1 })),
  reset: () => set({ count: 0 }),
}));

function Counter() {
  const count = useCounter((s) => s.count);
  const inc = useCounter((s) => s.inc);
  return <button onClick={inc}>Count: {count}</button>;
}
```

### 2. Selectors + `shallow` equality

Select just the slice a component needs so it re-renders only when that slice changes. When a selector returns a fresh object, pass `shallow` so a same-shaped result doesn't trigger a render.

```tsx
import { create, shallow } from "@lacspace/store";

const useUser = create(() => ({
  first: "Ada",
  last: "Lovelace",
  age: 36,
}));

function Name() {
  // Re-renders only when first OR last changes — not on age changes.
  const { first, last } = useUser((s) => ({ first: s.first, last: s.last }), shallow);
  return <span>{first} {last}</span>;
}
```

### 3. Persisting to storage

Wrap your initializer with `persist` to hydrate from and write to `localStorage`/`sessionStorage`. It is SSR-safe (skips when there is no `window`) and ignores corrupt data.

```tsx
import { create, persist } from "@lacspace/store";

const useSettings = create(
  persist<{ theme: "light" | "dark"; toggle: () => void }>(
    (set) => ({
      theme: "light",
      toggle: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
    }),
    {
      name: "app-settings",
      storage: "local",
      partialize: (s) => ({ theme: s.theme }), // persist data, not actions
      version: 1,
    },
  ),
);
```

### 4. Reading/writing outside React

The hook is also a full store API, so you can drive it from anywhere — event handlers, tests, or non-React code.

```ts
import { create } from "@lacspace/store";

const useCounter = create<{ count: number }>(() => ({ count: 0 }));

useCounter.getState().count;        // 0
useCounter.setState({ count: 5 });  // update
useCounter.getState().count;        // 5

const unsub = useCounter.subscribe((state, prev) => {
  console.log(prev.count, "->", state.count);
});
unsub();

useCounter.getInitialState().count; // 0

// Need a store with no hook at all? Use createStore:
import { createStore } from "@lacspace/store";
const vanilla = createStore(() => ({ ready: false }));
vanilla.setState({ ready: true });
vanilla.destroy();                  // detach all subscribers
```

### 5. Transient slice subscriptions (no re-render)

Watch just one slice from outside React — the listener runs only when that slice changes.

```ts
import { createStore, shallow, subscribeWithSelector } from "@lacspace/store";

const store = createStore(() => ({ x: 0, y: 0, name: "a" }));

const unsub = subscribeWithSelector(
  store,
  (s) => ({ x: s.x, y: s.y }),
  (pos, prev) => console.log("moved", prev, "->", pos),
  { equalityFn: shallow },          // same-shaped position skips the listener
);
```

### 6. Middleware + logger

Compose functional middleware around `set`. `logger` takes an injectable `log` sink, so it's silent (and testable) unless you wire it up.

```ts
import { createStore, applyMiddleware, logger } from "@lacspace/store";

const store = createStore(
  applyMiddleware(
    (set) => ({ n: 0, inc: () => set((s) => ({ n: s.n + 1 })) }),
    logger({ name: "counter", log: (e) => console.debug(e.prevState, "->", e.nextState) }),
  ),
);
```

### 7. Computed (memoized derived) values

```ts
import { createStore, computed } from "@lacspace/store";

const cart = createStore(() => ({ items: [{ price: 3 }, { price: 4 }] }));
const total = computed(cart, (s) => s.items.reduce((a, i) => a + i.price, 0));

total.get();                        // 7 — memoized until `items` changes
total.subscribe((v) => console.log("total is now", v));
```

### 8. Slices — split a big store into pieces

```ts
import { createStore, combineSlices } from "@lacspace/store";

const bears = (set) => ({ bears: 0, addBear: () => set((s) => ({ bears: s.bears + 1 })) });
const fish  = (set, get) => ({ fish: 0, eat: () => get().bears > 0 && set((s) => ({ fish: s.fish + 1 })) });

const useStore = createStore(combineSlices(bears, fish));
```

### 9. Persist with injectable storage (Node / tests)

```ts
import { createStore, persist } from "@lacspace/store";

const mem = new Map<string, string>();
const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };

const store = createStore(
  persist<{ token: string | null }>(() => ({ token: null }), {
    name: "auth",
    storage,                        // any object with getItem/setItem
    hydrateOnCreate: true,          // hydrate synchronously (no React mount)
  }),
);
```

## API

| Export | Description |
| --- | --- |
| `create(initializer)` | Creates a store and returns a **hook** `useStore(selector?, equalityFn?)` that is **also** the `StoreApi` (`getState`/`setState`/`subscribe`/`getInitialState`/`destroy`). |
| `createStore(initializer)` | Creates a vanilla, **React-free** `StoreApi<T>` with no React binding. |
| `persist(initializer, options)` | Middleware that hydrates from and writes to storage. Options: `name` (required), `storage` (`"local"` \| `"session"` \| an injectable `PersistStorage`, default `"local"`), `partialize`, `version`, `skipHydration`, `hydrateOnCreate`. |
| `shallow(a, b)` | One-level shallow equality for objects/arrays; use as an `equalityFn`. |
| `subscribeWithSelector(api, selector, listener, opts?)` | Transient slice subscription; fires only when the selected value changes. Opts: `equalityFn`, `fireImmediately`. Returns unsubscribe. |
| `applyMiddleware(creator, ...middlewares)` | Composes a base `StateCreator` with middlewares (first listed runs first). |
| `logger(options?)` | Middleware that reports every `set` to an injectable `log` sink (defaults to `console.log`). |
| `computed(api, compute, opts?)` | Memoized derived value with `get()` and `subscribe()`; recomputes only when state changes. Opts: `equalityFn`. |
| `combineSlices(...slices)` | Merges independent slice creators into one `StateCreator`. |

### Types

`SetState<T>`, `GetState<T>`, `StoreApi<T>`, `StateCreator<T>`, `UseBoundStore<T>`, `PersistOptions<T>`, `PersistStorage`, `PersistApi`, `StoreWithPersist<T>`, `SubscribeWithSelectorOptions<U>`, `StoreMiddleware<T>`, `LoggerOptions<T>`, `LoggerEvent<T>`, `Computed<U>`, `ComputedOptions<U>`, `SliceCreator<T, S>`.

- **`setState(partial, replace?)`** — shallow-merges `partial` into state (or a functional updater `(state) => Partial<T>`); pass `replace = true` to swap the whole object. Subscribers fire when the state identity changes.
- **`useStore(selector?, equalityFn?)`** — default selector returns the whole state; default equality is `Object.is`. A component re-renders only when its selected slice changes per `equalityFn`.

## Why it's tiny

- **No provider, no context, no reducer boilerplate.** One `create` call gives you a hook and an API.
- **Standard React primitive.** Rendering is powered entirely by React's built-in `useSyncExternalStore`, so there's almost nothing to ship — and it's concurrent-safe and SSR-safe out of the box (a `getServerSnapshot` returns the initial state; no `window` access during render).
- **Zero dependencies.** Nothing but React (a peer dep). Tree-shakeable ESM + CJS, fully typed.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/store` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/store
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

