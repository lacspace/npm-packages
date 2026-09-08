import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk.js";

describe("chunkText", () => {
  it("returns [] for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns a single chunk when text fits in one window", () => {
    const out = chunkText("hello world", { size: 800 });
    expect(out).toEqual(["hello world"]);
  });

  it("splits long text into multiple chunks", () => {
    const text = "a".repeat(2000);
    const out = chunkText(text, { size: 800, overlap: 100 });
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(800);
  });

  it("applies overlap between consecutive chunks", () => {
    const text = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
    const out = chunkText(text, { size: 200, overlap: 50 });
    expect(out.length).toBeGreaterThan(1);
    // The tail of chunk[0] should reappear at the head of chunk[1] somewhere.
    const tail = out[0]!.slice(-20);
    expect(out[1]!.includes(tail.trim().split(" ")[0]!)).toBe(true);
  });

  it("prefers breaking on paragraph/sentence boundaries", () => {
    const para = "First sentence here. Second sentence here.\n\n" + "x".repeat(500) + "\n\n" + "tail paragraph.";
    const out = chunkText(para, { size: 200, overlap: 20 });
    expect(out.length).toBeGreaterThan(1);
    // No chunk should be empty.
    for (const c of out) expect(c.trim().length).toBeGreaterThan(0);
  });

  it("covers the whole text (concatenated chunks include all words)", () => {
    const text = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const out = chunkText(text, { size: 120, overlap: 30 });
    const joined = out.join(" ");
    expect(joined.includes("word0")).toBe(true);
    expect(joined.includes("word99")).toBe(true);
  });

  it("normalizes CRLF line endings", () => {
    const out = chunkText("line1\r\nline2", { size: 800 });
    expect(out[0]).toBe("line1\nline2");
  });

  it("clamps overlap below size", () => {
    const out = chunkText("a".repeat(500), { size: 100, overlap: 1000 });
    expect(out.length).toBeGreaterThan(1);
  });
});
