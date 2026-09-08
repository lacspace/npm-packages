import { describe, it, expect } from "vitest";
import { rerank } from "./rerank";
import { bm25 } from "./lexical";
import type { Doc, RerankScorer } from "./types";

const corpus: Doc[] = [
  { id: "d1", text: "The cat ate the cat food quickly", score: 0.3 },
  { id: "d2", text: "Dogs enjoy dog food and like to play", score: 0.8 },
  { id: "d3", text: "A cat sat calmly on the warm mat", score: 0.4 },
  { id: "d4", text: "Financial markets rose sharply today", score: 0.1 },
];

describe("rerank", () => {
  it("defaults to bm25 and matches bm25() ordering", async () => {
    const out = await rerank("cat food", corpus);
    const ref = bm25("cat food", corpus);
    expect(out.map((d) => d.id)).toEqual(ref.map((d) => d.id));
    expect(out[0]!.id).toBe("d1");
  });

  it("uses an injected score function when provided", async () => {
    // Reverse scorer: later docs score higher, overriding lexical relevance.
    const score: RerankScorer = (_q, docs) => docs.map((_d, i) => i);
    const out = await rerank("cat food", corpus, { score });
    expect(out[0]!.id).toBe("d4");
    expect(out[out.length - 1]!.id).toBe("d1");
  });

  it("awaits an async injected scorer", async () => {
    const score: RerankScorer = async (_q, docs) => {
      await Promise.resolve();
      return docs.map((d) => (d.id === "d3" ? 100 : 0));
    };
    const out = await rerank("cat food", corpus, { score });
    expect(out[0]!.id).toBe("d3");
  });

  it("supports the tfidf method", async () => {
    const out = await rerank("cat food", corpus, { method: "tfidf" });
    expect(out[0]!.id).toBe("d1");
  });

  it("supports the hybrid method (blends vector score)", async () => {
    const out = await rerank("cat food", corpus, {
      method: "hybrid",
      vectorWeight: 1,
      lexicalWeight: 0,
    });
    expect(out[0]!.id).toBe("d2"); // highest doc.score
  });

  it("truncates to top-k", async () => {
    const out = await rerank("cat food", corpus, { k: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe("d1");
  });

  it("applies an MMR diversity pass", async () => {
    const docs: Doc[] = [
      { id: "a", text: "solar renewable energy power", vector: [1, 0] },
      { id: "b", text: "renewable solar energy power", vector: [1, 0] },
      { id: "c", text: "coal fired power grid", vector: [0, 1] },
      { id: "z", text: "banana bread baking recipe", vector: [0.5, 0.5] },
    ];
    // 'a'/'b' are near-duplicates and most relevant; 'c' shares "power" so it
    // stays relevant, 'z' is the distractor. Diversity should surface 'c'
    // second, over the near-dup 'b'.
    const out = await rerank("renewable solar energy power", docs, {
      diversity: { mmr: true, lambda: 0.5 },
    });
    expect(out[0]!.id).toBe("a");
    expect(out[1]!.id).toBe("c");
  });

  it("attaches a numeric rerankScore to every result", async () => {
    const out = await rerank("cat food", corpus);
    for (const d of out) expect(typeof d.rerankScore).toBe("number");
  });
});
