import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./presets";
import type { ApiStyle, AuthStyle } from "./types";

const API_STYLES: ApiStyle[] = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "cohere",
];
const AUTH_STYLES: AuthStyle[] = ["bearer", "header", "query", "none"];

describe("PROVIDERS table shape", () => {
  const entries = Object.entries(PROVIDERS);

  it("includes every required provider id", () => {
    const required = [
      "ollama",
      "openai-compatible",
      "groq",
      "openrouter",
      "together",
      "cloudflare-workers-ai",
      "google-ai-studio",
      "cohere",
      "mistral",
      "deepseek",
      "openai",
      "anthropic",
    ];
    for (const id of required) {
      expect(PROVIDERS, `missing preset: ${id}`).toHaveProperty(id);
    }
  });

  it("uses its own key as the preset id (self-consistent)", () => {
    for (const [key, preset] of entries) {
      expect(preset.id).toBe(key);
    }
  });

  it("every preset is well-formed", () => {
    for (const [id, p] of entries) {
      expect(typeof p.label, id).toBe("string");
      expect(p.label.length, id).toBeGreaterThan(0);
      expect(typeof p.baseUrl, id).toBe("string");
      expect(p.chatPath.startsWith("/"), id).toBe(true);
      expect(API_STYLES, id).toContain(p.apiStyle);
      expect(AUTH_STYLES, id).toContain(p.authStyle);
      expect(typeof p.free, id).toBe("boolean");
      expect(typeof p.docsUrl, id).toBe("string");
    }
  });

  it("base URLs are http(s) and have no trailing slash", () => {
    for (const [id, p] of entries) {
      expect(/^https?:\/\//.test(p.baseUrl), `${id} baseUrl`).toBe(true);
      expect(p.baseUrl.endsWith("/"), `${id} trailing slash`).toBe(false);
    }
  });

  it("docs URLs are https", () => {
    for (const [id, p] of entries) {
      expect(p.docsUrl.startsWith("https://"), id).toBe(true);
    }
  });

  it("embeddingsPath, when present, starts with a slash", () => {
    for (const [id, p] of entries) {
      if (p.embeddingsPath !== undefined) {
        expect(p.embeddingsPath.startsWith("/"), id).toBe(true);
      }
    }
  });

  it("free presets carry an honest freeNotes explanation", () => {
    for (const [id, p] of entries) {
      if (p.free) {
        expect(typeof p.freeNotes, `${id} freeNotes`).toBe("string");
        expect((p.freeNotes ?? "").length, id).toBeGreaterThan(10);
      }
    }
  });

  it("non-free presets do not overstate a free tier", () => {
    expect(PROVIDERS.openai?.free).toBe(false);
    expect(PROVIDERS.anthropic?.free).toBe(false);
    expect(PROVIDERS.deepseek?.free).toBe(false);
  });

  it("ollama is local, keyless and free", () => {
    const o = PROVIDERS.ollama!;
    expect(o.authStyle).toBe("none");
    expect(o.free).toBe(true);
    expect(o.envKey).toBeUndefined();
    expect(o.baseUrl).toContain("localhost");
  });

  it("keyed presets declare authHeader for non-bearer styles", () => {
    for (const [id, p] of entries) {
      if (p.authStyle === "header" || p.authStyle === "query") {
        expect(typeof p.authHeader, `${id} authHeader`).toBe("string");
      }
    }
  });

  it("keyed presets document an envKey", () => {
    for (const [id, p] of entries) {
      if (p.authStyle !== "none") {
        expect(typeof p.envKey, `${id} envKey`).toBe("string");
      }
    }
  });

  it("anthropic uses x-api-key header auth and the /messages path", () => {
    const a = PROVIDERS.anthropic!;
    expect(a.apiStyle).toBe("anthropic");
    expect(a.authStyle).toBe("header");
    expect(a.authHeader).toBe("x-api-key");
    expect(a.chatPath).toBe("/messages");
  });

  it("openrouter advertises :free models", () => {
    const chat = PROVIDERS.openrouter!.models?.chat ?? [];
    expect(chat.some((m) => m.endsWith(":free"))).toBe(true);
  });

  it("no preset leaks a plausible secret in any field", () => {
    const secretish = /sk-[A-Za-z0-9]{16,}|gsk_[A-Za-z0-9]{16,}/;
    for (const [id, p] of entries) {
      expect(secretish.test(JSON.stringify(p)), `${id} looks like a key`).toBe(
        false,
      );
    }
  });
});
