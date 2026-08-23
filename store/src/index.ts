import { useRef, useCallback } from "react";
import { useSyncExternalStore } from "react";

/**
 * Updates store state. Accepts a partial object or an updater function that
 * receives the current state and returns a partial. By default the returned
 * partial is merged shallowly into the current state; pass `replace = true`
 * to swap the state object entirely.
 *
 * @example
 * set({ count: 1 });                       // shallow merge
 * set((s) => ({ count: s.count + 1 }));    // functional update
 * set({ a: 1, b: 2 }, true);               // replace whole state
 */
export type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>),
  replace?: boolean,
) => void;

/**
 * Reads the current store state synchronously.
 *
 * @example
 * const { count } = get();
 */
export type GetState<T> = () => T;

/**
 * The vanilla (framework-agnostic) store handle returned by {@link createStore}.
 * Also mixed into the hook returned by {@link create}, so you can read and write
 * the same store from outside React.
 *
 * @example
 * const api = createStore(() => ({ count: 0 }));
 * api.subscribe((state, prev) => console.log(prev.count, "->", state.count));
 * api.setState({ count: 1 });
 * api.getState().count; // 1
 * api.getInitialState().count; // 0
 */
export type StoreApi<T> = {
  /** Read the current state. */
  getState: GetState<T>;
  /** Update the state (shallow-merge by default). */
  setState: SetState<T>;
  /**
   * Subscribe to state changes. The listener receives the next and previous
   * state. Returns an unsubscribe function.
   */
  subscribe: (listener: (state: T, prev: T) => void) => () => void;
  /** Read the state the store was first created with (never changes). */
  getInitialState: () => T;
};

/**
 * Function that builds the initial state. It receives `set`, `get`, and the
 * full store `api`, letting you define actions alongside data.
 *
 * @example
 * const creator: StateCreator<{ count: number; inc: () => void }> = (set) => ({
 *   count: 0,
 *   inc: () => set((s) => ({ count: s.count + 1 })),
 * });
 */
export type StateCreator<T> = (
  set: SetState<T>,
  get: GetState<T>,
  api: StoreApi<T>,
) => T;

/**
 * Creates a vanilla, framework-agnostic store. Use this directly for
 * non-React code, or wrap it with {@link create} to get a React hook.
 *
 * `setState` merges the update shallowly into the current state unless
 * `replace` is `true`. Subscribers are notified whenever the state identity
 * changes (a shallow merge always produces a new object, so a merge that
 * changes nothing still notifies; a `replace` with the identical reference
 * does not).
 *
 * @typeParam T - The shape of the store state.
 * @param initializer - Builds the initial state; receives `set`, `get`, `api`.
 * @returns A {@link StoreApi} for reading, writing, and subscribing.
 *
 * @example
 * const store = createStore<{ count: number; inc: () => void }>((set) => ({
 *   count: 0,
 *   inc: () => set((s) => ({ count: s.count + 1 })),
 * }));
 * store.getState().inc();
 * store.getState().count; // 1
 */
export function createStore<T>(initializer: StateCreator<T>): StoreApi<T> {
  let state: T;
  const listeners = new Set<(state: T, prev: T) => void>();

  const getState: GetState<T> = () => state;

  const setState: SetState<T> = (partial, replace) => {
    const prev = state;
    const nextPartial =
      typeof partial === "function"
        ? (partial as (state: T) => Partial<T>)(prev)
        : partial;

    const next = replace
      ? (nextPartial as T)
      : Object.assign({}, prev, nextPartial);

    if (Object.is(prev, next)) return;

    state = next;
    listeners.forEach((listener) => listener(state, prev));
  };

  const subscribe: StoreApi<T>["subscribe"] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getInitialState: GetState<T> = () => initialState;

  const api: StoreApi<T> = { getState, setState, subscribe, getInitialState };

  state = initializer(setState, getState, api);
  const initialState: T = state;

  return api;
}

/**
 * A React hook bound to a specific store. Call with an optional selector to
 * subscribe to just a slice of state, and an optional equality function to
 * control when the component re-renders. The hook object is also a full
 * {@link StoreApi}, so `useStore.getState()` / `useStore.setState()` work
 * outside React.
 *
 * @typeParam T - The full store state.
 *
 * @example
 * const count = useStore((s) => s.count);              // slice
 * const whole = useStore();                            // whole state
 * const { a, b } = useStore((s) => ({ a: s.a, b: s.b }), shallow);
 */
export type UseBoundStore<T> = {
  <U = T>(selector?: (state: T) => U, equalityFn?: (a: U, b: U) => boolean): U;
} & StoreApi<T>;

/**
 * Creates a store and returns a React hook bound to it. The hook is also a
 * {@link StoreApi} (via `Object.assign`), so you can read/write the store from
 * anywhere — inside components with selectors, or outside React entirely.
 *
 * The hook uses `useSyncExternalStore` with a `getServerSnapshot` returning the
 * initial state, so it is safe to render on the server. A component re-renders
 * only when its selected slice changes according to `equalityFn` (default
 * `Object.is`).
 *
 * @typeParam T - The shape of the store state.
 * @param initializer - Builds the initial state; receives `set`, `get`, `api`.
 * @returns A hook that is also the store's {@link StoreApi}.
 *
 * @example
 * const useCounter = create<{ count: number; inc: () => void }>((set) => ({
 *   count: 0,
 *   inc: () => set((s) => ({ count: s.count + 1 })),
 * }));
 *
 * function Counter() {
 *   const count = useCounter((s) => s.count);
 *   const inc = useCounter((s) => s.inc);
 *   return <button onClick={inc}>{count}</button>;
 * }
 *
 * // Outside React:
 * useCounter.getState().inc();
 */
export function create<T>(initializer: StateCreator<T>): UseBoundStore<T> {
  const api = createStore(initializer);

  const useStore = <U = T>(
    selector: (state: T) => U = (state) => state as unknown as U,
    equalityFn: (a: U, b: U) => boolean = Object.is,
  ): U => {
    // Hold the last selected value so a custom equalityFn can decide whether
    // to surface a new reference to React.
    const lastRef = useRef<{ value: U } | null>(null);

    const getSelection = useCallback(
      (state: T): U => {
        const nextValue = selector(state);
        const prev = lastRef.current;
        if (prev !== null && equalityFn(prev.value, nextValue)) {
          return prev.value;
        }
        lastRef.current = { value: nextValue };
        return nextValue;
      },
      // Selector/equality are treated as stable per render, matching common
      // store-hook usage; re-evaluated each render via the closure below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const getSnapshot = () => getSelection(api.getState());
    const getServerSnapshot = () => getSelection(api.getInitialState());

    return useSyncExternalStore(api.subscribe, getSnapshot, getServerSnapshot);
  };

  return Object.assign(useStore, api) as UseBoundStore<T>;
}

/**
 * Shallow equality for objects and arrays (one level deep). Returns `true` when
 * both inputs are the same reference, or when they have the same keys with
 * `Object.is`-equal values. Ideal as the `equalityFn` when a selector returns a
 * fresh object each render.
 *
 * @typeParam T - The compared value type.
 * @param a - First value.
 * @param b - Second value.
 * @returns Whether the two values are shallowly equal.
 *
 * @example
 * shallow({ a: 1 }, { a: 1 }); // true
 * shallow({ a: 1 }, { a: 2 }); // false
 * shallow([1, 2], [1, 2]);     // true
 *
 * const { a, b } = useStore((s) => ({ a: s.a, b: s.b }), shallow);
 */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Options for the {@link persist} middleware.
 */
export type PersistOptions<T> = {
  /** Storage key. Required. */
  name: string;
  /** Which Web Storage to use. Defaults to `"local"`. */
  storage?: "local" | "session";
  /** Select the subset of state to persist. Defaults to the whole state. */
  partialize?: (state: T) => Partial<T>;
  /** Optional version number, stored alongside the state. */
  version?: number;
};

type PersistedShape<T> = { state: Partial<T>; version?: number };

/**
 * Persistence middleware. Wraps a {@link StateCreator} so the store hydrates
 * from Web Storage on creation and writes back on every `setState`.
 *
 * SSR-safe: if there is no `window`/storage (server render), hydration and
 * writes are skipped. Malformed stored JSON is ignored gracefully. The
 * persisted partial is merged over the initial state on hydrate.
 *
 * @typeParam T - The shape of the store state.
 * @param initializer - The base state creator to wrap.
 * @param options - Persistence options; see {@link PersistOptions}.
 * @returns A wrapped {@link StateCreator} suitable for {@link create}/{@link createStore}.
 *
 * @example
 * const useSettings = create(
 *   persist<{ theme: "light" | "dark"; toggle: () => void }>(
 *     (set) => ({
 *       theme: "light",
 *       toggle: () =>
 *         set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
 *     }),
 *     { name: "settings", storage: "local", partialize: (s) => ({ theme: s.theme }) },
 *   ),
 * );
 */
export function persist<T>(
  initializer: StateCreator<T>,
  options: PersistOptions<T>,
): StateCreator<T> {
  const { name, storage = "local", partialize, version } = options;

  const getStorage = (): Storage | undefined => {
    if (typeof window === "undefined") return undefined;
    try {
      return storage === "session" ? window.sessionStorage : window.localStorage;
    } catch {
      return undefined;
    }
  };

  return (set, get, api) => {
    const write = (state: T): void => {
      const store = getStorage();
      if (!store) return;
      try {
        const toSave = partialize ? partialize(state) : (state as Partial<T>);
        const payload: PersistedShape<T> = { state: toSave, version };
        store.setItem(name, JSON.stringify(payload));
      } catch {
        // Ignore quota / serialization errors.
      }
    };

    // Wrap set so every update is written back to storage.
    const persistingSet: SetState<T> = (partial, replace) => {
      set(partial, replace);
      write(get());
    };

    const baseState = initializer(persistingSet, get, api);

    // Hydrate synchronously so the very first snapshot is already restored.
    const store = getStorage();
    if (store) {
      try {
        const raw = store.getItem(name);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as PersistedShape<T>;
          if (parsed && typeof parsed === "object" && parsed.state) {
            return Object.assign({}, baseState, parsed.state);
          }
        }
      } catch {
        // Corrupt JSON — fall through to the base state.
      }
    }

    return baseState;
  };
}
