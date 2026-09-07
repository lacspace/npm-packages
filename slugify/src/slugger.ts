/**
 * Stateful slug generation and validation helpers.
 *
 * `slugger()` remembers every slug it has emitted so repeat inputs
 * automatically receive `-2`, `-3`, … suffixes without you tracking a set.
 * `isSlug()` validates that a string is already a canonical slug.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { slugify, uniqueSlug, SlugOptions } from "./index";

/** A callable slug generator that remembers what it has produced. */
export interface Slugger {
  /** Generate the next unique slug for `input` (alias of `.slug`). */
  (input: string, opts?: SlugOptions): string;
  /** Generate the next unique slug for `input`, remembering the result. */
  slug(input: string, opts?: SlugOptions): string;
  /** Whether this slugger has already emitted (or been told of) `slug`. */
  has(slug: string): boolean;
  /** Mark one or more slugs as taken without emitting them. */
  add(...slugs: string[]): void;
  /** Forget everything emitted so far. */
  reset(): void;
  /** Read-only view of every slug emitted or added so far. */
  readonly seen: ReadonlySet<string>;
}

/**
 * Create a stateful slugger. Each call returns a unique slug, appending
 * `-2`, `-3`, … (or a `suffix`/`counterStart` from opts) on collisions with
 * anything it has already emitted. `baseOpts` apply to every call and are
 * shallow-merged with (and overridden by) per-call opts.
 *
 * @example
 * const next = slugger();
 * next("Hello");        // "hello"
 * next("Hello");        // "hello-2"
 * next("Hello");        // "hello-3"
 */
export function slugger(baseOpts: SlugOptions = {}): Slugger {
  const used = new Set<string>();

  const gen = (input: string, opts: SlugOptions = {}): string => {
    const merged: SlugOptions = {
      ...baseOpts,
      ...opts,
      replace: { ...baseOpts.replace, ...opts.replace },
    };
    const s = uniqueSlug(input, used, merged);
    used.add(s);
    return s;
  };

  const fn = gen as Slugger;
  fn.slug = gen;
  fn.has = (s: string) => used.has(s);
  fn.add = (...slugs: string[]) => {
    for (const s of slugs) used.add(s);
  };
  fn.reset = () => used.clear();
  Object.defineProperty(fn, "seen", {
    enumerable: true,
    get: () => used as ReadonlySet<string>,
  });
  return fn;
}

/**
 * Validate that a string is already a canonical slug — i.e. slugifying it with
 * the same options is a no-op. Empty strings are never valid slugs.
 *
 * @example
 * isSlug("hello-world");            // true
 * isSlug("Hello World");           // false
 * isSlug("hello_world", { separator: "_" }); // true
 */
export function isSlug(str: string, opts: SlugOptions = {}): boolean {
  if (typeof str !== "string" || str.length === 0) return false;
  return slugify(str, opts) === str;
}
