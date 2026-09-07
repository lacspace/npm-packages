/**
 * Vanilla, framework-agnostic store core for `@lacspace/store`.
 *
 * This module is **React-free** — it imports nothing from `react` and touches no
 * DOM. It is the pure engine behind the React hook in `index.ts` and can be used
 * directly in Node, edge runtimes, tests, or any non-React code.
 *
 * Everything here is re-exported from the package root, so importing from
 * `@lacspace/store` or `@lacspace/store` internals stays identical.
 */

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
  /**
   * Remove every subscriber, detaching the store. Optional so that
   * hand-written `StoreApi` object literals stay valid; the store returned by
   * {@link createStore}/{@link create} always provides it.
   */
  destroy?: () => void;
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

  /** Detach every subscriber. The state remains readable afterwards. */
  const destroy = (): void => {
    listeners.clear();
  };

  const api: StoreApi<T> = {
    getState,
    setState,
    subscribe,
    getInitialState,
    destroy,
  };

  state = initializer(setState, getState, api);
  const initialState: T = state;

  return api;
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
 * A pluggable storage backend for {@link persist}. Matches the subset of the Web
 * Storage API the middleware needs, so a real `localStorage`/`sessionStorage`,
 * an in-memory map, an async-free wrapper, or a test double all satisfy it.
 */
export interface PersistStorage {
  /** Read a stored string, or `null` when absent. */
  getItem: (name: string) => string | null;
  /** Write a stored string. */
  setItem: (name: string, value: string) => void;
  /** Optionally remove a stored key. */
  removeItem?: (name: string) => void;
}

/**
 * Options for the {@link persist} middleware.
 */
export type PersistOptions<T> = {
  /** Storage key. Required. */
  name: string;
  /**
   * Which storage to use. `"local"`/`"session"` select Web Storage (the
   * default is `"local"`); pass a {@link PersistStorage} object to inject a
   * custom backend (in-memory, a test double, etc.) that works anywhere,
   * including Node.
   */
  storage?: "local" | "session" | PersistStorage;
  /** Select the subset of state to persist. Defaults to the whole state. */
  partialize?: (state: T) => Partial<T>;
  /** Optional version number, stored alongside the state. */
  version?: number;
  /**
   * Skip automatic hydration after mount. When `true`, the store starts at its
   * base state and stays there until you call `store.persist.rehydrate()`.
   * Useful when you want to control exactly when persisted state is applied.
   * @default false
   */
  skipHydration?: boolean;
  /**
   * Hydrate synchronously at creation time instead of deferring to a React
   * effect. Persisted state is merged over the base state before the store's
   * first snapshot exists, so `createStore(persist(...))` comes up already
   * hydrated. Leave `false` (the default) for React/SSR usage, where deferred
   * hydration avoids a server/client mismatch.
   * @default false
   */
  hydrateOnCreate?: boolean;
};

type PersistedShape<T> = { state: Partial<T>; version?: number };

/** Control surface attached to a persisted store's api (see {@link persist}). */
export interface PersistApi {
  /** Load persisted state from storage and merge it in. Runs at most once. */
  rehydrate: () => void;
  /** Whether hydration has already run. */
  hasHydrated: () => boolean;
  /** Mirrors {@link PersistOptions.skipHydration}. */
  skipHydration?: boolean;
}

/** A {@link StoreApi} that carries the {@link persist} control surface. */
export type StoreWithPersist<T> = StoreApi<T> & { persist?: PersistApi };

/**
 * Persistence middleware. Wraps a {@link StateCreator} so the store hydrates
 * from storage and writes back on every `setState`.
 *
 * SSR-safe: with the default Web Storage backend, if there is no `window`
 * (server render), hydration and writes are skipped. Inject a
 * {@link PersistStorage} to persist in any environment (Node, tests, custom
 * backends). Malformed stored JSON is ignored gracefully. The persisted partial
 * is merged over the initial state on hydrate.
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
 *
 * @example
 * // Vanilla + injected storage, hydrated synchronously at create time:
 * const mem = new Map<string, string>();
 * const storage = {
 *   getItem: (k: string) => mem.get(k) ?? null,
 *   setItem: (k: string, v: string) => void mem.set(k, v),
 * };
 * const store = createStore(
 *   persist<{ n: number }>(() => ({ n: 0 }), { name: "x", storage, hydrateOnCreate: true }),
 * );
 */
export function persist<T>(
  initializer: StateCreator<T>,
  options: PersistOptions<T>,
): StateCreator<T> {
  const {
    name,
    storage = "local",
    partialize,
    version,
    skipHydration = false,
    hydrateOnCreate = false,
  } = options;

  const getStorage = (): PersistStorage | undefined => {
    if (storage && typeof storage === "object") return storage;
    if (typeof window === "undefined") return undefined;
    try {
      return storage === "session"
        ? window.sessionStorage
        : window.localStorage;
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

    // Read persisted state from storage, returning the parsed partial or null.
    const read = (): Partial<T> | null => {
      const store = getStorage();
      if (!store) return null;
      try {
        const raw = store.getItem(name);
        if (raw === null) return null;
        const parsed = JSON.parse(raw) as PersistedShape<T>;
        if (parsed && typeof parsed === "object" && parsed.state) {
          return parsed.state as Partial<T>;
        }
      } catch {
        // Corrupt JSON — keep the base state.
      }
      return null;
    };

    let hydrated = false;

    // Deferred hydration (default): the store starts at its BASE state so the
    // very first snapshot (and `getServerSnapshot`) match the server-rendered
    // HTML — no SSR hydration mismatch. Persisted state is applied AFTER mount:
    // `create` calls `rehydrate()` from an effect, and it is also exposed as
    // `store.persist.rehydrate()` for manual/vanilla use.
    const rehydrate = (): void => {
      if (hydrated) return;
      hydrated = true;
      const persisted = read();
      if (persisted) set(persisted);
    };

    (api as StoreWithPersist<T>).persist = {
      rehydrate,
      hasHydrated: () => hydrated,
      skipHydration,
    };

    // Eager hydration: merge persisted state over the base state synchronously,
    // before the store's first snapshot exists. Used for vanilla/Node usage.
    if (hydrateOnCreate) {
      const persisted = read();
      if (persisted) {
        hydrated = true;
        return Object.assign({}, baseState, persisted) as T;
      }
    }

    return baseState;
  };
}

// ---------------------------------------------------------------------------
// New in 1.2.0 — selectors, middleware, computed values, and slices.
// All framework-agnostic and dependency-free.
// ---------------------------------------------------------------------------

/**
 * Options for {@link subscribeWithSelector}.
 *
 * @typeParam U - The selected slice type.
 */
export interface SubscribeWithSelectorOptions<U> {
  /**
   * Equality used to decide whether the selected slice changed. Defaults to
   * `Object.is`; pass {@link shallow} when the selector returns a fresh object.
   */
  equalityFn?: (a: U, b: U) => boolean;
  /** Invoke the listener once immediately with the current selection. */
  fireImmediately?: boolean;
}

/**
 * Subscribe to a **slice** of a vanilla store. The listener runs only when the
 * selected value changes according to `equalityFn` (default `Object.is`) — a
 * transient subscription that never involves React or re-renders.
 *
 * @typeParam T - The full store state.
 * @typeParam U - The selected slice.
 * @param api - The store to subscribe to.
 * @param selector - Derives the watched slice from state.
 * @param listener - Called with the new and previous slice on change.
 * @param options - See {@link SubscribeWithSelectorOptions}.
 * @returns An unsubscribe function.
 *
 * @example
 * const unsub = subscribeWithSelector(
 *   store,
 *   (s) => s.count,
 *   (count, prev) => console.log(prev, "->", count),
 * );
 */
export function subscribeWithSelector<T, U>(
  api: StoreApi<T>,
  selector: (state: T) => U,
  listener: (selected: U, prev: U) => void,
  options: SubscribeWithSelectorOptions<U> = {},
): () => void {
  const { equalityFn = Object.is, fireImmediately = false } = options;
  let current = selector(api.getState());

  if (fireImmediately) listener(current, current);

  return api.subscribe((state) => {
    const next = selector(state);
    if (!equalityFn(current, next)) {
      const prev = current;
      current = next;
      listener(next, prev);
    }
  });
}

/**
 * A middleware that transforms a {@link StateCreator} — the composable unit used
 * by {@link applyMiddleware}. A middleware typically wraps `set` (to log,
 * validate, or persist) and returns a new creator.
 *
 * @typeParam T - The store state shape.
 */
export type StoreMiddleware<T> = (creator: StateCreator<T>) => StateCreator<T>;

/**
 * Compose a base {@link StateCreator} with one or more {@link StoreMiddleware}.
 * The **first** middleware listed is the **outermost** wrapper, so an update
 * flows through the list top-to-bottom before reaching the base `set`.
 *
 * @typeParam T - The store state shape.
 * @param creator - The base state creator.
 * @param middlewares - Middlewares to apply, outermost first.
 * @returns A wrapped {@link StateCreator} for {@link create}/{@link createStore}.
 *
 * @example
 * const useStore = create(
 *   applyMiddleware(
 *     (set) => ({ n: 0, inc: () => set((s) => ({ n: s.n + 1 })) }),
 *     logger({ name: "counter" }),
 *   ),
 * );
 */
export function applyMiddleware<T>(
  creator: StateCreator<T>,
  ...middlewares: StoreMiddleware<T>[]
): StateCreator<T> {
  // Left fold so the first middleware listed wraps the set-call outermost and
  // therefore runs first when an update flows through the chain.
  return middlewares.reduce((acc, mw) => mw(acc), creator);
}

/** The event a {@link logger} middleware reports on each `set`. */
export interface LoggerEvent<T> {
  /** Always `"set"` for now — reserved for future event kinds. */
  type: "set";
  /** State before the update. */
  prevState: T;
  /** State after the update. */
  nextState: T;
  /** Optional label from {@link LoggerOptions.name}. */
  name?: string;
}

/** Options for the {@link logger} middleware. */
export interface LoggerOptions<T> {
  /** Optional label included in each {@link LoggerEvent}. */
  name?: string;
  /**
   * Sink for log events. Injectable so it stays silent/side-effect-free in
   * tests. Defaults to `console.log`.
   */
  log?: (event: LoggerEvent<T>) => void;
}

/**
 * A {@link StoreMiddleware} that reports every `set` to an injectable sink. The
 * default sink is `console.log`; pass `log` to capture events (e.g. in tests)
 * with no console output.
 *
 * @typeParam T - The store state shape.
 * @param options - See {@link LoggerOptions}.
 * @returns A middleware for {@link applyMiddleware}.
 *
 * @example
 * const events: string[] = [];
 * const creator = applyMiddleware(
 *   base,
 *   logger({ log: (e) => events.push(e.type) }),
 * );
 */
export function logger<T>(options: LoggerOptions<T> = {}): StoreMiddleware<T> {
  const { name, log } = options;
  const sink =
    log ??
    ((event: LoggerEvent<T>) => {
      // eslint-disable-next-line no-console
      console.log(
        `[store${event.name ? `:${event.name}` : ""}]`,
        event.prevState,
        "->",
        event.nextState,
      );
    });

  return (creator) => (set, get, api) => {
    const loggingSet: SetState<T> = (partial, replace) => {
      const prevState = get();
      set(partial, replace);
      const nextState = get();
      sink({ type: "set", prevState, nextState, name });
    };
    return creator(loggingSet, get, api);
  };
}

/** A memoized derived value read from a store; see {@link computed}. */
export interface Computed<U> {
  /** Read the current derived value (recomputed only when state changed). */
  get: () => U;
  /**
   * Subscribe to derived-value changes. Fires only when the computed value
   * changes per the equality function. Returns an unsubscribe function.
   */
  subscribe: (listener: (value: U, prev: U) => void) => () => void;
}

/** Options for {@link computed}. */
export interface ComputedOptions<U> {
  /**
   * Equality used to decide whether the derived value changed. Defaults to
   * `Object.is`; pass {@link shallow} for object/array results.
   */
  equalityFn?: (a: U, b: U) => boolean;
}

/**
 * Create a **memoized derived value** from a store. `compute` re-runs only when
 * the source state reference changes — repeated `get()` calls between updates
 * return the cached value — and subscribers fire only when the derived value
 * actually changes per `equalityFn`.
 *
 * @typeParam T - The source store state.
 * @typeParam U - The derived value.
 * @param api - The store to derive from.
 * @param compute - Pure function from state to the derived value.
 * @param options - See {@link ComputedOptions}.
 * @returns A {@link Computed} handle with `get` and `subscribe`.
 *
 * @example
 * const store = createStore(() => ({ items: [1, 2, 3] }));
 * const total = computed(store, (s) => s.items.reduce((a, b) => a + b, 0));
 * total.get(); // 6 (memoized until `items` changes)
 */
export function computed<T, U>(
  api: StoreApi<T>,
  compute: (state: T) => U,
  options: ComputedOptions<U> = {},
): Computed<U> {
  const { equalityFn = Object.is } = options;

  let lastState = api.getState();
  let lastValue = compute(lastState);
  let primed = true;

  const get = (): U => {
    const state = api.getState();
    if (primed && Object.is(state, lastState)) return lastValue;
    lastState = state;
    lastValue = compute(state);
    primed = true;
    return lastValue;
  };

  const subscribe: Computed<U>["subscribe"] = (listener) => {
    let prevValue = get();
    return api.subscribe(() => {
      const nextValue = get();
      if (!equalityFn(prevValue, nextValue)) {
        const prev = prevValue;
        prevValue = nextValue;
        listener(nextValue, prev);
      }
    });
  };

  return { get, subscribe };
}

/**
 * One slice of a composed store. Receives the full store's `set`/`get`/`api`
 * (so slices can read and update each other) and returns its portion of state —
 * data and/or actions.
 *
 * @typeParam T - The full composed store state.
 * @typeParam S - This slice's contributed shape.
 */
export type SliceCreator<T, S> = (
  set: SetState<T>,
  get: GetState<T>,
  api: StoreApi<T>,
) => S;

/**
 * Compose several {@link SliceCreator}s into a single {@link StateCreator}.
 * Every slice sees the full `set`/`get`/`api`, and their returned objects are
 * shallow-merged into one state — the standard "slices" pattern for splitting a
 * large store into focused, independently-authored pieces.
 *
 * @typeParam T - The full composed store state.
 * @param slices - The slices to combine.
 * @returns A {@link StateCreator} for {@link create}/{@link createStore}.
 *
 * @example
 * const bears = (set) => ({ bears: 0, addBear: () => set((s) => ({ bears: s.bears + 1 })) });
 * const fish  = (set) => ({ fish: 0, addFish: () => set((s) => ({ fish: s.fish + 1 })) });
 * const useStore = create(combineSlices(bears, fish));
 */
export function combineSlices<T>(
  ...slices: Array<SliceCreator<T, Partial<T>>>
): StateCreator<T> {
  return (set, get, api) =>
    Object.assign({}, ...slices.map((slice) => slice(set, get, api))) as T;
}
