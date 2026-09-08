import { describe, it, expect } from "vitest";
import { mmr, cosineSim, jaccardSim } from "./mmr";
import type { Doc, Similarity } from "./types";

const withVecs: Doc[] = [
  { id: "a", text: "renewable solar energy", score: 1.0, vector: [1, 0] },
  { id: "b", text: "solar renewable energy", score: 0.9, vector: [1, 0] }, // near-dup of a
  { id: "c", text: "coal power stations", score: 0.5, vector: [0, 1] },
];

describe("cosineSim", () => {
  it("is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns 0 when a vector is all zeros", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("jaccardSim", () => {
  it("computes set overlap", () => {
    expect(jaccardSim(new Set(["a", "b"]), new Set(["a", "b", "c"]))).toBeCloseTo(
      2 / 3,
      10,
    );
    expect(jaccardSim(new Set(["a"]), new Set(["b"]))).toBe(0);
  });
});

describe("mmr", () => {
  it("skips a near-duplicate in favor of a diverse doc", () => {
    const out = mmr(withVecs, { lambda: 0.5 });
    expect(out[0]!.id).toBe("a"); // most relevant first
    expect(out[1]!.id).toBe("c"); // diverse, over near-dup 'b'
    expect(out[2]!.id).toBe("b");
  });

  it("with lambda=1 reduces to pure relevance order", () => {
    const out = mmr(withVecs, { lambda: 1 });
    expect(out.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("truncates to k", () => {
    const out = mmr(withVecs, { lambda: 0.5, k: 2 });
    expect(out).toHaveLength(2);
  });

  it("returns [] for empty input or k<=0", () => {
    expect(mmr([], {})).toEqual([]);
    expect(mmr(withVecs, { k: 0 })).toEqual([]);
  });

  it("uses an injected similarity function", () => {
    const calls: string[] = [];
    const similarity: Similarity = (a, b) => {
      calls.push(`${a.id}~${b.id}`);
      return 0; // no redundancy → pure relevance order
    };
    const out = mmr(withVecs, { lambda: 0.5, similarity });
    expect(out.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("falls back to lexical Jaccard when vectors are absent", () => {
    const docs: Doc[] = [
      { id: "a", text: "quantum computing qubits", score: 1.0 },
      { id: "b", text: "quantum computing qubits", score: 0.9 }, // dup text
      { id: "c", text: "medieval european history", score: 0.4 },
    ];
    const out = mmr(docs, { lambda: 0.5 });
    expect(out[0]!.id).toBe("a");
    expect(out[1]!.id).toBe("c"); // diverse beats the duplicate 'b'
  });
});
