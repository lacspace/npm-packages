import { useRef, useCallback, useEffect } from "react";
import { useSyncExternalStore } from "react";

import { createStore } from "./vanilla";
import type { StoreApi, StateCreator, StoreWithPersist } from "./vanilla";

// Re-export the entire vanilla (React-free) core so the package's public API is
// unchanged: `createStore`, `shallow`, `persist`, all state/persist types, plus
// the 1.2.0 additions (selectors, middleware, computed, slices) all live in
// `./vanilla` and are importable straight from `@lacspace/store`.
export * from "./vanilla";

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

    // Apply persisted state (if any) only after mount, so the first client
    // render matches the server HTML. No-op for non-persisted stores.
    useEffect(() => {
      const p = (api as StoreWithPersist<T>).persist;
      if (p && !p.skipHydration) p.rehydrate();
    }, []);

    return useSyncExternalStore(api.subscribe, getSnapshot, getServerSnapshot);
  };

  return Object.assign(useStore, api) as UseBoundStore<T>;
}
