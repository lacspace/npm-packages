import { describe, it, expect } from "vitest";
import { cosineSimilarity, search, buildPrompt } from "./search.js";
import { createIndex, addToIndex } from "./store.js";
import type { RagIndex, SearchHit } from "./types.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 10);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it("returns 0 for empty or zero vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("scales invariantly (magnitude does not matter)", () => {
    expect(cosineSimilarity([1, 1], [10, 10])).toBeCloseTo(1, 10);
  });
});

function fixtureIndex(): RagIndex {
  const idx = createIndex("ollama", "test");
  addToIndex(idx, [
    { id: "a#0", text: "cat", source: "a.md", vector: [1, 0, 0] },
    { id: "b#0", text: "dog", source: "b.md", vector: [0, 1, 0] },
    { id: "c#0", text: "bird", source: "c.md", vector: [0, 0, 1] },
    { id: "d#0", text: "kitten", source: "d.md", vector: [0.9, 0.1, 0] },
  ]);
  return idx;
}

describe("search", () => {
  it("ranks the closest chunk first", () => {
    const idx = fixtureIndex();
    const hits = search(idx, [1, 0, 0], 2);
    expect(hits[0]!.chunk.id).toBe("a#0");
    expect(hits[1]!.chunk.id).toBe("d#0");
  });

  it("respects k", () => {
    const idx = fixtureIndex();
    expect(search(idx, [1, 0, 0], 1).length).toBe(1);
    expect(search(idx, [1, 0, 0], 3).length).toBe(3);
  });

  it("returns scores in descending order", () => {
    const idx = fixtureIndex();
    const hits = search(idx, [0.5, 0.5, 0], 4);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it("handles an empty index", () => {
    const idx = createIndex("ollama", "test");
    expect(search(idx, [1, 2, 3], 4)).toEqual([]);
  });
});

describe("buildPrompt", () => {
  const hits: SearchHit[] = [
    { chunk: { id: "r#0", text: "Install with npm i -g foo", source: "README.md", vector: [] }, score: 0.9 },
    { chunk: { id: "d#0", text: "Port defaults to 8080", source: "docs.md", vector: [] }, score: 0.7 },
  ];

  it("produces a system + user message pair", () => {
    const msgs = buildPrompt("How to install?", hits);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.role).toBe("user");
  });

  it("embeds the question and numbered, sourced context", () => {
    const msgs = buildPrompt("How to install?", hits);
    const user = msgs[1]!.content;
    expect(user).toContain("Question: How to install?");
    expect(user).toContain("[1]");
    expect(user).toContain("README.md");
    expect(user).toContain("Install with npm i -g foo");
  });

  it("honors a custom system instruction", () => {
    const msgs = buildPrompt("q", hits, { system: "BE TERSE" });
    expect(msgs[0]!.content).toBe("BE TERSE");
  });

  it("still asks the question with no context", () => {
    const msgs = buildPrompt("standalone?", []);
    expect(msgs[1]!.content).toContain("Question: standalone?");
    expect(msgs[1]!.content).not.toContain("Context:");
  });
});
