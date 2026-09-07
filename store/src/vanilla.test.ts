import { describe, it, expect, vi } from "vitest";

// IMPORTANT: import the PURE, React-free core directly. Never import "./index",
// which pulls in `react` and would crash under the node test environment.
import {
  createStore,
  shallow,
  persist,
  subscribeWithSelector,
  applyMiddleware,
  logger,
  computed,
  combineSlices,
  type PersistStorage,
  type StateCreator,
} from "./vanilla";

/** An in-memory PersistStorage double so tests never touch real localStorage. */
function memStorage(seed: Record<string, string> = {}): PersistStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("createStore — core vanilla API", () => {
  it("getState returns the initial state", () => {
    const store = createStore(() => ({ count: 0 }));
    expect(store.getState()).toEqual({ count: 0 });
  });

  it("setState shallow-merges by default", () => {
    const store = createStore(() => ({ a: 1, b: 2 }));
    store.setState({ b: 3 });
    expect(store.getState()).toEqual({ a: 1, b: 3 });
  });

  it("setState accepts a functional updater", () => {
    const store = createStore(() => ({ count: 0 }));
    store.setState((s) => ({ count: s.count + 5 }));
    expect(store.getState().count).toBe(5);
  });

  it("setState with replace=true swaps the whole object", () => {
    const store = createStore<{ a: number; b?: number }>(() => ({ a: 1, b: 2 }));
    store.setState({ a: 9 }, true);
    expect(store.getState()).toEqual({ a: 9 });
  });

  it("getInitialState never changes after updates", () => {
    const store = createStore(() => ({ count: 0 }));
    store.setState({ count: 42 });
    expect(store.getInitialState()).toEqual({ count: 0 });
    expect(store.getState().count).toBe(42);
  });

  it("subscribe fires with next and previous state, and unsubscribe stops it", () => {
    const store = createStore(() => ({ count: 0 }));
    const seen: Array<[number, number]> = [];
    const unsub = store.subscribe((s, p) => seen.push([p.count, s.count]));
    store.setState({ count: 1 });
    store.setState({ count: 2 });
    unsub();
    store.setState({ count: 3 });
    expect(seen).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("replace with the identical reference does not notify", () => {
    const store = createStore(() => ({ count: 0 }));
    const same = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState(same, true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("actions defined in the initializer mutate via set", () => {
    const store = createStore<{ count: number; inc: () => void }>((set) => ({
      count: 0,
      inc: () => set((s) => ({ count: s.count + 1 })),
    }));
    store.getState().inc();
    store.getState().inc();
    expect(store.getState().count).toBe(2);
  });

  it("destroy() removes every subscriber", () => {
    const store = createStore(() => ({ count: 0 }));
    const listener = vi.fn();
    store.subscribe(listener);
    store.destroy?.();
    store.setState({ count: 1 });
    expect(listener).not.toHaveBeenCalled();
    // State is still readable after destroy.
    expect(store.getState().count).toBe(1);
  });
});

describe("shallow equality", () => {
  it("same reference is equal", () => {
    const o = { a: 1 };
    expect(shallow(o, o)).toBe(true);
  });

  it("same-shaped objects are equal", () => {
    expect(shallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("different values are not equal", () => {
    expect(shallow({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("different key counts are not equal", () => {
    expect(shallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("arrays compare element-wise", () => {
    expect(shallow([1, 2], [1, 2])).toBe(true);
    expect(shallow([1, 2], [1, 3])).toBe(false);
  });

  it("primitives fall back to Object.is", () => {
    expect(shallow(1, 1)).toBe(true);
    expect(shallow("a", "b")).toBe(false);
  });
});

describe("subscribeWithSelector — memoized slice subscription", () => {
  it("fires only when the selected slice changes", () => {
    const store = createStore(() => ({ count: 0, name: "x" }));
    const listener = vi.fn();
    subscribeWithSelector(store, (s) => s.count, listener);

    store.setState({ name: "y" }); // count unchanged
    expect(listener).not.toHaveBeenCalled();

    store.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(1, 0);
  });

  it("uses a shallow equality fn so same-shaped selections skip", () => {
    const store = createStore(() => ({ a: 1, b: 2, c: 3 }));
    const listener = vi.fn();
    subscribeWithSelector(
      store,
      (s) => ({ a: s.a, b: s.b }),
      listener,
      { equalityFn: shallow },
    );

    store.setState({ c: 99 }); // selected {a,b} same shape/values
    expect(listener).not.toHaveBeenCalled();

    store.setState({ a: 10 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fireImmediately invokes the listener with the current selection", () => {
    const store = createStore(() => ({ count: 7 }));
    const listener = vi.fn();
    subscribeWithSelector(store, (s) => s.count, listener, {
      fireImmediately: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(7, 7);
  });

  it("unsubscribe stops further notifications", () => {
    const store = createStore(() => ({ count: 0 }));
    const listener = vi.fn();
    const unsub = subscribeWithSelector(store, (s) => s.count, listener);
    store.setState({ count: 1 });
    unsub();
    store.setState({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("middleware — applyMiddleware / logger", () => {
  it("logger reports set events to an injected sink (no console)", () => {
    const events: Array<{ prev: number; next: number }> = [];
    const base: StateCreator<{ n: number; inc: () => void }> = (set) => ({
      n: 0,
      inc: () => set((s) => ({ n: s.n + 1 })),
    });
    const store = createStore(
      applyMiddleware(
        base,
        logger({ log: (e) => events.push({ prev: e.prevState.n, next: e.nextState.n }) }),
      ),
    );
    store.getState().inc();
    store.getState().inc();
    expect(events).toEqual([
      { prev: 0, next: 1 },
      { prev: 1, next: 2 },
    ]);
  });

  it("applies middlewares first-listed-first (order preserved)", () => {
    type S = { n: number; bump: () => void };
    const order: string[] = [];
    const tap =
      (label: string) =>
      (creator: StateCreator<S>): StateCreator<S> =>
      (set, get, api) =>
        creator(
          (partial, replace) => {
            order.push(label);
            set(partial, replace);
          },
          get,
          api,
        );

    const base: StateCreator<S> = (set) => ({ n: 0, bump: () => set({ n: 1 }) });
    const store = createStore(applyMiddleware(base, tap("A"), tap("B")));
    store.getState().bump();
    // First-listed middleware wraps the set-call outermost, so it runs first.
    expect(order).toEqual(["A", "B"]);
    expect(store.getState().n).toBe(1);
  });

  it("logger with no sink does not throw (default console path is callable)", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const store = createStore(applyMiddleware(() => ({ n: 0 }), logger({ name: "t" })));
    expect(() => store.setState({ n: 1 })).not.toThrow();
    spy.mockRestore();
  });
});

describe("persist — injectable storage", () => {
  it("writes persisted state on every set", () => {
    const storage = memStorage();
    const store = createStore(
      persist<{ theme: string; toggle: () => void }>(
        (set) => ({
          theme: "light",
          toggle: () =>
            set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
        }),
        { name: "settings", storage, partialize: (s) => ({ theme: s.theme }) },
      ),
    );
    store.getState().toggle();
    const saved = JSON.parse(storage.map.get("settings") as string);
    expect(saved.state).toEqual({ theme: "dark" });
  });

  it("stores the version alongside state", () => {
    const storage = memStorage();
    const store = createStore(
      persist<{ n: number; bump: () => void }>(
        (set) => ({ n: 0, bump: () => set((s) => ({ n: s.n + 1 })) }),
        { name: "v", storage, version: 3 },
      ),
    );
    store.getState().bump();
    const saved = JSON.parse(storage.map.get("v") as string);
    expect(saved.version).toBe(3);
    expect(saved.state.n).toBe(1);
  });

  it("hydrateOnCreate merges persisted state over the base at creation", () => {
    const storage = memStorage({
      s: JSON.stringify({ state: { count: 42 } }),
    });
    const store = createStore(
      persist<{ count: number; label: string }>(
        () => ({ count: 0, label: "base" }),
        { name: "s", storage, hydrateOnCreate: true },
      ),
    );
    // Persisted count applied, base label preserved.
    expect(store.getState()).toEqual({ count: 42, label: "base" });
  });

  it("does NOT hydrate at create by default (deferred rehydrate path)", () => {
    const storage = memStorage({ s: JSON.stringify({ state: { count: 42 } }) });
    const store = createStore(
      persist<{ count: number }>(() => ({ count: 0 }), { name: "s", storage }),
    );
    expect(store.getState().count).toBe(0);
    // Manual rehydrate applies it.
    const api = store as typeof store & { persist: { rehydrate: () => void; hasHydrated: () => boolean } };
    expect(api.persist.hasHydrated()).toBe(false);
    api.persist.rehydrate();
    expect(store.getState().count).toBe(42);
    expect(api.persist.hasHydrated()).toBe(true);
  });

  it("ignores corrupt persisted JSON and keeps the base state", () => {
    const storage = memStorage({ s: "{not valid json" });
    const store = createStore(
      persist<{ count: number }>(() => ({ count: 7 }), {
        name: "s",
        storage,
        hydrateOnCreate: true,
      }),
    );
    expect(store.getState().count).toBe(7);
  });

  it("rehydrate runs at most once", () => {
    const storage = memStorage({ s: JSON.stringify({ state: { count: 1 } }) });
    const store = createStore(
      persist<{ count: number }>(() => ({ count: 0 }), { name: "s", storage }),
    );
    const api = store as typeof store & { persist: { rehydrate: () => void } };
    api.persist.rehydrate();
    storage.map.set("s", JSON.stringify({ state: { count: 999 } }));
    api.persist.rehydrate(); // no-op, already hydrated
    expect(store.getState().count).toBe(1);
  });
});

describe("computed — memoized derived values", () => {
  it("derives a value from state", () => {
    const store = createStore(() => ({ items: [1, 2, 3] }));
    const total = computed(store, (s) => s.items.reduce((a, b) => a + b, 0));
    expect(total.get()).toBe(6);
  });

  it("memoizes: compute does not re-run until state changes", () => {
    const store = createStore(() => ({ n: 2, other: 0 }));
    const compute = vi.fn((s: { n: number; other: number }) => s.n * 10);
    const c = computed(store, compute);
    c.get();
    c.get();
    c.get();
    expect(compute).toHaveBeenCalledTimes(1); // memoized across reads
    store.setState({ other: 1 }); // state ref changes
    expect(c.get()).toBe(20);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("subscribers fire only when the derived value changes", () => {
    const store = createStore(() => ({ n: 1, unrelated: 0 }));
    const c = computed(store, (s) => s.n * 2);
    const listener = vi.fn();
    c.subscribe(listener);

    store.setState({ unrelated: 5 }); // derived value unchanged (still 2)
    expect(listener).not.toHaveBeenCalled();

    store.setState({ n: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(6, 2);
  });

  it("supports a shallow equality fn for object results", () => {
    const store = createStore(() => ({ a: 1, b: 2, c: 0 }));
    const c = computed(store, (s) => ({ a: s.a, b: s.b }), { equalityFn: shallow });
    const listener = vi.fn();
    c.subscribe(listener);
    store.setState({ c: 9 });
    expect(listener).not.toHaveBeenCalled();
    store.setState({ a: 10 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("combineSlices — composing slices & actions", () => {
  type Store = {
    bears: number;
    addBear: () => void;
    fish: number;
    addFish: () => void;
    total: () => number;
  };

  it("merges multiple slices into one store", () => {
    const bearSlice = (set: any): Partial<Store> => ({
      bears: 0,
      addBear: () => set((s: Store) => ({ bears: s.bears + 1 })),
    });
    const fishSlice = (set: any, get: any): Partial<Store> => ({
      fish: 0,
      addFish: () => set((s: Store) => ({ fish: s.fish + 1 })),
      total: () => get().bears + get().fish,
    });

    const store = createStore<Store>(combineSlices(bearSlice, fishSlice));
    expect(store.getState().bears).toBe(0);
    expect(store.getState().fish).toBe(0);

    store.getState().addBear();
    store.getState().addFish();
    store.getState().addFish();
    expect(store.getState().bears).toBe(1);
    expect(store.getState().fish).toBe(2);
    // A slice action can read across slices via get().
    expect(store.getState().total()).toBe(3);
  });

  it("later slices override earlier keys on conflict", () => {
    const a = (): Partial<{ x: number }> => ({ x: 1 });
    const b = (): Partial<{ x: number }> => ({ x: 2 });
    const store = createStore<{ x: number }>(combineSlices(a, b));
    expect(store.getState().x).toBe(2);
  });
});
