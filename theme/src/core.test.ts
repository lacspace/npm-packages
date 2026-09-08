import { describe, expect, it, vi } from "vitest";
import {
  bestContrastColor,
  contrastRatio,
  createMemoryStorage,
  createThemeController,
  cssVariables,
  cycleTheme,
  darken,
  generateThemeCss,
  isValidTheme,
  lighten,
  meetsContrast,
  mixHex,
  parseHex,
  prefersColorSchemeQuery,
  readStoredTheme,
  relativeLuminance,
  renderCssVariables,
  resolveTheme,
  rgbToHex,
  systemThemeFromMatches,
  themeSelector,
  toggleTheme,
  writeStoredTheme,
} from "./core";

// These tests exercise ONLY the pure, React-free theming core. They run under
// the monorepo's node-env vitest — no jsdom, no React, no DOM, no localStorage.

describe("resolveTheme", () => {
  it("resolves system to the known OS scheme", () => {
    expect(resolveTheme("system", { systemTheme: "dark" })).toBe("dark");
    expect(resolveTheme("system", { systemTheme: "light" })).toBe("light");
  });

  it("falls back when the OS scheme is unknown", () => {
    expect(resolveTheme("system", {})).toBe("light");
    expect(resolveTheme("system", { fallback: "dark" })).toBe("dark");
  });

  it("returns non-system themes unchanged", () => {
    expect(resolveTheme("sepia", { systemTheme: "dark" })).toBe("sepia");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("honours enableSystem:false and a custom systemName", () => {
    expect(resolveTheme("system", { systemTheme: "dark", enableSystem: false })).toBe(
      "system",
    );
    expect(resolveTheme("auto", { systemTheme: "dark", systemName: "auto" })).toBe("dark");
  });
});

describe("toggleTheme / cycleTheme / isValidTheme", () => {
  it("toggles light and dark, leaving custom themes alone", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
    expect(toggleTheme("sepia")).toBe("sepia");
  });

  it("cycles through the theme list, wrapping around", () => {
    const themes = ["light", "dark", "sepia"];
    expect(cycleTheme("light", themes)).toBe("dark");
    expect(cycleTheme("sepia", themes)).toBe("light");
    expect(cycleTheme("unknown", themes)).toBe("light");
    expect(cycleTheme("light", [])).toBe("light");
  });

  it("validates membership", () => {
    expect(isValidTheme("dark", ["light", "dark"])).toBe(true);
    expect(isValidTheme("sepia", ["light", "dark"])).toBe(false);
  });
});

describe("media-query + selector builders", () => {
  it("builds prefers-color-scheme queries", () => {
    expect(prefersColorSchemeQuery()).toBe("(prefers-color-scheme: dark)");
    expect(prefersColorSchemeQuery("light")).toBe("(prefers-color-scheme: light)");
  });

  it("maps matchMedia matches to a scheme", () => {
    expect(systemThemeFromMatches(true)).toBe("dark");
    expect(systemThemeFromMatches(false)).toBe("light");
  });

  it("builds class and attribute selectors", () => {
    expect(themeSelector("dark")).toBe(".dark");
    expect(themeSelector("dark", "data-theme")).toBe('[data-theme="dark"]');
  });
});

describe("cssVariables / renderCssVariables", () => {
  it("kebab-cases and prefixes tokens", () => {
    expect(cssVariables({ bgColor: "#fff", radius: 8 })).toEqual({
      "--bg-color": "#fff",
      "--radius": "8",
    });
    expect(cssVariables({ bgColor: "#fff" }, { prefix: "app" })).toEqual({
      "--app-bg-color": "#fff",
    });
  });

  it("keeps names already starting with -- verbatim", () => {
    expect(cssVariables({ "--x": "1" })).toEqual({ "--x": "1" });
  });

  it("renders declaration lines", () => {
    expect(renderCssVariables({ bg: "#fff", fg: "#000" })).toBe(
      "  --bg: #fff;\n  --fg: #000;",
    );
  });
});

describe("generateThemeCss", () => {
  it("emits :root for the default theme plus per-theme blocks", () => {
    const css = generateThemeCss(
      { light: { bg: "#fff" }, dark: { bg: "#000" } },
      { defaultTheme: "light", attribute: "data-theme" },
    );
    expect(css).toContain(":root {\n  --bg: #fff;\n}");
    expect(css).toContain('[data-theme="light"] {\n  --bg: #fff;\n}');
    expect(css).toContain('[data-theme="dark"] {\n  --bg: #000;\n}');
  });

  it("uses class selectors by default and skips :root without a default theme", () => {
    const css = generateThemeCss({ dark: { bg: "#000" } });
    expect(css).toContain(".dark {\n  --bg: #000;\n}");
    expect(css.startsWith(":root")).toBe(false);
  });
});

describe("parseHex / rgbToHex", () => {
  it("parses 3-, 6- and 8-digit hex, with or without #", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex("#ff8800aa")).toEqual({ r: 255, g: 136, b: 0 });
  });

  it("returns null for invalid input", () => {
    expect(parseHex("nope")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
  });

  it("round-trips through rgbToHex", () => {
    expect(rgbToHex({ r: 255, g: 136, b: 0 })).toBe("#ff8800");
  });
});

describe("contrast helpers", () => {
  it("computes luminance for black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("computes the 21:1 black-on-white ratio, order-independent", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 4);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 4);
  });

  it("evaluates WCAG thresholds", () => {
    expect(meetsContrast("#000000", "#ffffff")).toBe(true);
    expect(meetsContrast("#777777", "#ffffff", { level: "AAA" })).toBe(false);
    expect(meetsContrast("#767676", "#ffffff", { size: "large" })).toBe(true);
  });

  it("picks the readable text colour for a surface", () => {
    expect(bestContrastColor("#ffffff")).toBe("#000000");
    expect(bestContrastColor("#000000")).toBe("#ffffff");
    expect(bestContrastColor("#222222", { dark: "#111111", light: "#eeeeee" })).toBe(
      "#eeeeee",
    );
  });
});

describe("mixHex / lighten / darken", () => {
  it("mixes two colours by weight", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("lightens and darkens", () => {
    expect(lighten("#808080", 1)).toBe("#ffffff");
    expect(darken("#808080", 1)).toBe("#000000");
  });

  it("returns the base colour when a hex is invalid", () => {
    expect(mixHex("nope", "#ffffff", 0.5)).toBe("nope");
  });
});

describe("persistence codec (injectable storage)", () => {
  it("reads and writes through an injected storage", () => {
    const storage = createMemoryStorage();
    expect(readStoredTheme(storage, "theme", "light")).toBe("light");
    expect(writeStoredTheme(storage, "theme", "dark")).toBe(true);
    expect(readStoredTheme(storage, "theme")).toBe("dark");
  });

  it("never throws when storage misbehaves", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredTheme(broken, "theme", "light")).toBe("light");
    expect(writeStoredTheme(broken, "theme", "dark")).toBe(false);
  });

  it("treats a missing storage as absent", () => {
    expect(readStoredTheme(undefined, "theme", "system")).toBe("system");
    expect(writeStoredTheme(undefined, "theme", "dark")).toBe(false);
  });
});

describe("createThemeController", () => {
  it("hydrates from storage over the default theme", () => {
    const storage = createMemoryStorage({ theme: "dark" });
    const c = createThemeController({ storage, defaultTheme: "system" });
    expect(c.getState().theme).toBe("dark");
    expect(c.getState().resolvedTheme).toBe("dark");
  });

  it("resolves system against a supplied OS scheme and updates live", () => {
    const c = createThemeController({
      storage: createMemoryStorage(),
      getSystemTheme: () => "light",
    });
    expect(c.getState().resolvedTheme).toBe("light");
    c.setSystemTheme("dark");
    expect(c.getState().resolvedTheme).toBe("dark");
  });

  it("persists on setTheme and notifies subscribers", () => {
    const storage = createMemoryStorage();
    const c = createThemeController({ storage });
    const seen: string[] = [];
    const unsub = c.subscribe((s) => seen.push(s.resolvedTheme));
    c.setTheme("dark");
    expect(storage.getItem("theme")).toBe("dark");
    expect(seen).toEqual(["dark"]);
    unsub();
    c.setTheme("light");
    expect(seen).toEqual(["dark"]);
  });

  it("toggles and cycles", () => {
    const c = createThemeController({
      storage: createMemoryStorage(),
      getSystemTheme: () => "light",
      themes: ["light", "dark", "sepia"],
    });
    c.toggle(); // resolved is light → dark
    expect(c.getState().theme).toBe("dark");
    c.cycle();
    expect(c.getState().theme).toBe("sepia");
  });

  it("does not emit when the theme is unchanged", () => {
    const c = createThemeController({ storage: createMemoryStorage(), defaultTheme: "light" });
    const listener = vi.fn();
    c.subscribe(listener);
    c.setTheme("light");
    expect(listener).not.toHaveBeenCalled();
  });
});
