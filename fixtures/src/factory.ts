import type {
  AfterBuildHook,
  BuildContext,
  BuildOptions,
  ExtendDef,
  Factory,
  FactoryDef,
  Trait,
  TraitBuilder,
} from "./types";
import { hashSeed, hashString, makeRng, mulberry32 } from "./rng";
import { getBaseSeed, registerResetter } from "./state";
import {
  ASSOC,
  Association,
  deepMerge,
  FACTORY,
  resolveAssociations,
} from "./merge";

/** Split the reserved control keys out of a build-options object. */
function splitOptions<T, P>(
  opts: BuildOptions<T, P> | undefined,
): { overrides: Record<string, unknown>; traits: string[]; transient: Partial<P> } {
  if (!opts) return { overrides: {}, traits: [], transient: {} };
  const { traits, transient, ...rest } = opts as Record<string, unknown> & {
    traits?: string[];
    transient?: Partial<P>;
  };
  return {
    overrides: rest as Record<string, unknown>,
    traits: (traits as string[] | undefined) ?? [],
    transient: (transient as Partial<P> | undefined) ?? {},
  };
}

function resolveTransientDefaults<P>(t: FactoryDef<unknown, P>["transient"]): P {
  if (typeof t === "function") return (t as () => P)();
  return (t ?? {}) as P;
}

/**
 * Create a typed test-data factory. `T` is inferred from `def.build`'s return
 * type, so the factory is fully typed with no manual annotation.
 */
export function defineFactory<T, P = Record<string, any>>(
  def: FactoryDef<T, P>,
): Factory<T, P> {
  // A stable salt derived from the optional factory name. Streams depend only on
  // (baseSeed, salt, sequence) — never on factory *creation order* — so a
  // re-created factory reproduces identical output. Name factories to give them
  // independent, decorrelated streams; unnamed factories share the salt `0`.
  const salt = def.name ? hashString(def.name) : 0;
  const traits: Record<string, Trait<T, P>> = { ...(def.traits ?? {}) };
  const afterHooks: AfterBuildHook<T, P>[] = def.afterBuild ? [def.afterBuild] : [];

  let counter = 0;
  registerResetter(() => {
    counter = 0;
  });

  function makeCtx(sequence: number, params: P): BuildContext<P> {
    const rng = makeRng(makeStream(getBaseSeed(), salt, sequence));
    const ctx = {
      sequence,
      params,
      seed: rng,
      next: rng.next,
      int: rng.int,
      float: rng.float,
      bool: rng.bool,
      pick: rng.pick,
      sample: rng.sample,
      uuid: rng.uuid,
    } as BuildContext<P>;
    return ctx;
  }

  function buildOne(
    opts: BuildOptions<T, P> | undefined,
    extraTraits: string[],
  ): T {
    const { overrides, traits: optTraits, transient } = splitOptions<T, P>(opts);
    const sequence = ++counter;

    const params = { ...resolveTransientDefaults<P>(def.transient), ...transient } as P;
    const ctx = makeCtx(sequence, params);

    // 1. base build (may contain association markers / nested factories)
    let obj: unknown = def.build(ctx);

    // 2. apply traits, in order (extraTraits from withTrait first, then per-build)
    for (const name of [...extraTraits, ...optTraits]) {
      const trait = traits[name];
      if (!trait) throw new Error(`Unknown trait "${name}" on this factory`);
      const patch = typeof trait === "function" ? (trait as any)(ctx) : trait;
      obj = deepMerge(obj, patch, ctx);
    }

    // 3. apply explicit overrides (deep-merge; functions get the ctx)
    obj = deepMerge(obj, overrides, ctx);

    // 4. resolve any associations that survived the overrides
    obj = resolveAssociations(obj, ctx);

    // 5. after-build hooks
    for (const hook of afterHooks) {
      const replaced = hook(obj as T, ctx);
      if (replaced !== undefined) obj = replaced;
    }

    return obj as T;
  }

  function buildList(n: number, opts?: BuildOptions<T, P>): T[] {
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(buildOne(opts, []));
    return out;
  }

  function withTrait(name: string): TraitBuilder<T, P> {
    const acc: string[] = [name];
    const builder: TraitBuilder<T, P> = {
      withTrait(next) {
        acc.push(next);
        return builder;
      },
      build(o) {
        return buildOne(o, acc);
      },
      buildList(count, o) {
        const out: T[] = [];
        for (let i = 0; i < count; i++) out.push(buildOne(o, acc));
        return out;
      },
      buildMany(count, o) {
        return builder.buildList(count, o);
      },
    };
    return builder;
  }

  const factory: Factory<T, P> = {
    build(o) {
      return buildOne(o, []);
    },
    buildList,
    buildMany: buildList,
    withTrait,
    afterBuild(hook) {
      afterHooks.push(hook);
      return factory;
    },
    extend(extension) {
      return extendFactory<T, P>(def, extension as any);
    },
    get traitNames() {
      return Object.keys(traits);
    },
  };

  // Brand so a factory can be dropped straight into a field as an association.
  Object.defineProperty(factory, FACTORY, { value: true, enumerable: false });
  return factory;
}

/** Is this an {@link ExtendDef} (vs. a bare traits map)? */
function isExtendDef(v: Record<string, unknown>): boolean {
  return (
    typeof v.build === "function" ||
    "traits" in v ||
    "transient" in v ||
    typeof v.afterBuild === "function"
  );
}

function extendFactory<T, P>(
  parent: FactoryDef<T, P>,
  extension: ExtendDef<T, any, P> | Record<string, Trait<any, P>>,
): Factory<any, P> {
  const ext = isExtendDef(extension as Record<string, unknown>)
    ? (extension as ExtendDef<T, any, P>)
    : ({ traits: extension as Record<string, Trait<any, P>> } as ExtendDef<T, any, P>);

  const mergedDef: FactoryDef<any, P> = {
    name: parent.name,
    build: (ctx) => {
      const base = parent.build(ctx);
      if (!ext.build) return base;
      return deepMerge(base, ext.build(ctx), ctx);
    },
    traits: { ...(parent.traits ?? {}), ...(ext.traits ?? {}) },
    transient: () => ({
      ...resolveTransientDefaults<P>(parent.transient),
      ...(typeof ext.transient === "function"
        ? (ext.transient as () => Partial<P>)()
        : ((ext.transient ?? {}) as Partial<P>)),
    }),
    afterBuild: (obj, ctx) => {
      let cur: any = obj;
      if (parent.afterBuild) {
        const r = parent.afterBuild(cur, ctx);
        if (r !== undefined) cur = r;
      }
      if (ext.afterBuild) {
        const r = ext.afterBuild(cur, ctx);
        if (r !== undefined) cur = r;
      }
      return cur;
    },
  };
  return defineFactory<any, P>(mergedDef);
}

/** Derive an independent, reproducible RNG stream for one build. */
function makeStream(baseSeed: number, salt: number, sequence: number): () => number {
  return mulberry32(hashSeed(baseSeed, salt, sequence));
}

/**
 * Create a lazy association value typed as the built shape `U`, so it slots
 * cleanly into a `build(ctx)` return object. It is only built when the parent
 * is built — and skipped entirely if an override replaces the field.
 */
export function assoc<U, P = Record<string, any>>(
  factory: Factory<U, P>,
  overrides?: BuildOptions<U, P>,
): U {
  const marker: Association = {
    [ASSOC]: true,
    build: () => factory.build(overrides),
  };
  return marker as unknown as U;
}

/**
 * One-shot shortcut: build a single object from a factory OR a raw definition.
 */
export function build<T, P = Record<string, any>>(
  factoryOrDef: Factory<T, P> | FactoryDef<T, P>,
  overrides?: BuildOptions<T, P>,
): T {
  const factory = isFactoryValue<T, P>(factoryOrDef)
    ? factoryOrDef
    : defineFactory<T, P>(factoryOrDef);
  return factory.build(overrides);
}

function isFactoryValue<T, P>(v: unknown): v is Factory<T, P> {
  return typeof v === "object" && v !== null && (v as any)[FACTORY] === true;
}
