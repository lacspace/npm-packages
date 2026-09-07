import type { Provider } from "../types.js";
import type { ProviderAdapter } from "./common.js";
import { makeOpenAiAdapter } from "./openai.js";
import { anthropicAdapter } from "./anthropic.js";
import { googleAdapter } from "./google.js";

const openaiAdapter = makeOpenAiAdapter("openai");
const openaiCompatibleAdapter = makeOpenAiAdapter("openai-compatible");

/** Resolve the adapter for a provider name. */
export function getAdapter(provider: Provider): ProviderAdapter {
  switch (provider) {
    case "openai":
      return openaiAdapter;
    case "anthropic":
      return anthropicAdapter;
    case "google":
      return googleAdapter;
    case "openai-compatible":
      return openaiCompatibleAdapter;
    default:
      throw new Error(`Unknown provider: ${String(provider)}`);
  }
}

export type { ProviderAdapter, BuiltRequest } from "./common.js";
