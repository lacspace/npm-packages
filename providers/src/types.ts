/**
 * Shared types for @lacspace/providers — a keyless registry of connection
 * presets for LLM / embedding endpoints.
 *
 * This package ships **no keys** and **proxies nothing**. A {@link ProviderPreset}
 * is pure, public configuration: a base URL, endpoint paths, the wire dialect
 * (`apiStyle`) and how auth is attached (`authStyle`). You bring your own key
 * (or run a local model like Ollama that needs none).
 */

/** The upstream wire dialect a preset speaks. */
export type ApiStyle =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "cohere";

/** How an API key is attached to a request. */
export type AuthStyle =
  | "bearer"
  | "header"
  | "query"
  | "none";

/**
 * A single, keyless connection preset for a provider.
 *
 * Everything here is **public information** — base URLs, endpoint paths, model
 * ids and the shape of auth. No secret ever lives in a preset; the `envKey`
 * field only *documents* the conventional environment variable a caller might
 * read their own key from.
 */
export interface ProviderPreset {
  /** Stable registry id (the key in {@link PROVIDERS}), e.g. `"groq"`. */
  id: string;
  /** Human-friendly label, e.g. `"Groq"`. */
  label: string;
  /** Public API base URL, no trailing slash, e.g. `"https://api.groq.com/openai/v1"`. */
  baseUrl: string;
  /** Chat/completions path relative to `baseUrl`, e.g. `"/chat/completions"`. */
  chatPath: string;
  /** Embeddings path relative to `baseUrl`, when the provider offers embeddings. */
  embeddingsPath?: string;
  /** Which wire dialect this endpoint speaks. */
  apiStyle: ApiStyle;
  /** How a key (if any) is attached. `"none"` for local/keyless endpoints. */
  authStyle: AuthStyle;
  /** Header name for `authStyle: "header"` (e.g. `"x-api-key"`) or query param name for `"query"`. */
  authHeader?: string;
  /** Conventional env var a caller reads *their own* key from. Documentation only — never read implicitly. */
  envKey?: string;
  /** `true` only when a genuinely free tier or local/keyless option exists. */
  free: boolean;
  /** Honest, conservative note about what is free (and any caveats). */
  freeNotes?: string;
  /** A few well-known model ids, split by capability. Illustrative, not exhaustive. */
  models?: {
    chat?: string[];
    embed?: string[];
  };
  /** Link to the provider's official docs. */
  docsUrl: string;
}

/**
 * A ready-to-use config produced by {@link resolveConfig}, shaped to drop
 * straight into `@lacspace/ai` / `@lacspace/embeddings`
 * (`{ baseUrl, apiKey?, model?, fetchImpl? }` compatible).
 */
export interface ResolvedConfig {
  /** Base URL to call (preset default, or a caller override). */
  baseUrl: string;
  /** The caller's API key, if one was supplied. Never sourced from a preset. */
  apiKey?: string;
  /** The model id to use, if resolved. */
  model?: string;
  /** Auth (and any preset-declared) headers, ready to merge into a request. */
  headers: Record<string, string>;
  /** The wire dialect, carried through so the client knows how to talk. */
  apiStyle: ApiStyle;
}

/** Options for {@link listProviders}. */
export interface ListProvidersOptions {
  /** Keep only presets with a matching `free` flag. */
  free?: boolean;
  /** Keep only presets with this `apiStyle`. */
  apiStyle?: ApiStyle;
}

/** Options for {@link resolveConfig}. */
export interface ResolveConfigOptions {
  /** The caller's own API key. Preferred source; never read from env implicitly. */
  apiKey?: string;
  /** Override the preset's default model. */
  model?: string;
  /** Override the preset's base URL (e.g. a self-hosted OpenAI-compatible host). */
  baseUrl?: string;
}
