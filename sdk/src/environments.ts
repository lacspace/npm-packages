/**
 * @lacspace/sdk — typed environment presets and a client-config resolver.
 *
 * Pick a named Lacspace environment (production / staging / development /
 * local) instead of hard-coding a base URL, and layer several partial config
 * sources (env preset → shared defaults → per-call overrides) into one merged
 * options object. Pure functions — no network, no globals — so they compose
 * cleanly and test deterministically. Zero dependencies, isomorphic.
 */

/** A well-known Lacspace environment. */
export type LacspaceEnvironment = "production" | "staging" | "development" | "local";

/** The resolved connection details for an environment. */
export interface EnvironmentPreset {
  baseURL: string;
  /** Default headers to merge for this environment. */
  headers?: Record<string, string>;
}

/** Built-in base URLs for each named environment. */
export const LACSPACE_ENVIRONMENTS: Record<LacspaceEnvironment, EnvironmentPreset> = {
  production: { baseURL: "https://api.lacspace.com/api" },
  staging: { baseURL: "https://staging-api.lacspace.com/api" },
  development: { baseURL: "https://dev-api.lacspace.com/api" },
  local: { baseURL: "http://localhost:4000/api" },
};

/**
 * Resolve a named environment (or a literal preset) into a concrete preset,
 * applying optional overrides. Throws on an unknown environment name.
 */
export function resolveEnvironment(
  env: LacspaceEnvironment | EnvironmentPreset,
  overrides: Partial<EnvironmentPreset> = {},
): EnvironmentPreset {
  const preset = typeof env === "string" ? LACSPACE_ENVIRONMENTS[env] : env;
  if (!preset || !preset.baseURL) {
    throw new Error(`resolveEnvironment: unknown Lacspace environment "${String(env)}".`);
  }
  return {
    baseURL: overrides.baseURL ?? preset.baseURL,
    headers: { ...preset.headers, ...overrides.headers },
  };
}

/** The subset of client options this module can merge (structural, not imported). */
export interface ClientConfigLike {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  dedupe?: boolean;
}

/**
 * Merge several partial config sources into one. Later sources win for scalar
 * fields; `headers` are deep-merged (not replaced). `undefined` values are
 * ignored so a preset key is never clobbered by an unset override.
 */
export function mergeConfig<T extends ClientConfigLike>(...sources: Array<Partial<T> | undefined | null>): T {
  const out = {} as Record<string, unknown>;
  let headers: Record<string, string> | undefined;
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined) continue;
      if (k === "headers") {
        headers = { ...headers, ...(v as Record<string, string>) };
      } else {
        out[k] = v;
      }
    }
  }
  if (headers) out.headers = headers;
  return out as T;
}

/**
 * Build a merged client config from a named environment plus optional overrides
 * — the environment supplies `baseURL`/`headers`, your options win on conflict.
 */
export function configFromEnvironment<T extends ClientConfigLike>(
  env: LacspaceEnvironment | EnvironmentPreset,
  options?: Partial<T>,
): T {
  const preset = resolveEnvironment(env);
  return mergeConfig<T>({ baseURL: preset.baseURL, headers: preset.headers } as Partial<T>, options ?? undefined);
}
