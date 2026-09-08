import type { ProviderPreset } from "./types";

/**
 * The curated, keyless registry of connection presets.
 *
 * Every value here is **public** information (base URLs, endpoint paths, model
 * ids, auth style). No secret is stored. `free` is `true` only where a genuinely
 * free tier or a local/keyless option exists, and `freeNotes` states the caveat
 * honestly. Free tiers, model ids and limits change over time — always confirm
 * against the provider's own docs (`docsUrl`) and comply with their ToS.
 */
export const PROVIDERS: Record<string, ProviderPreset> = {
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434",
    chatPath: "/api/chat",
    embeddingsPath: "/api/embeddings",
    apiStyle: "ollama",
    authStyle: "none",
    free: true,
    freeNotes:
      "Runs open models locally on your own machine — fully free, offline, and needs no API key. Also exposes an OpenAI-compatible surface at /v1.",
    models: {
      chat: ["llama3.1", "qwen2.5", "gemma2", "phi3", "mistral"],
      embed: ["nomic-embed-text", "mxbai-embed-large"],
    },
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
  },

  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-compatible (generic)",
    baseUrl: "http://localhost:8000/v1",
    chatPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "OPENAI_API_KEY",
    free: true,
    freeNotes:
      "Generic template for any OpenAI-compatible server. Self-hosted engines (vLLM, LM Studio, LocalAI, text-generation-webui) are free to run — override `baseUrl` to point at yours. Hosted OpenAI-compatible services may charge.",
    models: {
      chat: [],
      embed: [],
    },
    docsUrl:
      "https://platform.openai.com/docs/api-reference/chat/create",
  },

  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    chatPath: "/chat/completions",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "GROQ_API_KEY",
    free: true,
    freeNotes:
      "Free tier with generous rate limits; create a free API key in the Groq console. No embeddings endpoint.",
    models: {
      chat: [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "gemma2-9b-it",
      ],
    },
    docsUrl: "https://console.groq.com/docs",
  },

  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    chatPath: "/chat/completions",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "OPENROUTER_API_KEY",
    free: true,
    freeNotes:
      "Aggregates many providers — mostly pay-per-use, but several models are free via the `:free` suffix (rate-limited). A key is still required.",
    models: {
      chat: [
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-2-9b-it:free",
        "mistralai/mistral-7b-instruct:free",
      ],
    },
    docsUrl: "https://openrouter.ai/docs",
  },

  together: {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    chatPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "TOGETHER_API_KEY",
    free: true,
    freeNotes:
      "Most models are paid, but some `-Free` variants exist and new accounts typically get trial credit. Confirm current free models in the docs.",
    models: {
      chat: [
        "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "mistralai/Mixtral-8x7B-Instruct-v0.1",
      ],
      embed: [
        "BAAI/bge-base-en-v1.5",
        "togethercomputer/m2-bert-80M-8k-retrieval",
      ],
    },
    docsUrl: "https://docs.together.ai",
  },

  "cloudflare-workers-ai": {
    id: "cloudflare-workers-ai",
    label: "Cloudflare Workers AI",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
    chatPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "CLOUDFLARE_API_TOKEN",
    free: true,
    freeNotes:
      "Has a free daily allocation (measured in Neurons); needs a Cloudflare account. Replace `{account_id}` in `baseUrl` with yours (or override via resolveConfig).",
    models: {
      chat: [
        "@cf/meta/llama-3.1-8b-instruct",
        "@cf/mistral/mistral-7b-instruct-v0.1",
      ],
      embed: ["@cf/baai/bge-base-en-v1.5"],
    },
    docsUrl: "https://developers.cloudflare.com/workers-ai/",
  },

  "google-ai-studio": {
    id: "google-ai-studio",
    label: "Google AI Studio (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    chatPath: "/models/{model}:generateContent",
    embeddingsPath: "/models/{model}:embedContent",
    apiStyle: "google",
    authStyle: "query",
    authHeader: "key",
    envKey: "GEMINI_API_KEY",
    free: true,
    freeNotes:
      "Google AI Studio offers a free tier with a free API key (rate/usage limits apply, and free-tier data may be used for training). Also exposes an OpenAI-compatible surface at /v1beta/openai.",
    models: {
      chat: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
      embed: ["text-embedding-004"],
    },
    docsUrl: "https://ai.google.dev/gemini-api/docs",
  },

  cohere: {
    id: "cohere",
    label: "Cohere",
    baseUrl: "https://api.cohere.com/v2",
    chatPath: "/chat",
    embeddingsPath: "/embed",
    apiStyle: "cohere",
    authStyle: "bearer",
    envKey: "COHERE_API_KEY",
    free: true,
    freeNotes:
      "Trial API keys are free but rate-limited — intended for evaluation and prototyping, not production.",
    models: {
      chat: ["command-r-plus", "command-r"],
      embed: ["embed-english-v3.0", "embed-multilingual-v3.0"],
    },
    docsUrl: "https://docs.cohere.com",
  },

  mistral: {
    id: "mistral",
    label: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    chatPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "MISTRAL_API_KEY",
    free: true,
    freeNotes:
      "A free experiment tier is available (rate-limited); most sustained usage is paid. Confirm current limits in the docs.",
    models: {
      chat: ["mistral-large-latest", "mistral-small-latest", "open-mistral-nemo"],
      embed: ["mistral-embed"],
    },
    docsUrl: "https://docs.mistral.ai",
  },

  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    chatPath: "/chat/completions",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "DEEPSEEK_API_KEY",
    free: false,
    models: {
      chat: ["deepseek-chat", "deepseek-reasoner"],
    },
    docsUrl: "https://api-docs.deepseek.com",
  },

  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    chatPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    apiStyle: "openai",
    authStyle: "bearer",
    envKey: "OPENAI_API_KEY",
    free: false,
    models: {
      chat: ["gpt-4o", "gpt-4o-mini"],
      embed: ["text-embedding-3-small", "text-embedding-3-large"],
    },
    docsUrl: "https://platform.openai.com/docs",
  },

  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    chatPath: "/messages",
    apiStyle: "anthropic",
    authStyle: "header",
    authHeader: "x-api-key",
    envKey: "ANTHROPIC_API_KEY",
    free: false,
    models: {
      chat: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    },
    docsUrl: "https://docs.anthropic.com",
  },
};
