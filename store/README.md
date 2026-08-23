# @lacspace/store

**Minimal global state for React in ~1 KB — create a store, use selectors, no provider.** Built on `useSyncExternalStore` with a `persist` middleware and shallow equality. Zero-dependency, SSR-safe, fully typed. A Zustand-lite.

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
```

## API

| Export | Description |
| --- | --- |
| `create(initializer)` | Creates a store and returns a **hook** `useStore(selector?, equalityFn?)` that is **also** the `StoreApi` (`getState`/`setState`/`subscribe`/`getInitialState`). |
| `createStore(initializer)` | Creates a vanilla, framework-agnostic `StoreApi<T>` with no React binding. |
| `persist(initializer, options)` | Middleware that hydrates from and writes to Web Storage. Options: `name` (required), `storage` (`"local"` \| `"session"`, default `"local"`), `partialize`, `version`. |
| `shallow(a, b)` | One-level shallow equality for objects/arrays; use as an `equalityFn`. |

### Types

`SetState<T>`, `GetState<T>`, `StoreApi<T>`, `StateCreator<T>`, `UseBoundStore<T>`, `PersistOptions<T>`.

- **`setState(partial, replace?)`** — shallow-merges `partial` into state (or a functional updater `(state) => Partial<T>`); pass `replace = true` to swap the whole object. Subscribers fire when the state identity changes.
- **`useStore(selector?, equalityFn?)`** — default selector returns the whole state; default equality is `Object.is`. A component re-renders only when its selected slice changes per `equalityFn`.

## Why it's tiny

- **No provider, no context, no reducer boilerplate.** One `create` call gives you a hook and an API.
- **Standard React primitive.** Rendering is powered entirely by React's built-in `useSyncExternalStore`, so there's almost nothing to ship — and it's concurrent-safe and SSR-safe out of the box (a `getServerSnapshot` returns the initial state; no `window` access during render).
- **Zero dependencies.** Nothing but React (a peer dep). Tree-shakeable ESM + CJS, fully typed.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
