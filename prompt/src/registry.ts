/**
 * Prompt registry & versioning.
 *
 * A tiny in-memory store for named, versioned prompt templates — so a codebase
 * can register its prompts in one place, look them up by name, keep several
 * versions side by side (for A/B tests or rollouts), and resolve the latest.
 * Pure and synchronous; no I/O.
 */

import { prompt, type Prompt } from "./render.js";

/** A single registered entry: the compiled prompt plus its version tag. */
export interface RegisteredPrompt {
  name: string;
  version: string;
  prompt: Prompt;
}

/** Options for {@link PromptRegistry.register}. */
export interface RegisterOptions {
  /** Version tag for this template (default `"1"`). */
  version?: string;
  /**
   * Mark this version as the one {@link PromptRegistry.get}/`latest` resolves
   * to. Defaults to `true` for the first version of a name, else `false`
   * (registering never silently steals "latest" from an existing default).
   */
  latest?: boolean;
}

/** The registry returned by {@link createRegistry}. */
export interface PromptRegistry {
  /**
   * Register a template under `name`/`version`. Returns the compiled
   * {@link Prompt}. Throws if that exact name+version already exists.
   */
  register(name: string, template: string, opts?: RegisterOptions): Prompt;
  /** Get a prompt by name (latest version) or by explicit `name`+`version`. */
  get(name: string, version?: string): Prompt;
  /** Like {@link get} but returns `undefined` instead of throwing. */
  tryGet(name: string, version?: string): Prompt | undefined;
  /** The prompt marked latest for `name`. Throws if `name` is unknown. */
  latest(name: string): Prompt;
  /** Whether `name` (optionally a specific `version`) is registered. */
  has(name: string, version?: string): boolean;
  /** All registered names, in insertion order. */
  list(): string[];
  /** All version tags registered for `name`, in insertion order. */
  versions(name: string): string[];
  /** Remove a name (all versions) or one `version`. Returns whether it existed. */
  remove(name: string, version?: string): boolean;
  /** Total number of registered (name, version) entries. */
  readonly size: number;
}

/**
 * Create an isolated prompt registry.
 *
 * ```ts
 * const reg = createRegistry();
 * reg.register("greeting", "Hi {{name}}");
 * reg.register("greeting", "Hello there, {{name}}!", { version: "2", latest: true });
 * reg.get("greeting").render({ name: "Ada" });        // latest → v2
 * reg.get("greeting", "1").render({ name: "Ada" });   // pinned → v1
 * reg.versions("greeting");                           // ["1", "2"]
 * ```
 */
export function createRegistry(): PromptRegistry {
  // name -> (version -> entry), both insertion-ordered via Map
  const store = new Map<string, Map<string, RegisteredPrompt>>();
  const latestOf = new Map<string, string>();

  function requireName(name: string): Map<string, RegisteredPrompt> {
    const byVer = store.get(name);
    if (!byVer) throw new Error(`[@lacspace/prompt] No prompt registered as "${name}".`);
    return byVer;
  }

  const registry: PromptRegistry = {
    register(name, template, opts = {}) {
      const version = opts.version ?? "1";
      let byVer = store.get(name);
      if (!byVer) {
        byVer = new Map();
        store.set(name, byVer);
      }
      if (byVer.has(version)) {
        throw new Error(
          `[@lacspace/prompt] Prompt "${name}" version "${version}" is already registered.`,
        );
      }
      const compiled = prompt(template);
      byVer.set(version, { name, version, prompt: compiled });
      const makeLatest = opts.latest ?? !latestOf.has(name);
      if (makeLatest) latestOf.set(name, version);
      return compiled;
    },
    get(name, version) {
      const byVer = requireName(name);
      if (version === undefined) return registry.latest(name);
      const entry = byVer.get(version);
      if (!entry) {
        throw new Error(
          `[@lacspace/prompt] Prompt "${name}" has no version "${version}".`,
        );
      }
      return entry.prompt;
    },
    tryGet(name, version) {
      const byVer = store.get(name);
      if (!byVer) return undefined;
      if (version === undefined) {
        const v = latestOf.get(name);
        return v ? byVer.get(v)?.prompt : undefined;
      }
      return byVer.get(version)?.prompt;
    },
    latest(name) {
      requireName(name);
      const v = latestOf.get(name)!;
      return store.get(name)!.get(v)!.prompt;
    },
    has(name, version) {
      const byVer = store.get(name);
      if (!byVer) return false;
      return version === undefined ? true : byVer.has(version);
    },
    list() {
      return [...store.keys()];
    },
    versions(name) {
      const byVer = store.get(name);
      return byVer ? [...byVer.keys()] : [];
    },
    remove(name, version) {
      const byVer = store.get(name);
      if (!byVer) return false;
      if (version === undefined) {
        store.delete(name);
        latestOf.delete(name);
        return true;
      }
      if (!byVer.has(version)) return false;
      byVer.delete(version);
      if (byVer.size === 0) {
        store.delete(name);
        latestOf.delete(name);
      } else if (latestOf.get(name) === version) {
        // fall back to the most recently registered remaining version
        const remaining = [...byVer.keys()];
        latestOf.set(name, remaining[remaining.length - 1]!);
      }
      return true;
    },
    get size() {
      let n = 0;
      for (const byVer of store.values()) n += byVer.size;
      return n;
    },
  };
  return registry;
}
