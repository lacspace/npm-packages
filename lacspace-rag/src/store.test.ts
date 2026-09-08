import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createIndex, addToIndex, walkFiles, saveIndex, loadIndex, readTextFile,
} from "./store.js";
import { RagError } from "./types.js";

describe("createIndex / addToIndex", () => {
  it("creates an empty index with metadata", () => {
    const idx = createIndex("ollama", "nomic-embed-text");
    expect(idx.version).toBe(1);
    expect(idx.provider).toBe("ollama");
    expect(idx.embedModel).toBe("nomic-embed-text");
    expect(idx.dimension).toBe(0);
    expect(idx.chunks).toEqual([]);
  });

  it("sets the dimension from the first vector", () => {
    const idx = createIndex("ollama", "m");
    addToIndex(idx, [{ id: "a#0", text: "hi", source: "a", vector: [1, 2, 3] }]);
    expect(idx.dimension).toBe(3);
    expect(idx.chunks).toHaveLength(1);
  });

  it("rejects vectors of a mismatched dimension", () => {
    const idx = createIndex("ollama", "m");
    addToIndex(idx, [{ id: "a#0", text: "hi", source: "a", vector: [1, 2, 3] }]);
    expect(() => addToIndex(idx, [{ id: "b#0", text: "x", source: "b", vector: [1, 2] }]))
      .toThrow(RagError);
  });

  it("rejects an empty vector", () => {
    const idx = createIndex("ollama", "m");
    expect(() => addToIndex(idx, [{ id: "a#0", text: "hi", source: "a", vector: [] }]))
      .toThrow(RagError);
  });
});

describe("filesystem: walk / save / load", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lacspace-rag-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("walks text files and skips ignored dirs + binaries", () => {
    writeFileSync(join(dir, "a.md"), "# hello");
    writeFileSync(join(dir, "b.ts"), "const x = 1;");
    writeFileSync(join(dir, "photo.png"), "binary");
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "dep.js"), "ignored");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "c.txt"), "nested");

    const files = walkFiles(dir);
    const rels = files.map((f) => f.rel).sort();
    expect(rels).toContain("a.md");
    expect(rels).toContain("b.ts");
    expect(rels).toContain(join("sub", "c.txt"));
    expect(rels).not.toContain("photo.png");
    expect(rels.some((r) => r.includes("node_modules"))).toBe(false);
  });

  it("skips files larger than maxBytes", () => {
    writeFileSync(join(dir, "big.txt"), "x".repeat(100));
    const files = walkFiles(dir, { maxBytes: 10 });
    expect(files.length).toBe(0);
  });

  it("indexes a single file passed directly", () => {
    const f = join(dir, "solo.txt");
    writeFileSync(f, "solo content");
    const files = walkFiles(f);
    expect(files).toHaveLength(1);
    expect(readTextFile(files[0]!.path)).toBe("solo content");
  });

  it("round-trips an index through save/load", () => {
    const idx = createIndex("ollama", "m");
    addToIndex(idx, [{ id: "a#0", text: "hi", source: "a", vector: [1, 2, 3] }]);
    const p = join(dir, "nested", "index.json");
    saveIndex(p, idx);
    const back = loadIndex(p);
    expect(back.chunks).toHaveLength(1);
    expect(back.chunks[0]!.vector).toEqual([1, 2, 3]);
    expect(back.dimension).toBe(3);
  });

  it("throws a friendly error when the index is missing", () => {
    expect(() => loadIndex(join(dir, "nope.json"))).toThrow(/Run "index" first/);
  });

  it("throws when a path does not exist", () => {
    expect(() => walkFiles(join(dir, "ghost"))).toThrow(RagError);
  });
});
