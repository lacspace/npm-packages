import { describe, expect, it } from "vitest";
import {
  buildSvg, hasDevanagari, imagePrompt, isRefusal, pickText, SIZES, wrapText,
} from "./index.js";
import type { BrandTheme, CardSpec } from "./index.js";

const theme: BrandTheme = {
  bg: "#0b1f3a",
  fg: "#ffffff",
  accent: "#e63946",
  fontFamily: "Mukta",
  fontFamilyNe: "Noto Sans Devanagari",
  footer: "WeNepal",
};

describe("text helpers", () => {
  it("detects Devanagari", () => {
    expect(hasDevanagari("समाचार")).toBe(true);
    expect(hasDevanagari("news")).toBe(false);
  });
  it("wraps to a char budget", () => {
    expect(wrapText("one two three four", 8)).toEqual(["one two", "three", "four"]);
  });
  it("picks localized text by language (Nepali first for both)", () => {
    const v = { en: "Budget passed", ne: "बजेट पारित" };
    expect(pickText(v, "en")).toEqual(["Budget passed"]);
    expect(pickText(v, "ne")).toEqual(["बजेट पारित"]);
    expect(pickText(v, "both")).toEqual(["बजेट पारित", "Budget passed"]);
  });
});

describe("buildSvg", () => {
  const base = (over: Partial<CardSpec> = {}): CardSpec => ({ theme, lang: "both", headline: { en: "Budget passed", ne: "बजेट पारित भयो" }, ...over });

  it("produces a sized SVG with brand bg and both languages", () => {
    const svg = buildSvg(base({ size: "portrait" }));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1350"');
    expect(svg).toContain(theme.bg);
    expect(svg).toContain("बजेट पारित भयो"); // Devanagari
    expect(svg).toContain("Budget passed"); // English
    expect(svg).toContain("WeNepal"); // footer
  });

  it("uses the Devanagari family for Devanagari text", () => {
    const svg = buildSvg(base({ lang: "ne", headline: "काठमाडौं" }));
    expect(svg).toContain('font-family="Noto Sans Devanagari"');
  });

  it("renders a breaking banner with the accent color", () => {
    const svg = buildSvg(base({ type: "breaking", kicker: { en: "Breaking", ne: "ताजा खबर" }, lang: "en" }));
    expect(svg).toContain(`fill="${theme.accent}"`);
    expect(svg).toContain("BREAKING");
  });

  it("renders a stat card with a big value", () => {
    const svg = buildSvg(base({ type: "stat", stat: { value: "रु. १२ अर्ब", label: { ne: "कुल बजेट" } }, headline: undefined }));
    expect(svg).toContain("रु. १२ अर्ब");
    expect(svg).toContain("कुल बजेट");
  });

  it("escapes XML in text", () => {
    const svg = buildSvg(base({ headline: "A & B <tag>", lang: "en" }));
    expect(svg).toContain("A &amp; B &lt;tag&gt;");
    expect(svg).not.toContain("<tag>");
  });

  it("knows the standard sizes", () => {
    expect(SIZES.og).toEqual({ width: 1200, height: 630 });
    expect(SIZES.story).toEqual({ width: 1080, height: 1920 });
  });
});

describe("imagePrompt — safety", () => {
  it("builds an illustration prompt labeled 'AI illustration'", () => {
    const r = imagePrompt({ subject: "rising rice prices in a market", palette: ["#e63946"] });
    expect(isRefusal(r)).toBe(false);
    if (!isRefusal(r)) {
      expect(r.label).toBe("AI illustration");
      expect(r.prompt).toContain("non-photorealistic");
      expect(r.negativePrompt).toContain("photorealistic");
    }
  });
  it("refuses photoreal requests", () => {
    const r = imagePrompt({ subject: "a flood", style: "photorealistic" });
    expect(isRefusal(r)).toBe(true);
    if (isRefusal(r)) expect(r.reason).toMatch(/photoreal/i);
  });
  it("refuses images of named real public figures", () => {
    const r = imagePrompt({ subject: "the Prime Minister announcing the budget" });
    expect(isRefusal(r)).toBe(true);
  });
  it("refuses an empty subject", () => {
    expect(isRefusal(imagePrompt({ subject: "" }))).toBe(true);
  });
});
