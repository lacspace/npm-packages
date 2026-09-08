import type { ListProvidersOptions, ProviderPreset } from "./types";
import { PROVIDERS } from "./presets";

/**
 * Look up a single preset by id.
 *
 * ```ts
 * const p = getProvider("groq");
 * ```
 *
 * @returns the {@link ProviderPreset}, or `undefined` if the id is unknown.
 */
export function getProvider(id: string): ProviderPreset | undefined {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id)
    ? PROVIDERS[id]
    : undefined;
}

/**
 * List presets, optionally filtered by `free` and/or `apiStyle`.
 *
 * ```ts
 * listProviders({ apiStyle: "openai" }); // all OpenAI-dialect presets
 * listProviders({ free: true });         // only free/local ones
 * ```
 */
export function listProviders(
  opts: ListProvidersOptions = {},
): ProviderPreset[] {
  let out = Object.values(PROVIDERS);
  if (opts.free !== undefined) {
    out = out.filter((p) => p.free === opts.free);
  }
  if (opts.apiStyle !== undefined) {
    out = out.filter((p) => p.apiStyle === opts.apiStyle);
  }
  return out;
}

/** Convenience for `listProviders({ free: true })` — presets with a free/local option. */
export function freeProviders(): ProviderPreset[] {
  return listProviders({ free: true });
}
