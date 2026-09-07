import { deepEqual } from "./equal";
import type { AnyFn, Spy, SpyResult } from "./types";

type Behavior =
  | { type: "fake"; fn: AnyFn }
  | { type: "return"; value: unknown }
  | { type: "throw"; error: unknown }
  | { type: "resolve"; value: unknown }
  | { type: "reject"; error: unknown };

/** Internal knobs used by spyOn/stub; not part of the public surface. */
export interface SpyInternalOptions {
  /** Default behaviour when nothing is programmed (e.g. call-through). */
  defaultBehavior?: Behavior;
  /** Called by `.restore()`; the standalone `spy()` leaves this undefined. */
  onRestore?: () => void;
}

function invoke(b: Behavior, thisArg: unknown, args: unknown[]): unknown {
  switch (b.type) {
    case "fake":
      return b.fn.apply(thisArg, args);
    case "return":
      return b.value;
    case "throw":
      throw b.error;
    case "resolve":
      return Promise.resolve(b.value);
    case "reject":
      return Promise.reject(b.error);
  }
}

/**
 * Create a callable spy. With no `impl` the spy records calls and returns
 * `undefined`; with an `impl` it records calls and delegates to `impl` until a
 * behaviour is programmed.
 *
 * The returned function's type mirrors `impl`, so `spy((a: number) => a + 1)`
 * is fully typed. Use the generic form `spy<(x: string) => void>()` to type a
 * bare spy.
 */
export function spy<F extends AnyFn = AnyFn>(impl?: F): Spy<F> {
  return createSpy<F>(impl ? { defaultBehavior: { type: "fake", fn: impl } } : {});
}

/** Shared factory used by {@link spy}, {@link spyOn} and {@link stub}. */
export function createSpy<F extends AnyFn = AnyFn>(options: SpyInternalOptions = {}): Spy<F> {
  const calls: unknown[][] = [];
  const results: SpyResult<unknown>[] = [];
  const onceQueue: Behavior[] = [];
  let defaultBehavior: Behavior | undefined = options.defaultBehavior;

  const fn = function (this: unknown, ...args: unknown[]): unknown {
    calls.push(args);
    const behavior = onceQueue.length > 0 ? onceQueue.shift()! : defaultBehavior;
    try {
      const value = behavior ? invoke(behavior, this, args) : undefined;
      results.push({ type: "return", value });
      return value;
    } catch (error) {
      results.push({ type: "throw", value: error });
      throw error;
    }
  } as unknown as Spy<F>;

  const self = fn as Spy<F> & Record<string, unknown>;

  // Live, read-only introspection.
  Object.defineProperties(self, {
    calls: { get: () => calls, enumerable: true },
    results: { get: () => results, enumerable: true },
    callCount: { get: () => calls.length, enumerable: true },
    called: { get: () => calls.length > 0, enumerable: true },
    calledOnce: { get: () => calls.length === 1, enumerable: true },
    firstCall: { get: () => calls[0], enumerable: true },
    lastCall: { get: () => calls[calls.length - 1], enumerable: true },
  });

  self.calledWith = (...args: unknown[]): boolean =>
    calls.some((call) => deepEqual(call, args));

  self.reset = (): void => {
    calls.length = 0;
    results.length = 0;
  };

  self.restore = (): void => {
    options.onRestore?.();
  };

  // Behaviour programming — all chainable.
  self.returns = (value: unknown) => {
    defaultBehavior = { type: "return", value };
    return self;
  };
  self.throws = (error: unknown) => {
    defaultBehavior = { type: "throw", error };
    return self;
  };
  self.resolves = (value?: unknown) => {
    defaultBehavior = { type: "resolve", value };
    return self;
  };
  self.rejects = (error?: unknown) => {
    defaultBehavior = { type: "reject", error };
    return self;
  };
  self.callsFake = (impl: AnyFn) => {
    defaultBehavior = { type: "fake", fn: impl };
    return self;
  };

  self.returnsOnce = (value: unknown) => {
    onceQueue.push({ type: "return", value });
    return self;
  };
  self.resolvesOnce = (value?: unknown) => {
    onceQueue.push({ type: "resolve", value });
    return self;
  };
  self.throwsOnce = (error: unknown) => {
    onceQueue.push({ type: "throw", error });
    return self;
  };

  return self;
}
