import type {
  ProviderPreset,
  ResolveConfigOptions,
  ResolvedConfig,
} from "./types";
import { getProvider } from "./registry";
import { PROVIDERS } from "./presets";

/**
 * Build the auth headers for a preset, given the caller's key.
 *
 * Pure and keyless: with no `apiKey` (or `authStyle: "none"`) it returns `{}`.
 * For `authStyle: "query"` the key belongs in the URL, not a header, so this
 * returns `{}` too — carry `apiKey` through {@link resolveConfig} and let the
 * client append it (e.g. Gemini's `?key=`).
 *
 * ```ts
 * buildAuthHeaders(getProvider("groq")!, "gsk_...");
 * // => { Authorization: "Bearer gsk_..." }
 * buildAuthHeaders(getProvider("anthropic")!, "sk-ant-...");
 * // => { "x-api-key": "sk-ant-..." }
 * ```
 */
export function buildAuthHeaders(
  preset: ProviderPreset,
  apiKey?: string,
): Record<string, string> {
  if (preset.authStyle === "none" || !apiKey) return {};

  switch (preset.authStyle) {
    case "bearer":
      return { Authorization: `Bearer ${apiKey}` };
    case "header":
      return { [preset.authHeader ?? "Authorization"]: apiKey };
    case "query":
      // Key goes in the query string, not a header.
      return {};
    default:
      return {};
  }
}

/**
 * Merge a preset with the caller's own key/model/base URL into a ready-to-use
 * config shaped for `@lacspace/ai` / `@lacspace/embeddings`
 * (`{ baseUrl, apiKey?, model?, fetchImpl? }` compatible).
 *
 * The key is read **only** from `opts.apiKey` — never from `process.env`, to
 * stay pure and isomorphic. The preset's `envKey` merely *documents* where a
 * caller might source their own key. The model defaults to the preset's first
 * listed chat model when not overridden.
 *
 * ```ts
 * const cfg = resolveConfig("groq", {
 *   apiKey: process.env.GROQ_API_KEY,
 *   model: "llama-3.1-8b-instant",
 * });
 * // cfg => { baseUrl, apiKey, model, headers: { Authorization: "Bearer ..." }, apiStyle: "openai" }
 * ```
 *
 * @throws if `id` is not a known preset.
 */
export function resolveConfig(
  id: string,
  opts: ResolveConfigOptions = {},
): ResolvedConfig {
  const preset = getProvider(id);
  if (!preset) {
    throw new Error(
      `@lacspace/providers: unknown provider "${id}". ` +
        `Use one of: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }

  const baseUrl = opts.baseUrl ?? preset.baseUrl;
  const model = opts.model ?? preset.models?.chat?.[0];
  const apiKey = opts.apiKey;
  const headers = buildAuthHeaders(preset, apiKey);

  const config: ResolvedConfig = {
    baseUrl,
    headers,
    apiStyle: preset.apiStyle,
  };
  if (apiKey !== undefined) config.apiKey = apiKey;
  if (model !== undefined) config.model = model;
  return config;
}
