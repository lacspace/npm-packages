/**
 * Public types for `@lacspace/fixtures`.
 *
 * The build-result type `T` is always inferred from a factory definition's
 * `build(ctx)` return value, so consumers rarely need to name these directly.
 */

import type { Faker } from "./fake";

/**
 * A small, deterministic random-number generator bound to a single build.
 * Every method draws from the same seeded stream, so identical seeds and
 * sequence numbers always produce identical values.
 */
export interface Rng {
  /** A float in `[0, 1)`, like `Math.random` but deterministic. */
  next(): number;
  /** An integer in `[min, max]` (both inclusive). */
  int(min: number, max: number): number;
  /** A float in `[min, max)`. */
  float(min: number, max: number): number;
  /** `true` with probability `p` (default `0.5`). */
  bool(p?: number): boolean;
  /** A uniformly random element of `arr`. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** `n` distinct elements of `arr` in random order (clamped to `arr.length`). */
  sample<T>(arr: readonly T[], n: number): T[];
  /** A deterministic RFC-4122-shaped v4 UUID drawn from the stream. */
  uuid(): string;
}

/**
 * The context passed to a factory's `build(ctx)`. It is also an {@link Rng},
 * so `ctx.int(1, 10)` and `ctx.seed.int(1, 10)` are equivalent.
 *
 * @typeParam P transient-params shape for this factory.
 */
export interface BuildContext<P = Record<string, any>> extends Rng {
  /** 1-based counter that increments on every build (reset by `resetSequences`). */
  readonly sequence: number;
  /** Transient params — influence the build but are not part of the output. */
  readonly params: P;
  /** The deterministic RNG for this build (same object the `ctx.*` helpers use). */
  readonly seed: Rng;
  /** Seeded fake-data helpers (names, emails, dates, …) bound to this build's RNG. */
  readonly fake: Faker;
}

/** A value produced from the build context (a "lazy" field value). */
export type CtxFn<V, P = Record<string, any>> = (ctx: BuildContext<P>) => V;

/**
 * A deep, partial override for a single field. A field may be replaced with a
 * concrete value, a `(ctx) => value` function, or — for object fields — a
 * nested partial override that deep-merges into the built value.
 */
export type Override<V, P = Record<string, any>> =
  | CtxFn<V, P>
  | (V extends readonly any[]
      ? V
      : V extends object
        ? { [K in keyof V]?: Override<V[K], P> } | V
        : V);

/** A map of per-field overrides for `T`. */
export type Overrides<T, P = Record<string, any>> = {
  [K in keyof T]?: Override<T[K], P>;
};

/**
 * Options accepted by `build`/`buildList`: field overrides plus the reserved
 * `traits` and `transient` control keys.
 */
export type BuildOptions<T, P = Record<string, any>> = Overrides<T, P> & {
  /** Names of traits (defined on the factory) to apply, in order. */
  traits?: string[];
  /** Transient params for this build, merged over the factory defaults. */
  transient?: Partial<P>;
};

/**
 * A trait: a named bundle of overrides applied on top of the base build.
 * It is either an overrides map or a `(ctx) => Partial<T>` function.
 */
export type Trait<T, P = Record<string, any>> =
  | Overrides<T, P>
  | CtxFn<Partial<T>, P>;

/** A post-build hook. Return a value to replace the object, or mutate in place. */
export type AfterBuildHook<T, P = Record<string, any>> = (
  obj: T,
  ctx: BuildContext<P>,
) => void | T;

/** The definition passed to {@link defineFactory}. */
export interface FactoryDef<T, P = Record<string, any>> {
  /**
   * Optional stable name. It salts this factory's RNG stream so its random
   * values are independent of other factories' (and of creation order). Two
   * factories with the same name share a stream; unnamed factories all share
   * the default salt. Output stays reproducible either way.
   */
  name?: string;
  /** Builds one object from the deterministic context. */
  build: (ctx: BuildContext<P>) => T;
  /** Named traits that can be switched on per build. */
  traits?: Record<string, Trait<T, P>>;
  /** Default transient params (object, or a factory function for fresh values). */
  transient?: P | (() => P);
  /** A hook run after every build (base, traits and overrides applied). */
  afterBuild?: AfterBuildHook<T, P>;
}

/** A partial definition passed to {@link Factory.extend}. */
export interface ExtendDef<T, U = {}, P = Record<string, any>> {
  /** Extra fields to merge onto the parent build result. */
  build?: (ctx: BuildContext<P>) => U;
  /** Traits to add (merged with the parent's traits). */
  traits?: Record<string, Trait<T & U, P>>;
  /** Extra/overriding default transient params. */
  transient?: Partial<P> | (() => Partial<P>);
  /** An extra after-build hook, run after the parent's. */
  afterBuild?: AfterBuildHook<T & U, P>;
}

/** A chained builder produced by {@link Factory.withTrait}. */
export interface TraitBuilder<T, P = Record<string, any>> {
  /** Add another trait and keep chaining. */
  withTrait(name: string): TraitBuilder<T, P>;
  /** Materialise a single object with the accumulated traits. */
  build(overrides?: BuildOptions<T, P>): T;
  /** Materialise `n` objects with the accumulated traits. */
  buildList(n: number, overrides?: BuildOptions<T, P>): T[];
  /** Alias of {@link TraitBuilder.buildList}. */
  buildMany(n: number, overrides?: BuildOptions<T, P>): T[];
}

/** A reusable, typed test-data factory. */
export interface Factory<T, P = Record<string, any>> {
  /** Build one `T`. Overrides deep-merge; function overrides receive the ctx. */
  build(overrides?: BuildOptions<T, P>): T;
  /** Build an array of `n` objects (each with its own incrementing sequence). */
  buildList(n: number, overrides?: BuildOptions<T, P>): T[];
  /** Alias of {@link Factory.buildList}. */
  buildMany(n: number, overrides?: BuildOptions<T, P>): T[];
  /** Build one `T`, then deep-resolve any `Promise`-valued fields it contains. */
  buildAsync(overrides?: BuildOptions<T, P>): Promise<Awaited<T>>;
  /** Build `n` objects, each with its promise-valued fields resolved. */
  buildListAsync(n: number, overrides?: BuildOptions<T, P>): Promise<Awaited<T>[]>;
  /** Start a chained builder pre-loaded with a trait. */
  withTrait(name: string): TraitBuilder<T, P>;
  /** Derive a new factory with extra fields, traits, transient defaults or hooks. */
  extend<U extends object = {}>(
    def: ExtendDef<T, U, P> | Record<string, Trait<T & U, P>>,
  ): Factory<T & U, P>;
  /** Register an extra after-build hook. Returns the same factory for chaining. */
  afterBuild(hook: AfterBuildHook<T, P>): Factory<T, P>;
  /** Names of the traits defined on this factory. */
  readonly traitNames: string[];
}
