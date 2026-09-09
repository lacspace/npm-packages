/**
 * @lacspace/events
 *
 * A fully type-safe event emitter / tiny pub-sub for Node and the browser.
 * You declare an events map (event name → payload type) once and every
 * `on`/`once`/`emit`/`waitFor` call is checked against it at compile time —
 * no string typos, no `any` payloads. Zero dependencies, isomorphic, and
 * tree-shakeable. Comparable to mitt / nanoevents / eventemitter3, but with
 * strong typing and a few extra ergonomics (error isolation, `waitFor`,
 * wildcard listeners, an unsubscribe handle from every subscription).
 *
 * Two guarantees worth calling out:
 *
 *  1. **Error isolation.** A handler that throws never stops the others.
 *     Every listener for an event runs; a thrown error is routed to the
 *     optional `onError` callback (or swallowed if none is given).
 *
 *  2. **Safe mutation during emit.** Adding or removing listeners from inside
 *     a handler is fine — `emit` iterates over a *snapshot* of the listener
 *     set taken before dispatch, so a handler added mid-emit won't fire for
 *     the in-flight event and a removed one won't be called after removal.
 *
 * @example
 * import { createEmitter } from "@lacspace/events";
 *
 * type Events = {
 *   login: { userId: string };
 *   logout: void;
 *   message: string;
 * };
 *
 * const bus = createEmitter<Events>();
 * const off = bus.on("login", ({ userId }) => console.log("hi", userId));
 * bus.emit("login", { userId: "u1" }); // ✓ typed
 * // bus.emit("login", { user: "u1" }); // ✗ compile error
 * off(); // unsubscribe
 *
 * const { userId } = await bus.waitFor("login"); // resolves on next login
 */

/**
 * The shape of an emitter's events: a map from event name to the payload type
 * carried by that event. Use `void` (or `undefined`) for events with no data.
 *
 * @example
 * type Events = { tick: number; done: void; error: Error };
 */
export type EventMap = Record<string, unknown>;

/** A listener for a single event's payload. */
export type Handler<T> = (payload: T) => void;

/** A listener that receives the event name alongside the payload. See {@link Emitter.onAny}. */
export type WildcardHandler<E extends EventMap> = <K extends keyof E>(event: K, payload: E[K]) => void;

/** Unsubscribe handle returned by every subscription. Calling it more than once is a no-op. */
export type Unsubscribe = () => void;

/**
 * A strongly-typed event emitter over the events map `E`.
 *
 * Every method is generic over the event key `K`, so payload types flow
 * automatically: `on("login", h)` infers `h`'s argument as `E["login"]`, and
 * `emit("login", p)` requires `p` to be exactly `E["login"]`.
 */
export interface Emitter<E extends EventMap> {
  /**
   * Subscribe to `event`. Returns an unsubscribe function — the tidiest way to
   * clean up (no need to hold onto the handler reference).
   *
   * @example
   * const off = bus.on("message", (text) => render(text));
   * // later…
   * off();
   */
  on<K extends keyof E>(event: K, handler: Handler<E[K]>): Unsubscribe;

  /**
   * Subscribe to `event` for exactly one dispatch, then auto-unsubscribe.
   * Returns an unsubscribe function you can call to cancel before it fires.
   */
  once<K extends keyof E>(event: K, handler: Handler<E[K]>): Unsubscribe;

  /**
   * Remove a listener. With `handler`, removes that specific subscription
   * (including a matching `once` registration). Without `handler`, removes
   * *all* listeners for `event`.
   */
  off<K extends keyof E>(event: K, handler?: Handler<E[K]>): void;

  /**
   * Dispatch `event` with `payload` to every current listener.
   *
   * Listeners run over a snapshot, so subscribing/unsubscribing during dispatch
   * is safe. A throwing listener does not stop the rest; its error goes to the
   * `onError` option if one was supplied.
   */
  emit<K extends keyof E>(event: K, payload: E[K]): void;

  /** Number of listeners for `event`, or the grand total (including wildcard) if omitted. */
  listenerCount(event?: keyof E): number;

  /** Remove every listener for `event`, or every listener of every kind (including wildcard) if omitted. */
  removeAllListeners(event?: keyof E): void;

  /**
   * Resolve with the payload of the next `event`. Built on {@link Emitter.once}.
   *
   * @example
   * const { userId } = await bus.waitFor("login");
   */
  waitFor<K extends keyof E>(event: K): Promise<E[K]>;

  /**
   * Subscribe to *every* event. The handler receives the event name and its
   * payload; the two are correlated so a `switch` on `event` narrows `payload`.
   * Returns an unsubscribe function.
   *
   * @example
   * bus.onAny((event, payload) => log(`${String(event)}`, payload));
   */
  onAny(handler: WildcardHandler<E>): Unsubscribe;

  /** Remove a wildcard listener previously added with {@link Emitter.onAny}. */
  offAny(handler: WildcardHandler<E>): void;
}

/** Options for {@link createEmitter}. */
export interface EmitterOptions<E extends EventMap> {
  /**
   * Called when a listener throws during `emit`, with the thrown value and the
   * event that was being dispatched. Dispatch continues regardless. If omitted,
   * listener errors are swallowed so one bad handler can never break emit.
   */
  onError?: (error: unknown, event: keyof E) => void;
}

/**
 * Create a strongly-typed {@link Emitter}.
 *
 * @typeParam E - the events map (event name → payload type).
 *
 * @example
 * type Events = { tick: number; done: void };
 * const bus = createEmitter<Events>({
 *   onError: (err, event) => console.error(`listener for ${String(event)} threw`, err),
 * });
 * bus.on("tick", (n) => console.log(n));
 * bus.emit("tick", 1);
 */
export function createEmitter<E extends EventMap>(options: EmitterOptions<E> = {}): Emitter<E> {
  const onError = options.onError;

  // event name → ordered set of listeners. A Set gives O(1) add/remove and
  // dedupes accidental double-subscription of the same function.
  const listeners = new Map<keyof E, Set<Handler<unknown>>>();
  const wildcard = new Set<WildcardHandler<E>>();

  function on<K extends keyof E>(event: K, handler: Handler<E[K]>): Unsubscribe {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    let active = true;
    return () => {
      if (!active) return; // idempotent: calling the unsubscribe twice is harmless
      active = false;
      off(event, handler);
    };
  }

  function once<K extends keyof E>(event: K, handler: Handler<E[K]>): Unsubscribe {
    // The wrapper is what actually lives in the set; it self-removes on first
    // fire. We stash the original on it so `off(event, handler)` can find and
    // cancel a pending `once` by the handler the caller passed in.
    const wrapper: Handler<E[K]> & { __original?: Handler<E[K]> } = (payload) => {
      off(event, handler);
      handler(payload);
    };
    wrapper.__original = handler;
    return on(event, wrapper);
  }

  function off<K extends keyof E>(event: K, handler?: Handler<E[K]>): void {
    const set = listeners.get(event);
    if (!set) return;
    if (!handler) {
      listeners.delete(event); // remove every listener for this event
      return;
    }
    // Direct hit, or a `once` wrapper whose original matches.
    for (const fn of set) {
      const original = (fn as { __original?: Handler<unknown> }).__original;
      if (fn === (handler as Handler<unknown>) || original === (handler as Handler<unknown>)) {
        set.delete(fn);
      }
    }
    if (set.size === 0) listeners.delete(event);
  }

  function emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = listeners.get(event);
    if (set && set.size > 0) {
      // Snapshot before dispatch so a handler added mid-emit is not called for
      // the in-flight event; and re-check membership so a handler removed
      // mid-emit (by an earlier handler) is not called after its removal.
      for (const handler of [...set]) {
        if (!set.has(handler)) continue;
        try {
          (handler as Handler<E[K]>)(payload);
        } catch (error) {
          // Isolate: one throwing listener must not stop the others.
          if (onError) onError(error, event);
        }
      }
    }
    if (wildcard.size > 0) {
      for (const handler of [...wildcard]) {
        try {
          handler(event, payload);
        } catch (error) {
          if (onError) onError(error, event);
        }
      }
    }
  }

  function listenerCount(event?: keyof E): number {
    if (event !== undefined) return listeners.get(event)?.size ?? 0;
    let total = wildcard.size;
    for (const set of listeners.values()) total += set.size;
    return total;
  }

  function removeAllListeners(event?: keyof E): void {
    if (event !== undefined) {
      listeners.delete(event);
      return;
    }
    listeners.clear();
    wildcard.clear();
  }

  function waitFor<K extends keyof E>(event: K): Promise<E[K]> {
    return new Promise<E[K]>((resolve) => {
      once(event, resolve);
    });
  }

  function onAny(handler: WildcardHandler<E>): Unsubscribe {
    wildcard.add(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      wildcard.delete(handler);
    };
  }

  function offAny(handler: WildcardHandler<E>): void {
    wildcard.delete(handler);
  }

  return { on, once, off, emit, listenerCount, removeAllListeners, waitFor, onAny, offAny };
}
