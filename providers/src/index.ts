/**
 * @lacspace/providers — a keyless registry of connection presets for LLM &
 * embedding endpoints, especially free and local ones.
 *
 * Ships **no keys** and **proxies nothing**: just public base URLs, endpoint
 * shapes, model ids and auth style, plus pure helpers to turn a preset + your
 * own key into a config that drops into `@lacspace/ai` / `@lacspace/embeddings`.
 *
 * @packageDocumentation
 */

export type {
  ProviderPreset,
  ApiStyle,
  AuthStyle,
  ResolvedConfig,
  ListProvidersOptions,
  ResolveConfigOptions,
} from "./types";

export { PROVIDERS } from "./presets";
export { getProvider, listProviders, freeProviders } from "./registry";
export { resolveConfig, buildAuthHeaders } from "./resolve";
