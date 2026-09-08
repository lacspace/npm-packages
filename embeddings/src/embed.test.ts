import { test, expect } from "vitest";
import {
  embed,
  embedOne,
  createEmbedder,
  EmbeddingError,
  type EmbedAdapter,
  type Embedder,
  type FetchLike,
} from "./index";

/** A fake `fetch` that records calls and returns a canned JSON body. */
function fakeFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const body = handler(url, init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { impl, calls };
}

test("embed (openai) parses the data array in order", async () => {
  const { impl } = fakeFetch(() => ({
    data: [
      { index: 1, embedding: [0.3, 0.4] },
      { index: 0, embedding: [0.1, 0.2] },
    ],
  }));
  const out = await embed(["a", "b"], {
    model: "text-embedding-3-small",
    apiKey: "sk-test",
    fetchImpl: impl,
  });
  expect(out).toEqual([
    [0.1, 0.2],
    [0.3, 0.4],
  ]);
});

test("embed (openai) sends the endpoint, auth header, model and input", async () => {
  const { impl, calls } = fakeFetch(() => ({
    data: [{ index: 0, embedding: [1, 2, 3] }],
  }));
  await embed(["hello"], {
    model: "text-embedding-3-small",
    apiKey: "sk-abc",
    dimensions: 3,
    fetchImpl: impl,
  });
  const call = calls[0]!;
  expect(call.url).toBe("https://api.openai.com/v1/embeddings");
  const headers = call.init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer sk-abc");
  const body = JSON.parse(call.init.body as string);
  expect(body.model).toBe("text-embedding-3-small");
  expect(body.input).toEqual(["hello"]);
  expect(body.dimensions).toBe(3);
});

test("embed batches large inputs by batchSize", async () => {
  let n = 0;
  const { impl, calls } = fakeFetch((_url, init) => {
    const body = JSON.parse(init.body as string);
    return {
      data: (body.input as string[]).map((_t, i) => ({
        index: i,
        embedding: [n++],
      })),
    };
  });
  const texts = ["1", "2", "3", "4", "5"];
  const out = await embed(texts, {
    model: "m",
    apiKey: "k",
    batchSize: 2,
    fetchImpl: impl,
  });
  expect(calls).toHaveLength(3); // 2 + 2 + 1
  expect(out).toHaveLength(5);
});

test("embedOne returns the single vector", async () => {
  const { impl } = fakeFetch(() => ({
    data: [{ index: 0, embedding: [9, 8, 7] }],
  }));
  const v = await embedOne("x", { model: "m", apiKey: "k", fetchImpl: impl });
  expect(v).toEqual([9, 8, 7]);
});

test("createEmbedder returns an Embedder of shape (texts) => Promise<number[][]>", async () => {
  const { impl } = fakeFetch((_u, init) => {
    const body = JSON.parse(init.body as string);
    return {
      data: (body.input as string[]).map((_t, i) => ({
        index: i,
        embedding: [i],
      })),
    };
  });
  const embedder: Embedder = createEmbedder({
    model: "m",
    apiKey: "k",
    fetchImpl: impl,
  });
  const result = await embedder(["a", "b", "c"]);
  expect(result).toEqual([[0], [1], [2]]);
});

test("ollama uses /api/embeddings with a single prompt per request", async () => {
  const { impl, calls } = fakeFetch((_url, init) => {
    const body = JSON.parse(init.body as string);
    return { embedding: [body.prompt.length] };
  });
  const out = await embed(["hi", "there"], {
    provider: "ollama",
    model: "nomic-embed-text",
    fetchImpl: impl,
  });
  expect(calls).toHaveLength(2); // maxBatch = 1
  expect(calls[0]!.url).toBe("http://localhost:11434/api/embeddings");
  expect(JSON.parse(calls[0]!.init.body as string).prompt).toBe("hi");
  expect(out).toEqual([[2], [5]]);
});

test("google uses :batchEmbedContents and reads values[]", async () => {
  const { impl, calls } = fakeFetch(() => ({
    embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
  }));
  const out = await embed(["a", "b"], {
    provider: "google",
    model: "text-embedding-004",
    apiKey: "goog-key",
    fetchImpl: impl,
  });
  expect(calls[0]!.url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents",
  );
  const headers = calls[0]!.init.headers as Record<string, string>;
  expect(headers["x-goog-api-key"]).toBe("goog-key");
  expect(out).toEqual([
    [0.1, 0.2],
    [0.3, 0.4],
  ]);
});

test("cohere reads both v1 array and v2 { float } response shapes", async () => {
  const v1 = fakeFetch(() => ({ embeddings: [[1, 2]] }));
  const v2 = fakeFetch(() => ({ embeddings: { float: [[3, 4]] } }));
  const base = { provider: "cohere" as const, model: "embed-english-v3.0", apiKey: "co" };
  expect(await embed(["a"], { ...base, fetchImpl: v1.impl })).toEqual([[1, 2]]);
  expect(await embed(["a"], { ...base, fetchImpl: v2.impl })).toEqual([[3, 4]]);
  expect(v1.calls[0]!.url).toBe("https://api.cohere.com/v1/embed");
});

test("a custom adapter overrides the provider entirely", async () => {
  const adapter: EmbedAdapter = {
    name: "fake",
    maxBatch: 10,
    buildRequest: (texts, opts) => ({
      url: `${opts.baseUrl || "http://x"}/e`,
      headers: { "Content-Type": "application/json" },
      body: { texts },
    }),
    parseResponse: (json) => (json as { vectors: number[][] }).vectors,
  };
  const { impl } = fakeFetch((_u, init) => {
    const body = JSON.parse(init.body as string);
    return { vectors: (body.texts as string[]).map((t) => [t.length]) };
  });
  const out = await embed(["ab", "cde"], {
    model: "custom",
    adapter,
    fetchImpl: impl,
  });
  expect(out).toEqual([[2], [3]]);
});

test("openai-compatible accepts a full /embeddings baseUrl as-is", async () => {
  const { impl, calls } = fakeFetch(() => ({
    data: [{ index: 0, embedding: [1] }],
  }));
  await embed(["a"], {
    provider: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1/embeddings",
    model: "togethercomputer/m2-bert",
    fetchImpl: impl,
  });
  expect(calls[0]!.url).toBe("https://api.together.xyz/v1/embeddings");
});

test("openai-compatible without a baseUrl throws", async () => {
  await expect(
    embed(["a"], { provider: "openai-compatible", model: "m", fetchImpl: async () => new Response("{}") }),
  ).rejects.toThrow(EmbeddingError);
});

test("embed on an empty array returns [] and never calls fetch", async () => {
  let called = false;
  const impl: FetchLike = async () => {
    called = true;
    return new Response("{}");
  };
  const out = await embed([], { model: "m", apiKey: "k", fetchImpl: impl });
  expect(out).toEqual([]);
  expect(called).toBe(false);
});

test("a non-2xx response throws EmbeddingError with detail", async () => {
  const impl: FetchLike = async () =>
    new Response(JSON.stringify({ error: { message: "bad key" } }), {
      status: 401,
    });
  await expect(
    embed(["a"], { model: "m", apiKey: "bad", fetchImpl: impl }),
  ).rejects.toThrow(/401/);
});

test("a count mismatch between inputs and embeddings throws", async () => {
  const impl: FetchLike = async () =>
    new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), {
      status: 200,
    });
  await expect(
    embed(["a", "b"], { model: "m", apiKey: "k", fetchImpl: impl }),
  ).rejects.toThrow(EmbeddingError);
});

test("no Authorization header is sent when no apiKey is given (keyless)", async () => {
  const { impl, calls } = fakeFetch(() => ({
    embedding: [1, 2, 3],
  }));
  await embed(["a"], { provider: "ollama", model: "m", fetchImpl: impl });
  const headers = calls[0]!.init.headers as Record<string, string>;
  expect(headers.Authorization).toBeUndefined();
});
