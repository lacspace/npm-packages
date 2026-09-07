import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeComposition, analyzeCompositionFile } from "./composition.js";
import type { SegmentKind } from "./composition.js";

const bytesOf = (r: ReturnType<typeof analyzeComposition>, kind: SegmentKind): number =>
  r.segments.find((s) => s.kind === kind)?.bytes ?? 0;

describe("analyzeComposition — byte accounting", () => {
  it("segments always sum to the total byte length", () => {
    const src = `// a banner\nconst x = "hello world";\n/* block */\nfunction f() { return 1; }\n`;
    const r = analyzeComposition(src);
    const sum = r.segments.reduce((a, s) => a + s.bytes, 0);
    expect(sum).toBe(r.totalBytes);
    expect(r.totalBytes).toBe(Buffer.byteLength(src, "utf8"));
  });

  it("percentages of the four buckets add up to ~100", () => {
    const r = analyzeComposition(`const a = "xxxxxxxxxx"; // note\n`);
    const total = r.segments.reduce((a, s) => a + s.percent, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it("counts a line comment's bytes as comments (not code)", () => {
    const r = analyzeComposition(`// this is a comment\n`);
    expect(bytesOf(r, "comments")).toBe(20); // "// this is a comment"
    expect(bytesOf(r, "whitespace")).toBe(1); // the newline
    expect(bytesOf(r, "code")).toBe(0);
  });

  it("counts a block comment's bytes as comments across lines", () => {
    const r = analyzeComposition(`/* line1\nline2 */`);
    expect(bytesOf(r, "comments")).toBeGreaterThan(0);
    expect(bytesOf(r, "code")).toBe(0);
  });

  it("attributes string literal bytes to the strings bucket", () => {
    const r = analyzeComposition(`x="abcdef"`);
    // the literal including quotes is 8 bytes: "abcdef"
    expect(bytesOf(r, "strings")).toBe(8);
    expect(bytesOf(r, "code")).toBe(2); // x=
  });

  it("does not treat // inside a string as a comment", () => {
    const r = analyzeComposition(`var u = "http://x";`);
    expect(bytesOf(r, "comments")).toBe(0);
    expect(r.topStrings[0]!.value).toContain("http://x");
  });

  it("handles escaped quotes inside strings", () => {
    const r = analyzeComposition(`s = "a\\"b";`);
    expect(bytesOf(r, "comments")).toBe(0);
    // one literal, spanning the whole quoted run
    expect(r.topStrings.length).toBe(1);
  });

  it("counts multibyte characters by UTF-8 byte length", () => {
    const r = analyzeComposition(`x="€"`); // € is 3 bytes
    // literal = quote + € + quote = 1 + 3 + 1 = 5 bytes
    expect(bytesOf(r, "strings")).toBe(5);
    expect(r.totalBytes).toBe(Buffer.byteLength(`x="€"`, "utf8"));
  });
});

describe("analyzeComposition — surfaced detail", () => {
  it("surfaces the largest string literals, largest-first", () => {
    const r = analyzeComposition(`a="${"x".repeat(50)}"; b="short";`);
    expect(r.topStrings[0]!.bytes).toBeGreaterThan(r.topStrings[1]!.bytes);
    expect(r.topStrings[0]!.value.startsWith("x")).toBe(true);
  });

  it("surfaces the largest lines, largest-first", () => {
    const r = analyzeComposition(`tiny\n${"z".repeat(80)}\nmid line here\n`);
    expect(r.topLines[0]!.bytes).toBe(80);
  });

  it("honours topStrings / topLines caps", () => {
    const src = Array.from({ length: 6 }, (_, i) => `s${i}="${"y".repeat(i + 1)}";`).join("\n");
    const r = analyzeComposition(src, { topStrings: 2, topLines: 3 });
    expect(r.topStrings.length).toBe(2);
    expect(r.topLines.length).toBe(3);
  });
});

describe("analyzeComposition — crude module split", () => {
  it("splits on esbuild-style `// path.js` banners", () => {
    const src = [
      "// src/a.js",
      'var a = "aaaa";',
      "// src/b.js",
      'var b = "bbbbbbbb";',
    ].join("\n");
    const r = analyzeComposition(src);
    const names = r.modules.map((m) => m.name).sort();
    expect(names).toEqual(["src/a.js", "src/b.js"]);
    expect(r.modules.reduce((a, m) => a + m.bytes, 0)).toBeLessThanOrEqual(r.totalBytes);
  });

  it("splits on //# sourceURL= banners", () => {
    const src = [
      "//# sourceURL=chunk-one.js",
      "code1();",
      "//# sourceURL=chunk-two.js",
      "code2();",
    ].join("\n");
    const r = analyzeComposition(src);
    expect(r.modules.map((m) => m.name).sort()).toEqual(["chunk-one.js", "chunk-two.js"]);
  });

  it("returns no modules when fewer than two banners exist", () => {
    const r = analyzeComposition(`const x = 1;\nconst y = 2;\n`);
    expect(r.modules).toEqual([]);
  });
});

describe("analyzeComposition — treemap", () => {
  it("builds a treemap whose root value equals the total", () => {
    const r = analyzeComposition(`const s = "hello"; // hi\n`);
    expect(r.treemap.name).toBe("bundle");
    expect(r.treemap.value).toBe(r.totalBytes);
    expect(Array.isArray(r.treemap.children)).toBe(true);
  });

  it("drills the strings category into its largest literals", () => {
    const r = analyzeComposition(`a="${"x".repeat(40)}"; b="${"y".repeat(20)}";`);
    const strings = r.treemap.children!.find((c) => c.name === "strings");
    expect(strings).toBeTruthy();
    expect(strings!.children!.length).toBeGreaterThan(0);
  });
});

describe("analyzeCompositionFile", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lsize-comp-"));
    writeFileSync(join(dir, "b.js"), `// banner\nconst greeting = "hello there";\n`);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a file and estimates its composition", () => {
    const r = analyzeCompositionFile(join(dir, "b.js"));
    expect(r.totalBytes).toBeGreaterThan(0);
    expect(r.segments.reduce((a, s) => a + s.bytes, 0)).toBe(r.totalBytes);
  });
});
