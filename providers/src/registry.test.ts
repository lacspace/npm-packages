import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./presets";
import { freeProviders, getProvider, listProviders } from "./registry";

describe("getProvider", () => {
  it("returns a known preset by id", () => {
    expect(getProvider("groq")?.id).toBe("groq");
  });

  it("returns undefined for an unknown id", () => {
    expect(getProvider("does-not-exist")).toBeUndefined();
  });

  it("is not fooled by inherited object properties", () => {
    expect(getProvider("toString")).toBeUndefined();
    expect(getProvider("constructor")).toBeUndefined();
    expect(getProvider("__proto__")).toBeUndefined();
  });
});

describe("listProviders", () => {
  it("returns every preset with no filter", () => {
    expect(listProviders().length).toBe(Object.keys(PROVIDERS).length);
  });

  it("filters by free: true", () => {
    const free = listProviders({ free: true });
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((p) => p.free)).toBe(true);
    expect(free.map((p) => p.id)).toContain("ollama");
  });

  it("filters by free: false", () => {
    const paid = listProviders({ free: false });
    expect(paid.every((p) => p.free === false)).toBe(true);
    expect(paid.map((p) => p.id)).toContain("openai");
  });

  it("filters by apiStyle", () => {
    const openai = listProviders({ apiStyle: "openai" });
    expect(openai.length).toBeGreaterThan(1);
    expect(openai.every((p) => p.apiStyle === "openai")).toBe(true);
    expect(openai.map((p) => p.id)).toContain("groq");
  });

  it("combines free + apiStyle filters", () => {
    const res = listProviders({ free: true, apiStyle: "ollama" });
    expect(res.map((p) => p.id)).toEqual(["ollama"]);
  });

  it("returns an empty array when nothing matches", () => {
    // No free anthropic-style preset exists.
    expect(listProviders({ free: true, apiStyle: "anthropic" })).toEqual([]);
  });
});

describe("freeProviders", () => {
  it("equals listProviders({ free: true })", () => {
    expect(freeProviders().map((p) => p.id)).toEqual(
      listProviders({ free: true }).map((p) => p.id),
    );
  });

  it("marks the expected providers as free", () => {
    const ids = freeProviders().map((p) => p.id);
    for (const id of [
      "ollama",
      "groq",
      "openrouter",
      "google-ai-studio",
      "cohere",
    ]) {
      expect(ids, `${id} should be free`).toContain(id);
    }
    expect(ids).not.toContain("openai");
    expect(ids).not.toContain("anthropic");
  });
});
