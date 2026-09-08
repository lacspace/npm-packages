import { describe, it, expect } from "vitest";
import {
  generateManifest,
  manifestToJSON,
  manifestLinkTags,
  generateServiceWorker,
  generateOfflinePage,
} from "./index";

describe("manifest", () => {
  it("fills sensible defaults", () => {
    const m = generateManifest({ name: "Lacspace" });
    expect(m.short_name).toBe("Lacspace");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons.length).toBeGreaterThan(0);
  });

  it("respects overrides and omits unset optionals", () => {
    const m = generateManifest({ name: "App", shortName: "A", themeColor: "#4d9fff", display: "fullscreen" });
    expect(m.short_name).toBe("A");
    expect(m.theme_color).toBe("#4d9fff");
    expect(m.display).toBe("fullscreen");
    expect("description" in m).toBe(false);
  });

  it("manifestToJSON produces valid parseable JSON", () => {
    const json = manifestToJSON({ name: "App", description: "hi" });
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("App");
    expect(parsed.description).toBe("hi");
  });

  it("link tags include manifest + theme color", () => {
    const tags = manifestLinkTags({ themeColor: "#123456", appleTouchIcon: "/apple.png" });
    expect(tags).toContain('rel="manifest"');
    expect(tags).toContain("#123456");
    expect(tags).toContain("apple-touch-icon");
  });
});

describe("service worker", () => {
  it("is syntactically valid JavaScript", () => {
    const src = generateServiceWorker({ cacheName: "t-v1", precache: ["/", "/offline"], offlineUrl: "/offline" });
    // new Function compiles (but does not run) — throws on any syntax error.
    expect(() => new Function(src)).not.toThrow();
  });

  it("injects the config and includes lifecycle handlers", () => {
    const src = generateServiceWorker({ cacheName: "myapp-v2", precache: ["/a"] });
    expect(src).toContain('"cacheName": "myapp-v2"');
    expect(src).toContain('addEventListener("install"');
    expect(src).toContain('addEventListener("activate"');
    expect(src).toContain('addEventListener("fetch"');
  });

  it("includes push handlers when enabled and omits them when not", () => {
    const withPush = generateServiceWorker({ enablePush: true });
    const noPush = generateServiceWorker({ enablePush: false });
    expect(withPush).toContain('addEventListener("push"');
    expect(withPush).toContain('addEventListener("notificationclick"');
    expect(noPush).not.toContain('addEventListener("push"');
  });

  it("all three strategies still compile", () => {
    for (const strategy of ["network-first", "cache-first", "stale-while-revalidate"] as const) {
      const src = generateServiceWorker({ strategy });
      expect(() => new Function(src)).not.toThrow();
      expect(src).toContain(`"strategy": "${strategy}"`);
    }
  });
});

describe("offline page", () => {
  it("generates valid-looking HTML with the message", () => {
    const html = generateOfflinePage({ title: "Offline", message: "No net" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Offline");
    expect(html).toContain("No net");
  });
});
