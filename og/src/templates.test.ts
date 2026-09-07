import { describe, it, expect } from "vitest";
import {
  ogTemplateSvg,
  ogTemplateSvgDataUri,
  ogGradients,
  ogSurfaces,
  fitTitle,
  ogQuote,
  ogEvent,
  ogThemes,
  type OgNode,
  type OgTemplate,
} from "./index";

/* Walk an element tree (same helpers as index.test.ts). */
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
  const arr = kids === undefined ? [] : Array.isArray(kids) ? kids : [kids];
  return here.concat(arr.flatMap(collectStyles));
}
function styleBlob(node: OgNode): string {
  return collectStyles(node)
    .flatMap((s) => Object.values(s).map(String))
    .join(" | ");
}
function hasText(node: OgNode, text: string): boolean {
  return collectStrings(node).some((s) => s.includes(text));
}
const TEMPLATES: OgTemplate[] = ["classic", "minimal", "split", "article", "product", "quote", "event"];

/* ------------------------------------------------------------------ *
 * ogTemplateSvg — structure for every template
 * ------------------------------------------------------------------ */

describe("ogTemplateSvg", () => {
  it("renders a well-formed <svg> for every template with the title text", () => {
    for (const template of TEMPLATES) {
      const svg = ogTemplateSvg({ template, title: "Marker headline", when: "Now", author: "Ada" });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
      expect(svg).toContain("Marker headline");
    }
  });

  it("applies explicit from/to gradient stops in the defs", () => {
    const svg = ogTemplateSvg({ title: "Colors", from: "#abcdef", to: "#fedcba" });
    expect(svg).toContain("#abcdef");
    expect(svg).toContain("#fedcba");
  });

  it("applies a named gradient preset", () => {
    const svg = ogTemplateSvg({ title: "Themed", gradient: "aurora" });
    expect(svg).toContain(ogGradients.aurora.from);
    expect(svg).toContain(ogGradients.aurora.to);
  });

  it("explicit from/to still win over a named gradient", () => {
    const svg = ogTemplateSvg({ title: "Win", gradient: "aurora", from: "#010203" });
    expect(svg).toContain("#010203");
  });

  it("applies a named surface palette (bg colour present)", () => {
    const svg = ogTemplateSvg({ title: "Surface", surface: "cream" });
    expect(svg).toContain(ogSurfaces.cream.bg);
  });

  it("honours full custom bg/fg colours", () => {
    const svg = ogTemplateSvg({ title: "Custom", bg: "#101010", fg: "#f0f0f0" });
    expect(svg).toContain("#101010");
    expect(svg).toContain("#f0f0f0");
  });

  it("light theme uses a white ground", () => {
    const svg = ogTemplateSvg({ title: "Light", theme: "light" });
    expect(svg).toContain("#ffffff");
  });

  it("embeds a logo/avatar image as an <image> element", () => {
    const uri = "data:image/png;base64,AAAA";
    const svg = ogTemplateSvg({ template: "article", title: "With logo", image: uri });
    expect(svg).toContain("<image");
    expect(svg).toContain(uri);
    expect(svg).toContain("clip-path");
  });

  it("falls back to an initials badge mark when no image is given", () => {
    const svg = ogTemplateSvg({ template: "article", title: "Badge", initials: "LS" });
    expect(svg).toContain("url(#lac-accent)");
    expect(svg).toContain(">LS<");
  });

  it("renders the badge pill and its text", () => {
    const svg = ogTemplateSvg({ template: "product", title: "Plan", badge: "POPULAR" });
    expect(svg).toContain("POPULAR");
    expect(svg).toContain("rx=\"22\"");
  });

  it("wraps a long title into multiple <tspan> lines", () => {
    const long =
      "This is an extremely long headline that absolutely cannot fit onto a single line of the card";
    const svg = ogTemplateSvg({ title: long });
    const tspans = svg.match(/<tspan/g) ?? [];
    expect(tspans.length).toBeGreaterThan(1);
  });

  it("keeps a short title on a single line", () => {
    const svg = ogTemplateSvg({ title: "Short" });
    const tspans = svg.match(/<tspan/g) ?? [];
    expect(tspans.length).toBe(1);
  });

  it("adds a dot / grid pattern layer when requested", () => {
    expect(ogTemplateSvg({ title: "Dots", pattern: "dots" })).toContain("lac-dots");
    expect(ogTemplateSvg({ title: "Grid", pattern: "grid" })).toContain("lac-grid");
  });

  it("can drop the accent bar", () => {
    const withBar = ogTemplateSvg({ title: "Bar", accentBar: true });
    const noBar = ogTemplateSvg({ title: "Bar", accentBar: false });
    expect(noBar.match(/url\(#lac-accent-h\)/g)?.length ?? 0).toBeLessThan(
      withBar.match(/url\(#lac-accent-h\)/g)?.length ?? 0,
    );
  });

  it("article template shows author, date and reading time", () => {
    const svg = ogTemplateSvg({
      template: "article",
      title: "Post",
      author: "Ada Lovelace",
      date: "Sep 7, 2026",
      readingTime: "6 min read",
    });
    expect(svg).toContain("Ada Lovelace");
    expect(svg).toContain("Sep 7, 2026");
    expect(svg).toContain("6 min read");
  });

  it("product template shows price with currency prefix", () => {
    const svg = ogTemplateSvg({ template: "product", title: "Pro", price: 49, currency: "$" });
    expect(svg).toContain("$49");
  });

  it("event template shows date/time and location", () => {
    const svg = ogTemplateSvg({ template: "event", title: "Conf", when: "Oct 3", location: "Kathmandu" });
    expect(svg).toContain("Oct 3");
    expect(svg).toContain("Kathmandu");
  });

  it("quote template renders a quote mark and attribution", () => {
    const svg = ogTemplateSvg({ template: "quote", title: "Be excellent", author: "Someone" });
    expect(svg).toContain("&#8220;");
    expect(svg).toContain("Someone");
  });

  it("escapes angle brackets and ampersands in the title", () => {
    const svg = ogTemplateSvg({ title: "A & B <script>" });
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;");
    expect(svg).not.toContain("<script>");
  });

  it("honours custom width/height", () => {
    const svg = ogTemplateSvg({ title: "Wide", width: 800, height: 400 });
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="400"');
  });
});

/* ------------------------------------------------------------------ *
 * ogTemplateSvgDataUri
 * ------------------------------------------------------------------ */

describe("ogTemplateSvgDataUri", () => {
  it("returns an svg data URI", () => {
    const uri = ogTemplateSvgDataUri({ title: "Hi" });
    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("<svg");
  });
});

/* ------------------------------------------------------------------ *
 * Named presets
 * ------------------------------------------------------------------ */

describe("ogGradients / ogSurfaces", () => {
  it("ogGradients is a superset of ogThemes", () => {
    for (const name of Object.keys(ogThemes) as (keyof typeof ogThemes)[]) {
      expect(ogGradients[name]).toEqual(ogThemes[name]);
    }
    expect(Object.keys(ogGradients).length).toBeGreaterThan(Object.keys(ogThemes).length);
  });

  it("every surface palette has bg/fg/muted/border", () => {
    for (const s of Object.values(ogSurfaces)) {
      expect(typeof s.bg).toBe("string");
      expect(typeof s.fg).toBe("string");
      expect(typeof s.muted).toBe("string");
      expect(typeof s.border).toBe("string");
    }
  });
});

/* ------------------------------------------------------------------ *
 * fitTitle (auto text-fit)
 * ------------------------------------------------------------------ */

describe("fitTitle", () => {
  it("keeps a short title at max size on one line", () => {
    const r = fitTitle("Short", { maxWidth: 1000, max: 80, min: 40 });
    expect(r.fontSize).toBe(80);
    expect(r.lines).toEqual(["Short"]);
  });

  it("shrinks the font for a long title and never exceeds maxLines", () => {
    const long = "word ".repeat(60).trim();
    const r = fitTitle(long, { maxWidth: 900, maxLines: 3, max: 80, min: 30 });
    expect(r.lines.length).toBeLessThanOrEqual(3);
    expect(r.fontSize).toBeLessThan(80);
    expect(r.fontSize).toBeGreaterThanOrEqual(30);
  });

  it("truncates with an ellipsis when it still overflows at min size", () => {
    const huge = "verylongunbreakableword ".repeat(40).trim();
    const r = fitTitle(huge, { maxWidth: 400, maxLines: 2, max: 70, min: 40 });
    expect(r.lines.length).toBeLessThanOrEqual(2);
    expect(r.lines[r.lines.length - 1]!.endsWith("…")).toBe(true);
  });

  it("hard-breaks a single word longer than a line", () => {
    const r = fitTitle("supercalifragilisticexpialidocious", { maxWidth: 120, maxLines: 5, max: 60, min: 20, charRatio: 0.6 });
    expect(r.lines.length).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ *
 * Element-tree layouts: ogQuote + ogEvent
 * ------------------------------------------------------------------ */

describe("ogQuote (element tree)", () => {
  it("renders the quote text and attribution", () => {
    const tree = ogQuote({ title: "Stay hungry", author: "S. Jobs", from: "#111111", to: "#222222" });
    expect(hasText(tree, "Stay hungry")).toBe(true);
    expect(hasText(tree, "S. Jobs")).toBe(true);
    const blob = styleBlob(tree);
    expect(blob).toContain("#111111");
    expect(blob).toContain("#222222");
  });

  it("degrades to just the quote when no attribution given", () => {
    const tree = ogQuote({ title: "Alone" });
    expect(hasText(tree, "Alone")).toBe(true);
  });
});

describe("ogEvent (element tree)", () => {
  it("renders eyebrow, title, date and location", () => {
    const tree = ogEvent({
      title: "DevConf 2026",
      eyebrow: "Meetup",
      when: "Oct 3, 6pm",
      location: "Kathmandu",
    });
    expect(hasText(tree, "DevConf 2026")).toBe(true);
    expect(hasText(tree, "MEETUP")).toBe(true);
    expect(hasText(tree, "Oct 3, 6pm")).toBe(true);
    expect(hasText(tree, "Kathmandu")).toBe(true);
  });

  it("applies a named gradient shorthand", () => {
    const tree = ogEvent({ title: "Themed", gradient: "ember" });
    const blob = styleBlob(tree);
    expect(blob).toContain(ogGradients.ember.from);
    expect(blob).toContain(ogGradients.ember.to);
  });

  it("embeds an image mark via <img>", () => {
    const tree = ogEvent({ title: "Logo", image: "data:image/png;base64,AAAA" });
    const found = (function walk(n: OgNode | string): boolean {
      if (typeof n === "string") return false;
      if (n.type === "img") return true;
      const kids = n.props.children;
      const arr = kids === undefined ? [] : Array.isArray(kids) ? kids : [kids];
      return arr.some(walk);
    })(tree);
    expect(found).toBe(true);
  });
});
