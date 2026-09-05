import { describe, it, expect } from "vitest";
import {
  ogCard,
  ogCardSplit,
  ogCardMinimal,
  ogArticle,
  ogProduct,
  ogThemes,
  fitFontSize,
  type OgNode,
} from "./index";

/* ------------------------------------------------------------------ *
 * Helpers for walking the returned element tree
 * ------------------------------------------------------------------ */

function collectStrings(node: OgNode | string): string[] {
  if (typeof node === "string") return node ? [node] : [];
  const kids = node.props.children;
  if (kids === undefined) return [];
  const arr = Array.isArray(kids) ? kids : [kids];
  return arr.flatMap(collectStrings);
}

function collectStyles(node: OgNode | string): Record<string, string | number>[] {
  if (typeof node === "string") return [];
  const here = node.props.style ? [node.props.style] : [];
  const kids = node.props.children;
  const arr =
    kids === undefined ? [] : Array.isArray(kids) ? kids : [kids];
  return here.concat(arr.flatMap(collectStyles));
}

/** Concatenate every style value into one searchable blob. */
function styleBlob(node: OgNode): string {
  return collectStyles(node)
    .flatMap((s) => Object.values(s).map(String))
    .join(" | ");
}

function hasText(node: OgNode, text: string): boolean {
  return collectStrings(node).some((s) => s.includes(text));
}

/* ------------------------------------------------------------------ *
 * Existing card still works (backward compat)
 * ------------------------------------------------------------------ */

describe("ogCard (unchanged)", () => {
  it("renders the title text and gradient stops", () => {
    const tree = ogCard({ title: "Hello world", from: "#111111", to: "#222222" });
    expect(tree.type).toBe("div");
    expect(hasText(tree, "Hello world")).toBe(true);
    const blob = styleBlob(tree);
    expect(blob).toContain("#111111");
    expect(blob).toContain("#222222");
  });
});

/* ------------------------------------------------------------------ *
 * ogCardSplit
 * ------------------------------------------------------------------ */

describe("ogCardSplit", () => {
  it("is a horizontal two-column tree with title + accent panel", () => {
    const tree = ogCardSplit({
      title: "Split layout",
      subtitle: "sub.example.com",
      eyebrow: "Guide",
      logo: "L",
      from: "#abcdef",
      to: "#fedcba",
    });
    expect(styleBlob(tree)).toContain("row");
    expect(hasText(tree, "Split layout")).toBe(true);
    expect(hasText(tree, "sub.example.com")).toBe(true);
    expect(hasText(tree, "GUIDE")).toBe(true); // eyebrow uppercased
    expect(hasText(tree, "L")).toBe(true); // logo mark in panel
    const blob = styleBlob(tree);
    expect(blob).toContain("#abcdef");
    expect(blob).toContain("#fedcba");
  });

  it("falls back to the title initial when no logo given", () => {
    const tree = ogCardSplit({ title: "Zephyr" });
    expect(hasText(tree, "Z")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * ogCardMinimal
 * ------------------------------------------------------------------ */

describe("ogCardMinimal", () => {
  it("centers a big title on a full gradient", () => {
    const tree = ogCardMinimal({ title: "Big and bold", from: "#0ea5e9", to: "#2563eb" });
    expect(hasText(tree, "Big and bold")).toBe(true);
    const blob = styleBlob(tree);
    expect(blob).toContain("center");
    // full gradient background uses both stops
    expect(blob).toContain("#0ea5e9");
    expect(blob).toContain("#2563eb");
  });

  it("works with only a title (graceful degrade)", () => {
    const tree = ogCardMinimal({ title: "Just a title" });
    expect(hasText(tree, "Just a title")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * ogArticle
 * ------------------------------------------------------------------ */

describe("ogArticle", () => {
  it("shows category, title, author, date and reading time", () => {
    const tree = ogArticle({
      title: "How we built it",
      eyebrow: "Engineering",
      author: "Ada Lovelace",
      date: "Sep 5, 2026",
      readingTime: "6 min read",
    });
    expect(hasText(tree, "How we built it")).toBe(true);
    expect(hasText(tree, "ENGINEERING")).toBe(true);
    expect(hasText(tree, "Ada Lovelace")).toBe(true);
    expect(hasText(tree, "Sep 5, 2026")).toBe(true);
    expect(hasText(tree, "6 min read")).toBe(true);
  });

  it("degrades when meta is missing", () => {
    const tree = ogArticle({ title: "Bare article" });
    expect(hasText(tree, "Bare article")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * ogProduct
 * ------------------------------------------------------------------ */

describe("ogProduct", () => {
  it("renders title, price with currency, subtitle and badge", () => {
    const tree = ogProduct({
      title: "Pro plan",
      subtitle: "Everything you need",
      badge: "POPULAR",
      price: 49,
      currency: "$",
    });
    expect(hasText(tree, "Pro plan")).toBe(true);
    expect(hasText(tree, "Everything you need")).toBe(true);
    expect(hasText(tree, "POPULAR")).toBe(true);
    expect(hasText(tree, "$49")).toBe(true);
  });

  it("omits the price node when no price given", () => {
    const tree = ogProduct({ title: "No price" });
    expect(hasText(tree, "No price")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * ogThemes + gradient shorthand + patterns + dimensions
 * ------------------------------------------------------------------ */

describe("ogThemes and options", () => {
  it("exposes named gradient presets", () => {
    for (const name of ["lacspace", "ocean", "sunset", "forest", "grape", "slate"] as const) {
      expect(ogThemes[name]).toBeDefined();
      expect(typeof ogThemes[name].from).toBe("string");
      expect(typeof ogThemes[name].to).toBe("string");
    }
  });

  it("applies a named gradient via `gradient` on any card", () => {
    const tree = ogCardMinimal({ title: "Themed", gradient: "sunset" });
    const blob = styleBlob(tree);
    expect(blob).toContain(ogThemes.sunset.from);
    expect(blob).toContain(ogThemes.sunset.to);
  });

  it("explicit from/to override the named gradient", () => {
    const tree = ogCardMinimal({ title: "Override", gradient: "sunset", from: "#123456" });
    const blob = styleBlob(tree);
    expect(blob).toContain("#123456");
  });

  it("adds a dot pattern layer when requested", () => {
    const tree = ogArticle({ title: "Dotted", pattern: "dots" });
    expect(styleBlob(tree)).toContain("44px 44px");
  });

  it("adds a glow pattern layer when requested", () => {
    const tree = ogProduct({ title: "Glowing", pattern: "glow" });
    expect(styleBlob(tree)).toContain("blur");
  });

  it("fills 1200x630 by default", () => {
    for (const tree of [
      ogCardSplit({ title: "a" }),
      ogCardMinimal({ title: "b" }),
      ogArticle({ title: "c" }),
      ogProduct({ title: "d" }),
    ]) {
      const blob = styleBlob(tree);
      expect(blob).toContain("100%");
    }
    // sizing math is still shared
    expect(fitFontSize("x")).toBeGreaterThan(fitFontSize("x".repeat(120)));
  });
});
