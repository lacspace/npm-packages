import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureBuffer, measureFile, ratio } from "./measure.js";

describe("measureBuffer", () => {
  it("reports exact raw byte length", () => {
    const buf = Buffer.from("x".repeat(1234));
    expect(measureBuffer(buf).raw).toBe(1234);
  });

  it("gzip and brotli are smaller than raw for compressible input", () => {
    const buf = Buffer.from("a".repeat(10_000)); // highly compressible
    const s = measureBuffer(buf);
    expect(s.gzip).toBeLessThan(s.raw);
    expect(s.brotli).toBeLessThan(s.raw);
    expect(s.gzip).toBeGreaterThan(0);
    expect(s.brotli).toBeGreaterThan(0);
  });

  it("honours --no-brotli / --no-gzip via options", () => {
    const buf = Buffer.from("hello world ".repeat(100));
    expect(measureBuffer(buf, { brotli: false }).brotli).toBe(0);
    expect(measureBuffer(buf, { gzip: false }).gzip).toBe(0);
  });

  it("respects a lower gzip level (weaker compression is >= stronger)", () => {
    const buf = Buffer.from("The quick brown fox ".repeat(500));
    const strong = measureBuffer(buf, { gzipLevel: 9 }).gzip;
    const weak = measureBuffer(buf, { gzipLevel: 1 }).gzip;
    expect(weak).toBeGreaterThanOrEqual(strong);
  });

  it("handles empty buffers", () => {
    const s = measureBuffer(Buffer.alloc(0));
    expect(s.raw).toBe(0);
    expect(ratio(s)).toBe(0);
  });
});

describe("measureFile", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lsize-measure-"));
    writeFileSync(join(dir, "a.txt"), "z".repeat(5000));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("measures a file on disk and carries the report path", () => {
    const m = measureFile(join(dir, "a.txt"), "a.txt");
    expect(m.path).toBe("a.txt");
    expect(m.raw).toBe(5000);
    expect(m.gzip).toBeLessThan(5000);
  });
});

describe("ratio", () => {
  it("computes gzip/raw", () => {
    expect(ratio({ raw: 100, gzip: 40, brotli: 30 })).toBeCloseTo(0.4);
    expect(ratio({ raw: 100, gzip: 40, brotli: 30 }, "brotli")).toBeCloseTo(0.3);
  });
});
