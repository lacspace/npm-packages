import { describe, expect, it } from "vitest";
import { getProvider } from "./registry";
import { buildAuthHeaders, resolveConfig } from "./resolve";

describe("buildAuthHeaders", () => {
  it("returns {} for authStyle none (ollama)", () => {
    expect(buildAuthHeaders(getProvider("ollama")!, "anything")).toEqual({});
  });

  it("returns {} when no key is supplied", () => {
    expect(buildAuthHeaders(getProvider("groq")!)).toEqual({});
    expect(buildAuthHeaders(getProvider("groq")!, "")).toEqual({});
  });

  it("builds a bearer header", () => {
    expect(buildAuthHeaders(getProvider("groq")!, "gsk_test")).toEqual({
      Authorization: "Bearer gsk_test",
    });
  });

  it("builds a custom header (anthropic x-api-key)", () => {
    expect(buildAuthHeaders(getProvider("anthropic")!, "sk-ant-test")).toEqual({
      "x-api-key": "sk-ant-test",
    });
  });

  it("returns {} for query auth — key belongs in the URL (google)", () => {
    expect(buildAuthHeaders(getProvider("google-ai-studio")!, "AIza-test")).toEqual(
      {},
    );
  });

  it("is pure — does not mutate the preset", () => {
    const preset = getProvider("groq")!;
    const before = JSON.stringify(preset);
    buildAuthHeaders(preset, "gsk_test");
    expect(JSON.stringify(preset)).toBe(before);
  });
});

describe("resolveConfig", () => {
  it("merges preset base URL, key and default model", () => {
    const cfg = resolveConfig("groq", { apiKey: "gsk_test" });
    expect(cfg.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(cfg.apiKey).toBe("gsk_test");
    expect(cfg.model).toBe("llama-3.3-70b-versatile"); // first chat model
    expect(cfg.headers).toEqual({ Authorization: "Bearer gsk_test" });
    expect(cfg.apiStyle).toBe("openai");
  });

  it("lets the caller override the model", () => {
    const cfg = resolveConfig("groq", {
      apiKey: "gsk_test",
      model: "llama-3.1-8b-instant",
    });
    expect(cfg.model).toBe("llama-3.1-8b-instant");
  });

  it("lets the caller override the base URL", () => {
    const cfg = resolveConfig("openai-compatible", {
      baseUrl: "http://192.168.1.5:1234/v1",
    });
    expect(cfg.baseUrl).toBe("http://192.168.1.5:1234/v1");
  });

  it("omits apiKey and model keys when not resolvable", () => {
    const cfg = resolveConfig("openai-compatible");
    expect("apiKey" in cfg).toBe(false);
    // openai-compatible has an empty chat model list => no default model
    expect("model" in cfg).toBe(false);
    expect(cfg.headers).toEqual({}); // no key => no auth header
  });

  it("resolves a keyless local provider (ollama) with empty headers", () => {
    const cfg = resolveConfig("ollama", { model: "llama3.1" });
    expect(cfg.baseUrl).toBe("http://localhost:11434");
    expect(cfg.headers).toEqual({});
    expect(cfg.apiStyle).toBe("ollama");
    expect(cfg.model).toBe("llama3.1");
    expect("apiKey" in cfg).toBe(false);
  });

  it("carries the key through for query-auth providers (google)", () => {
    const cfg = resolveConfig("google-ai-studio", { apiKey: "AIza-test" });
    expect(cfg.apiKey).toBe("AIza-test"); // client appends ?key=
    expect(cfg.headers).toEqual({}); // not a header
    expect(cfg.apiStyle).toBe("google");
  });

  it("produces a config compatible with @lacspace/ai ClientConfig", () => {
    const cfg = resolveConfig("groq", { apiKey: "gsk_test" });
    // duck-type check: the fields @lacspace/ai / @lacspace/embeddings read
    const clientConfig: {
      baseUrl: string;
      apiKey?: string;
      model?: string;
      headers?: Record<string, string>;
    } = {
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      headers: cfg.headers,
    };
    expect(clientConfig.baseUrl).toContain("groq");
    expect(clientConfig.apiKey).toBe("gsk_test");
  });

  it("throws a helpful error for an unknown provider", () => {
    expect(() => resolveConfig("nope")).toThrow(/unknown provider "nope"/);
  });

  it("never reads a key from the environment implicitly", () => {
    const prev = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "should-not-be-used";
    try {
      const cfg = resolveConfig("groq");
      expect("apiKey" in cfg).toBe(false);
      expect(cfg.headers).toEqual({});
    } finally {
      if (prev === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prev;
    }
  });
});
