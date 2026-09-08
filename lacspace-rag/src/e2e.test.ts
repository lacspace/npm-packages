import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk.js";
import { embed, embedOne, chat } from "./provider.js";
import { createIndex, addToIndex } from "./store.js";
import { search, buildPrompt } from "./search.js";
import { makeFakeFetch } from "./_fake.js";

/**
 * End-to-end, entirely in memory with a fake fetch: fake-embed a few docs,
 * build an index, embed a question, and confirm the correct doc is the top hit.
 * Never touches the network or requires Ollama.
 */
describe("end-to-end RAG (fake fetch)", () => {
  const docs = [
    { source: "install.md", text: "To install the server run npm install then start it." },
    { source: "config.md", text: "Set the config port to change which port the api listens on." },
    { source: "pets.md", text: "The cat and the dog are pets that live in the house." },
  ];

  async function buildIndex(fetchImpl: any) {
    const index = createIndex("ollama", "test-embed");
    for (const doc of docs) {
      const parts = chunkText(doc.text, { size: 800, overlap: 100 });
      const vectors = await embed(parts, { fetchImpl });
      addToIndex(index, parts.map((text, i) => ({
        id: `${doc.source}#${i}`, text, source: doc.source, vector: vectors[i]!,
      })));
    }
    return index;
  }

  it("retrieves the port doc for a config question", async () => {
    const fake = makeFakeFetch();
    const index = await buildIndex(fake.fetchImpl);
    expect(index.chunks.length).toBe(3);

    const q = await embedOne("how do I change the port config?", { fetchImpl: fake.fetchImpl });
    const hits = search(index, q, 1);
    expect(hits[0]!.chunk.source).toBe("config.md");
  });

  it("retrieves the install doc for an install question", async () => {
    const fake = makeFakeFetch();
    const index = await buildIndex(fake.fetchImpl);
    const q = await embedOne("what is the install command?", { fetchImpl: fake.fetchImpl });
    const hits = search(index, q, 1);
    expect(hits[0]!.chunk.source).toBe("install.md");
  });

  it("retrieves the pets doc for a cat question", async () => {
    const fake = makeFakeFetch();
    const index = await buildIndex(fake.fetchImpl);
    const q = await embedOne("tell me about the cat", { fetchImpl: fake.fetchImpl });
    const hits = search(index, q, 1);
    expect(hits[0]!.chunk.source).toBe("pets.md");
  });

  it("asks a grounded question end-to-end and cites sources", async () => {
    const fake = makeFakeFetch({ answer: "Run npm install (source: install.md)." });
    const index = await buildIndex(fake.fetchImpl);
    const question = "how do I install the server?";
    const q = await embedOne(question, { fetchImpl: fake.fetchImpl });
    const hits = search(index, q, 2);
    const messages = buildPrompt(question, hits);
    const answer = await chat(messages, { fetchImpl: fake.fetchImpl });
    expect(answer).toContain("npm install");
    expect(hits[0]!.chunk.source).toBe("install.md");
    // The prompt handed the model the retrieved context, grounded.
    expect(messages[1]!.content).toContain("install");
  });
});
