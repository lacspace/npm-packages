import { describe, it, expect } from "vitest";
import { reciprocalRankFusion, hybridRerank } from "./fusion";
import { bm25 } from "./lexical";
import type { Doc } from "./types";

const A: Doc = { id: "a", text: "alpha" };
const B: Doc = { id: "b", text: "beta" };
const C: Doc = { id: "c", text: "gamma" };
const D: Doc = { id: "d", text: "delta" };

describe("reciprocalRankFusion", () => {
  it("ranks a doc that is high in both lists at the top", () => {
    const vector = [A, B, C];
    const lexical = [A, C, D];
    const out = reciprocalRankFusion([vector, lexical]);
    expect(out[0]!.id).toBe("a");
  });

  it("de-duplicates by id and unions all docs", () => {
    const out = reciprocalRankFusion([
      [A, B],
      [B, C],
    ]);
    expect(out.map((d) => d.id).sort()).toEqual(["a", "b", "c"]);
    expect(out).toHaveLength(3);
  });

  it("writes the fused value to score, descending", () => {
    const out = reciprocalRankFusion([[A, B, C]]);
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score!);
    expect(out[1]!.score).toBeGreaterThan(out[2]!.score!);
  });

  it("respects per-list weights", () => {
    // B is rank-0 in list 2, A is rank-0 in list 1; weight list 2 heavily.
    const out = reciprocalRankFusion(
      [
        [A, C],
        [B, C],
      ],
      { weights: [0.1, 10] },
    );
    expect(out[0]!.id).toBe("b");
  });

  it("k constant is applied (larger k lowers all contributions)", () => {
    const small = reciprocalRankFusion([[A]], { k: 1 })[0]!.score!;
    const large = reciprocalRankFusion([[A]], { k: 1000 })[0]!.score!;
    expect(small).toBeGreaterThan(large);
  });
});

describe("hybridRerank", () => {
  const docs: Doc[] = [
    { id: "d1", text: "cat food for cats", score: 0.2 },
    { id: "d2", text: "unrelated banana bread", score: 0.9 },
    { id: "d3", text: "a cat and some food", score: 0.5 },
  ];

  it("blends vector and lexical signals", () => {
    const out = hybridRerank("cat food", docs);
    expect(out).toHaveLength(3);
    expect(out.every((d) => Number.isFinite(d.rerankScore))).toBe(true);
  });

  it("with vectorWeight=1 follows the vector score order", () => {
    const out = hybridRerank("cat food", docs, {
      vectorWeight: 1,
      lexicalWeight: 0,
    });
    expect(out[0]!.id).toBe("d2"); // highest doc.score
  });

  it("with lexicalWeight=1 follows the bm25 order", () => {
    const out = hybridRerank("cat food", docs, {
      vectorWeight: 0,
      lexicalWeight: 1,
    });
    const lex = bm25("cat food", docs);
    expect(out[0]!.id).toBe(lex[0]!.id);
    expect(out[0]!.id).not.toBe("d2");
  });
});
