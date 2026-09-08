import { describe, it, expect } from "vitest";
import { bm25, tfidfRerank, keywordOverlapScore } from "./lexical";
import type { Doc } from "./types";

const corpus: Doc[] = [
  { id: "d1", text: "The cat ate the cat food quickly" },
  { id: "d2", text: "Dogs enjoy dog food and like to play" },
  { id: "d3", text: "A cat sat calmly on the warm mat" },
  { id: "d4", text: "Financial markets rose sharply today" },
];

describe("bm25", () => {
  it("ranks the most on-topic doc first for a known corpus", () => {
    const out = bm25("cat food", corpus);
    expect(out[0]!.id).toBe("d1");
  });

  it("gives docs with no query terms a zero score", () => {
    const out = bm25("cat food", corpus);
    const d4 = out.find((d) => d.id === "d4")!;
    expect(d4.rerankScore).toBe(0);
  });

  it("preserves every input doc", () => {
    const out = bm25("cat food", corpus);
    expect(out).toHaveLength(corpus.length);
    expect(new Set(out.map((d) => d.id))).toEqual(
      new Set(["d1", "d2", "d3", "d4"]),
    );
  });

  it("scores a higher term frequency above a lower one", () => {
    const docs: Doc[] = [
      { id: "many", text: "alpha alpha alpha beta" },
      { id: "few", text: "alpha beta gamma delta epsilon zeta eta" },
    ];
    const out = bm25("alpha", docs);
    expect(out[0]!.id).toBe("many");
    expect(out[0]!.rerankScore).toBeGreaterThan(out[1]!.rerankScore);
  });

  it("accepts k1/b options and stays finite", () => {
    const out = bm25("cat", corpus, { k1: 2.0, b: 0.5 });
    for (const d of out) expect(Number.isFinite(d.rerankScore)).toBe(true);
  });

  it("returns [] for an empty corpus", () => {
    expect(bm25("cat", [])).toEqual([]);
  });

  it("is deterministic across runs", () => {
    const a = bm25("cat food", corpus).map((d) => d.id);
    const b = bm25("cat food", corpus).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it("keeps original doc fields (metadata) intact", () => {
    const docs: Doc[] = [{ id: "x", text: "cat", metadata: { src: "a" } }];
    const out = bm25("cat", docs);
    expect(out[0]!.metadata).toEqual({ src: "a" });
  });
});

describe("tfidfRerank", () => {
  it("orders the relevant doc first with scores in [0,1]", () => {
    const out = tfidfRerank("cat food", corpus);
    expect(out[0]!.id).toBe("d1");
    for (const d of out) {
      expect(d.rerankScore).toBeGreaterThanOrEqual(0);
      expect(d.rerankScore).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("scores an exact query/doc match highly", () => {
    const docs: Doc[] = [
      { id: "exact", text: "quantum entanglement theory" },
      { id: "off", text: "banana bread recipe" },
    ];
    const out = tfidfRerank("quantum entanglement theory", docs);
    expect(out[0]!.id).toBe("exact");
    expect(out[0]!.rerankScore).toBeGreaterThan(out[1]!.rerankScore);
  });
});

describe("keywordOverlapScore", () => {
  it("computes Jaccard overlap by default", () => {
    const s = keywordOverlapScore("cat food", { id: "d", text: "cat food now" });
    // query {cat,food}, doc {cat,food,now}: inter 2, union 3
    expect(s).toBeCloseTo(2 / 3, 10);
  });

  it("supports overlap mode (fraction of query terms present)", () => {
    const s = keywordOverlapScore(
      "cat food dog",
      { id: "d", text: "cat food only" },
      { mode: "overlap" },
    );
    expect(s).toBeCloseTo(2 / 3, 10);
  });

  it("returns 0 for an empty query", () => {
    expect(keywordOverlapScore("", { id: "d", text: "cat" })).toBe(0);
  });

  it("honors a custom tokenizer", () => {
    const tokenize = (t: string) => t.split("|").filter(Boolean);
    const s = keywordOverlapScore(
      "a|b",
      { id: "d", text: "a|b|c" },
      { tokenize },
    );
    expect(s).toBeCloseTo(2 / 3, 10);
  });
});
