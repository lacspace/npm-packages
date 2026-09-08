import { describe, it, expect } from "vitest";
import { embed, embedOne, chat } from "./provider.js";
import { RagError } from "./types.js";
import { makeFakeFetch } from "./_fake.js";

describe("embed (ollama)", () => {
  it("calls /api/embeddings once per text and returns one vector each", async () => {
    const fake = makeFakeFetch();
    const vecs = await embed(["cat", "dog"], { fetchImpl: fake.fetchImpl });
    expect(vecs).toHaveLength(2);
    expect(vecs[0]!.length).toBeGreaterThan(0);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]!.url).toBe("http://localhost:11434/api/embeddings");
    expect(fake.calls[0]!.body.model).toBe("nomic-embed-text");
    expect(fake.calls[0]!.body.prompt).toBe("cat");
  });

  it("returns [] for no inputs without calling the network", async () => {
    const fake = makeFakeFetch();
    expect(await embed([], { fetchImpl: fake.fetchImpl })).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("respects a custom base URL and model", async () => {
    const fake = makeFakeFetch();
    await embed(["x"], { fetchImpl: fake.fetchImpl, baseUrl: "http://host:9999/", model: "my-embed" });
    expect(fake.calls[0]!.url).toBe("http://host:9999/api/embeddings");
    expect(fake.calls[0]!.body.model).toBe("my-embed");
  });
});

describe("embed (openai)", () => {
  it("sends one batched request to /v1/embeddings with an input array + auth", async () => {
    const fake = makeFakeFetch();
    const vecs = await embed(["a", "b", "c"], { provider: "openai", apiKey: "sk-test", fetchImpl: fake.fetchImpl });
    expect(vecs).toHaveLength(3);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.url).toBe("http://localhost:11434/v1/embeddings");
    expect(fake.calls[0]!.body.input).toEqual(["a", "b", "c"]);
    expect(fake.calls[0]!.body.model).toBe("text-embedding-3-small");
  });
});

describe("embedOne", () => {
  it("returns a single vector", async () => {
    const fake = makeFakeFetch();
    const v = await embedOne("hello", { fetchImpl: fake.fetchImpl });
    expect(Array.isArray(v)).toBe(true);
    expect(v.length).toBeGreaterThan(0);
  });
});

describe("chat (ollama)", () => {
  it("posts to /api/chat with stream:false and returns message.content", async () => {
    const fake = makeFakeFetch({ answer: "the answer is 42" });
    const reply = await chat([{ role: "user", content: "q" }], { fetchImpl: fake.fetchImpl });
    expect(reply).toBe("the answer is 42");
    expect(fake.calls[0]!.url).toBe("http://localhost:11434/api/chat");
    expect(fake.calls[0]!.body.stream).toBe(false);
    expect(fake.calls[0]!.body.model).toBe("llama3.2");
  });
});

describe("chat (openai)", () => {
  it("posts to /v1/chat/completions and reads choices[0].message.content", async () => {
    const fake = makeFakeFetch({ answer: "cloud reply" });
    const reply = await chat([{ role: "user", content: "q" }], {
      provider: "openai", apiKey: "sk", model: "gpt-4o-mini", fetchImpl: fake.fetchImpl,
    });
    expect(reply).toBe("cloud reply");
    expect(fake.calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(fake.calls[0]!.body.model).toBe("gpt-4o-mini");
  });
});

describe("error handling", () => {
  it("maps a network failure to a RagError with code 'connection'", async () => {
    const fake = makeFakeFetch({ throwConnection: true });
    await expect(embed(["x"], { fetchImpl: fake.fetchImpl })).rejects.toMatchObject({
      name: "RagError", code: "connection",
    });
  });

  it("maps a non-2xx response to code 'http'", async () => {
    const fake = makeFakeFetch({ httpStatus: 500 });
    await expect(chat([{ role: "user", content: "q" }], { fetchImpl: fake.fetchImpl }))
      .rejects.toMatchObject({ code: "http" });
  });

  it("maps a non-JSON body to code 'shape'", async () => {
    const fake = makeFakeFetch({ malformed: true });
    await expect(embed(["x"], { fetchImpl: fake.fetchImpl })).rejects.toBeInstanceOf(RagError);
  });

  it("throws a config error when no fetch is available", async () => {
    const original = globalThis.fetch;
    // Simulate an ancient runtime with no global fetch.
    (globalThis as any).fetch = undefined;
    try {
      await expect(embed(["x"])).rejects.toMatchObject({ code: "config" });
    } finally {
      (globalThis as any).fetch = original;
    }
  });
});
