import { describe, it, expect, afterEach } from "vitest";
import { dirSize, formatBytes, measureSizes } from "./size.js";
import { buildInventory } from "./inventory.js";
import { makeProject } from "./_fixture.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("formatBytes", () => {
  it("formats across units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("dirSize", () => {
  it("sums file bytes + counts and skips nested node_modules", () => {
    const { dir, cleanup } = makeProject({
      installed: {
        big: {
          version: "1.0.0",
          files: { "index.js": "x".repeat(100), "readme.md": "y".repeat(50) },
          nested: { inner: { version: "1.0.0", files: { "a.js": "z".repeat(999) } } },
        },
      },
    });
    cleanups.push(cleanup);
    const bigDir = `${dir}/node_modules/big`;
    const s = dirSize(bigDir);
    // 100 + 50 + the package.json bytes; the nested 999-byte file is excluded
    expect(s.files).toBe(3); // index.js, readme.md, package.json
    expect(s.bytes).toBeGreaterThanOrEqual(150);
    expect(s.bytes).toBeLessThan(999);
  });
});

describe("measureSizes", () => {
  it("sorts heaviest-first and totals across packages, with gzip estimate", () => {
    const { dir, cleanup } = makeProject({
      dependencies: { small: "1", large: "1" },
      installed: {
        small: { version: "1.0.0", files: { "i.js": "a".repeat(10) } },
        large: { version: "1.0.0", files: { "i.js": "a".repeat(5000) } },
      },
    });
    cleanups.push(cleanup);
    const inv = buildInventory(dir);
    const report = measureSizes(inv.installed, { gzip: true });
    expect(report.entries[0]!.name).toBe("large");
    expect(report.totalBytes).toBeGreaterThan(5000);
    expect(report.gzipEstimateBytes).toBe(Math.round(report.totalBytes * 0.32));
  });
});
