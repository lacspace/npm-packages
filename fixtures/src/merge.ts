import type { BuildContext } from "./types";

/** Brand for an unbuilt association placeholder. */
export const ASSOC = Symbol("lacspace.fixtures.association");

/** Brand set on every Factory object so it can be detected structurally. */
export const FACTORY = Symbol("lacspace.fixtures.factory");

/** True for a Factory object (may be dropped straight into a field). */
export function isFactory(v: unknown): v is { build: (o?: unknown) => unknown } {
  return typeof v === "object" && v !== null && (v as any)[FACTORY] === true;
}

/**
 * A lazily-resolved association. Created by `assoc(factory, overrides)` and
 * left in the built object until the resolve pass — so an override can replace
 * the field and the associated factory is then never built.
 */
export interface Association {
  readonly [ASSOC]: true;
  readonly build: (ctx: BuildContext<any>) => unknown;
}

export function isAssociation(v: unknown): v is Association {
  return typeof v === "object" && v !== null && (v as any)[ASSOC] === true;
}

/** True for a plain `{}` object (not an array, class instance, Date, marker, …). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return false;
  if (isAssociation(v) || isFactory(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merge an override tree onto a base value.
 *
 * Rules:
 * - `undefined` override leaves the base untouched;
 * - a function override is called with `ctx` and its result REPLACES the base;
 * - two plain objects merge recursively;
 * - anything else (arrays, primitives, class instances, association markers)
 *   REPLACES the base.
 */
export function deepMerge(base: unknown, override: unknown, ctx: BuildContext<any>): unknown {
  if (override === undefined) return base;
  if (typeof override === "function") {
    return (override as (c: BuildContext) => unknown)(ctx);
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(override)) {
      out[key] = deepMerge(base[key], override[key], ctx);
    }
    return out;
  }
  return override;
}

/**
 * Walk a value and build any remaining {@link Association} markers. Runs AFTER
 * overrides, so overridden association fields are never built (true laziness).
 */
export function resolveAssociations(value: unknown, ctx: BuildContext<any>): unknown {
  if (isAssociation(value)) {
    return resolveAssociations(value.build(ctx), ctx);
  }
  if (isFactory(value)) {
    // A Factory dropped straight into a field: build it with no overrides.
    return value.build();
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveAssociations(v, ctx));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = resolveAssociations(value[key], ctx);
    }
    return out;
  }
  return value;
}
