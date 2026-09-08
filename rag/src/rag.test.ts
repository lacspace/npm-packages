import { test, expect, vi } from "vitest";
import { createRag } from "./index";
import { fakeEmbedder, fakeStore } from "./_fakes";

test("createRag throws on a bad embed", () => {
  expect(() => createRag({ embed: undefined as never, store: fakeStore() })).toThrow(
    /embed/,
  );
});

test("createRag throws on a store missing methods", () => {
  expect(() => createRag({ embed: fakeEmbedder(), store: {} as never })).toThrow(
    /upsert/,
  );
});

test("index with chunking off embeds one record per document", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  const res = await rag.index(["alpha document", "beta document"], { chunk: false });
  expect(res.chunks).toBe(2);
  expect(res.ids).toEqual(["doc-0", "doc-1"]);
  expect(store.records.size).toBe(2);
  expect(store.upsertCalls).toBe(1);
});

test("index chunks a long document into multiple records", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  const text = Array.from({ length: 12 }, (_, i) => `Paragraph number ${i} here.`).join(
    "\n\n",
  );
  const res = await rag.index({ id: "big", text }, { splitOptions: { chunkSize: 40 } });
  expect(res.chunks).toBeGreaterThan(1);
  expect(res.ids.every((id) => id.startsWith("big#"))).toBe(true);
  expect(store.records.size).toBe(res.chunks);
});

test("index respects a custom idPrefix", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store, idPrefix: "kb" });
  const res = await rag.index("just one string", { chunk: false });
  expect(res.ids).toEqual(["kb-0"]);
});

test("index honors an explicit document id", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  const res = await rag.index({ id: "readme", text: "short text" }, { chunk: false });
  expect(res.ids).toEqual(["readme"]);
});

test("index carries document metadata onto every chunk", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(
    { id: "d", text: "one\n\ntwo\n\nthree", metadata: { source: "wiki" } },
    { splitOptions: { chunkSize: 5 } },
  );
  for (const rec of store.records.values()) {
    expect(rec.metadata).toEqual({ source: "wiki" });
  }
});

test("index merges call-level metadata; document metadata wins on conflict", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(
    { id: "d", text: "hello", metadata: { source: "doc" } },
    { chunk: false, metadata: { source: "call", tenant: "acme" } },
  );
  const rec = store.records.get("d")!;
  expect(rec.metadata).toEqual({ source: "doc", tenant: "acme" });
});

test("index of empty input embeds nothing and never calls the embedder", async () => {
  const store = fakeStore();
  const embed = vi.fn(fakeEmbedder());
  const rag = createRag({ embed, store });
  const res = await rag.index([]);
  expect(res).toEqual({ chunks: 0, ids: [] });
  expect(embed).not.toHaveBeenCalled();
});

test("index embeds all chunks in a single batch call", async () => {
  const store = fakeStore();
  const embed = vi.fn(fakeEmbedder());
  const rag = createRag({ embed, store });
  await rag.index(["a", "b", "c"], { chunk: false });
  expect(embed).toHaveBeenCalledTimes(1);
  expect(embed.mock.calls[0]![0]).toEqual(["a", "b", "c"]);
});

test("index throws if the embedder returns the wrong number of vectors", async () => {
  const store = fakeStore();
  const badEmbed = async () => [[1, 2, 3]];
  const rag = createRag({ embed: badEmbed, store });
  await expect(rag.index(["a", "b"], { chunk: false })).rejects.toThrow(/vectors/);
});

test("retrieve returns the most relevant chunk first", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(
    [
      { id: "cats", text: "cats are furry feline animals that purr" },
      { id: "cars", text: "cars are fast metal vehicles with engines" },
      { id: "food", text: "pizza and pasta are popular italian food" },
    ],
    { chunk: false },
  );
  const hits = await rag.retrieve("tell me about feline animals that purr");
  expect(hits[0]!.id).toBe("cats");
  expect(hits[0]!.text).toContain("feline");
});

test("retrieve respects k", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(["one two", "two three", "three four", "four five"], {
    chunk: false,
  });
  const hits = await rag.retrieve("two three four", { k: 2 });
  expect(hits).toHaveLength(2);
});

test("retrieve forwards a metadata filter to the store", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(
    [
      { id: "en", text: "hello world", metadata: { lang: "en" } },
      { id: "fr", text: "bonjour monde", metadata: { lang: "fr" } },
    ],
    { chunk: false },
  );
  const hits = await rag.retrieve("hello world bonjour monde", { filter: { lang: "fr" } });
  expect(hits.every((h) => h.metadata?.["lang"] === "fr")).toBe(true);
  expect(hits.map((h) => h.id)).toEqual(["fr"]);
});

test("retrieve drops hits below minScore", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(
    [
      { id: "match", text: "quantum entanglement physics" },
      { id: "noise", text: "banana smoothie recipe" },
    ],
    { chunk: false },
  );
  const hits = await rag.retrieve("quantum entanglement physics", { minScore: 0.9 });
  expect(hits.every((h) => h.score >= 0.9)).toBe(true);
  expect(hits.map((h) => h.id)).toContain("match");
  expect(hits.map((h) => h.id)).not.toContain("noise");
});

test("retrieve returns metadata on hits", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index({ id: "d", text: "tagged content", metadata: { source: "kb" } }, {
    chunk: false,
  });
  const [hit] = await rag.retrieve("tagged content");
  expect(hit!.metadata).toEqual({ source: "kb" });
});

test("full index → retrieve → buildPrompt pipeline", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index(
    [
      { id: "sky", text: "the sky appears blue because of rayleigh scattering" },
      { id: "grass", text: "grass is green because of chlorophyll" },
    ],
    { chunk: false },
  );
  const chunks = await rag.retrieve("why is the sky blue", { k: 1 });
  const built = rag.buildPrompt("why is the sky blue", chunks);
  expect(built.context).toContain("rayleigh");
  expect(built.prompt).toContain("Question: why is the sky blue");
});

test("answer wires retrieve → buildPrompt → generate", async () => {
  const store = fakeStore();
  const generate = vi.fn(async (prompt: string) => `ANSWER for: ${prompt.slice(0, 5)}`);
  const rag = createRag({ embed: fakeEmbedder(), store, generate });
  await rag.index({ id: "d", text: "the capital of france is paris" }, { chunk: false });
  const out = await rag.answer("what is the capital of france");
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0]![0]).toContain("paris");
  expect(out).toMatch(/^ANSWER for:/);
});

test("answer accepts a per-call generate override", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await rag.index({ id: "d", text: "cats purr" }, { chunk: false });
  const out = await rag.answer("do cats purr", { generate: async () => "yes" });
  expect(out).toBe("yes");
});

test("answer without any generate throws a helpful error", async () => {
  const store = fakeStore();
  const rag = createRag({ embed: fakeEmbedder(), store });
  await expect(rag.answer("anything")).rejects.toThrow(/generate/);
});

test("works with a promise-returning store (isomorphic async store)", async () => {
  const sync = fakeStore();
  const asyncStore = {
    upsert: async (recs: Parameters<typeof sync.upsert>[0]) => sync.upsert(recs),
    query: async (v: number[], o?: Parameters<typeof sync.query>[1]) => sync.query(v, o),
  };
  const rag = createRag({ embed: fakeEmbedder(), store: asyncStore });
  await rag.index({ id: "d", text: "async store works" }, { chunk: false });
  const hits = await rag.retrieve("async store works");
  expect(hits[0]!.id).toBe("d");
});

test("index accepts a custom injected splitter and normalizes its output", async () => {
  const store = fakeStore();
  const split = (text: string) => text.split("|").map((t) => ({ text: t }));
  const rag = createRag({ embed: fakeEmbedder(), store, split });
  const res = await rag.index({ id: "d", text: "a|b|c" });
  expect(res.chunks).toBe(3);
  expect(res.ids).toEqual(["d#0", "d#1", "d#2"]);
});
