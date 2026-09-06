import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDir, checkUrl, check } from "./check.js";

describe("checkDir", () => {
  it("flags the missing required files and scores partial", () => {
    const dir = mkdtempSync(join(tmpdir(), "lacicon-"));
    try {
      writeFileSync(join(dir, "favicon.ico"), Buffer.from([0]));
      writeFileSync(
        join(dir, "manifest.webmanifest"),
        JSON.stringify({ theme_color: "#123456", icons: [{ sizes: "192x192" }, { sizes: "512x512" }] }),
      );
      const report = checkDir(dir);
      expect(report.kind).toBe("dir");
      expect(report.missing).toContain("apple-touch-icon.png");
      expect(report.missing).not.toContain("favicon.ico");
      expect(report.score).toBeGreaterThan(0);
      expect(report.score).toBeLessThan(100);
      // Manifest sanity items were added.
      expect(report.items.find((i) => i.label === "manifest lists a 192px icon")?.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scores 100 when every required file is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "lacicon-"));
    try {
      for (const f of [
        "favicon.ico", "favicon-32x32.png", "favicon-16x16.png", "apple-touch-icon.png",
        "icon-192.png", "icon-512.png",
      ]) writeFileSync(join(dir, f), Buffer.from([0]));
      writeFileSync(
        join(dir, "manifest.webmanifest"),
        JSON.stringify({ icons: [{ sizes: "192x192" }, { sizes: "512x512" }] }),
      );
      expect(checkDir(dir).score).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("checkUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects head tags and audits the linked manifest", async () => {
    const html = `<!doctype html><html><head>
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/apple-touch-icon.png">
      <link rel="manifest" href="/manifest.webmanifest">
      <meta name="theme-color" content="#000">
    </head></html>`;
    const manifest = JSON.stringify({ icons: [{ sizes: "192x192" }, { sizes: "512x512" }] });
    vi.stubGlobal("fetch", vi.fn(async (u: string) => ({
      text: async () => (u.includes("manifest") ? manifest : html),
    })));
    const report = await checkUrl("https://example.com/");
    expect(report.kind).toBe("url");
    expect(report.score).toBe(100);
    expect(report.items.find((i) => i.label === "manifest lists a 512px icon")?.ok).toBe(true);
  });

  it("reports an unreachable page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const report = await check("https://nope.invalid/");
    expect(report.score).toBe(0);
    expect(report.missing).toContain("page is reachable");
  });
});
