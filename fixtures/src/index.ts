export type {
  Rng,
  BuildContext,
  CtxFn,
  Override,
  Overrides,
  BuildOptions,
  Trait,
  AfterBuildHook,
  FactoryDef,
  ExtendDef,
  TraitBuilder,
  Factory,
} from "./types";

export { defineFactory, assoc, build } from "./factory";
export { sequence } from "./sequence";
export type { Sequence } from "./sequence";
export { seed, resetSequences, getBaseSeed } from "./state";

// Seeded, zero-dependency fake-data generator (also exposed as `ctx.fake`).
export { makeFaker, fake } from "./fake";
export type { Faker, EmailOptions } from "./fake";

// Lifecycle / teardown hooks for fixtures that touch real resources.
export {
  registerCleanup,
  runCleanup,
  clearCleanup,
  cleanupCount,
} from "./cleanup";
export type { CleanupFn } from "./cleanup";

// Async materialisation: resolve promise-valued fields of a built object.
export { deepAwait } from "./async";

// Low-level, deterministic RNG primitives — handy for advanced/custom fixtures.
export { makeRng, mulberry32, hashSeed } from "./rng";
