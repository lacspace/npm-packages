/**
 * There is no DOM environment configured for this package, so these cover the
 * pure logic the layout and typography components are built out of — the parts
 * that are worth getting wrong.
 */
import { describe, it, expect } from "vitest";
import {
  gridTemplate,
  lengthToken,
  ratioToPercent,
  resolveResponsive,
  responsiveVars,
  scrollEdges,
  spaceToken,
  spanValue,
} from "./layout.js";
import { splitHighlight, truncateMiddle } from "./typography.js";

describe("spaceToken", () => {
  it("maps a scale step to the space variable so a restyled scale moves every gap", () => {
    expect(spaceToken(1)).toBe("var(--lac-space-1)");
    expect(spaceToken(6)).toBe("var(--lac-space-6)");
  });

  it("treats a number outside the scale as pixels rather than inventing a step", () => {
    expect(spaceToken(0)).toBe("0");
    expect(spaceToken(7)).toBe("7px");
    expect(spaceToken(2.5)).toBe("2.5px");
  });

  it("passes an arbitrary css length straight through", () => {
    expect(spaceToken("2rem")).toBe("2rem");
    expect(spaceToken("clamp(8px, 2vw, 24px)")).toBe("clamp(8px, 2vw, 24px)");
    expect(spaceToken("var(--app-gap)")).toBe("var(--app-gap)");
  });

  it("returns nothing for an absent or unusable value, so no variable is written", () => {
    expect(spaceToken(undefined)).toBeUndefined();
    expect(spaceToken("   ")).toBeUndefined();
    expect(lengthToken(Number.NaN)).toBeUndefined();
  });
});

describe("gridTemplate", () => {
  it("builds equal tracks that cannot be blown out by their content", () => {
    expect(gridTemplate(3)).toBe("repeat(3, minmax(0, 1fr))");
  });

  it("clamps a nonsense column count to a single usable track", () => {
    expect(gridTemplate(0)).toBe("repeat(1, minmax(0, 1fr))");
    expect(gridTemplate(-4)).toBe("repeat(1, minmax(0, 1fr))");
    expect(gridTemplate(2.7)).toBe("repeat(2, minmax(0, 1fr))");
  });

  it("passes a hand-written template through untouched", () => {
    expect(gridTemplate("2fr 1fr")).toBe("2fr 1fr");
  });

  it("builds an auto-fit grid that cannot overflow a narrow viewport", () => {
    expect(gridTemplate(undefined, 240)).toBe("repeat(auto-fit, minmax(min(240px, 100%), 1fr))");
    expect(gridTemplate(undefined, "18rem")).toBe("repeat(auto-fit, minmax(min(18rem, 100%), 1fr))");
  });

  it("lets an explicit column count win over a minimum column width", () => {
    expect(gridTemplate(4, 240)).toBe("repeat(4, minmax(0, 1fr))");
  });

  it("falls back to one column when it is given nothing at all", () => {
    expect(gridTemplate()).toBe("repeat(1, minmax(0, 1fr))");
  });
});

describe("spanValue", () => {
  it("spans every track for 'full' and whole tracks for a number", () => {
    expect(spanValue("full")).toBe("1 / -1");
    expect(spanValue(2)).toBe("span 2");
    expect(spanValue(0)).toBe("span 1");
    expect(spanValue(undefined)).toBeUndefined();
  });
});

describe("responsive props", () => {
  it("treats a bare value as the base breakpoint", () => {
    expect(resolveResponsive("row")).toEqual({ base: "row" });
  });

  it("keeps only the breakpoints that were actually given", () => {
    expect(resolveResponsive({ base: "column", md: "row" })).toEqual({ base: "column", md: "row" });
  });

  it("writes one custom property per given breakpoint and none for the rest", () => {
    expect(responsiveVars("--lac-stack-dir", { base: "column", md: "row" }, (v) => v)).toEqual({
      "--lac-stack-dir": "column",
      "--lac-stack-dir-md": "row",
    });
  });

  it("resolves each breakpoint's value through the token resolver", () => {
    expect(responsiveVars("--lac-stack-gap", { base: 2, lg: "3rem" }, spaceToken)).toEqual({
      "--lac-stack-gap": "var(--lac-space-2)",
      "--lac-stack-gap-lg": "3rem",
    });
  });

  it("writes nothing at all when the prop was not passed", () => {
    expect(responsiveVars("--lac-grid-cols", undefined, (v: number) => String(v))).toEqual({});
  });

  it("drops a breakpoint whose value resolves to nothing usable", () => {
    expect(responsiveVars("--lac-stack-gap", { base: 1, sm: "  " }, spaceToken)).toEqual({
      "--lac-stack-gap": "var(--lac-space-1)",
    });
  });
});

describe("ratioToPercent", () => {
  it("turns '16/9' into the padding-top percentage that reproduces it", () => {
    expect(ratioToPercent("16/9")).toBe(56.25);
  });

  it("accepts the colon spelling and a plain number", () => {
    expect(ratioToPercent("16:9")).toBe(56.25);
    expect(ratioToPercent(1)).toBe(100);
    expect(ratioToPercent(4 / 3)).toBe(75);
  });

  it("falls back to 16/9 for a ratio that could not produce a box", () => {
    expect(ratioToPercent("banana")).toBe(56.25);
    expect(ratioToPercent("16/0")).toBe(56.25);
    expect(ratioToPercent(0)).toBe(56.25);
    expect(ratioToPercent(-2)).toBe(56.25);
    expect(ratioToPercent(undefined)).toBe(56.25);
  });

  it("honours a caller's own fallback", () => {
    expect(ratioToPercent("nope", 100)).toBe(100);
  });
});

describe("scrollEdges", () => {
  it("reports nothing to scroll when the content fits", () => {
    expect(scrollEdges(0, 300, 300)).toEqual({ scrollable: false, atStart: true, atEnd: true });
  });

  it("marks the start edge before the first scroll and the end edge at the bottom", () => {
    expect(scrollEdges(0, 100, 400)).toEqual({ scrollable: true, atStart: true, atEnd: false });
    expect(scrollEdges(300, 100, 400)).toEqual({ scrollable: true, atStart: false, atEnd: true });
  });

  it("shows both shadows in the middle of a long list", () => {
    expect(scrollEdges(150, 100, 400)).toEqual({ scrollable: true, atStart: false, atEnd: false });
  });

  it("absorbs the sub-pixel rounding that makes a naive check flicker", () => {
    expect(scrollEdges(0.5, 100, 400).atStart).toBe(true);
    expect(scrollEdges(299.4, 100, 400).atEnd).toBe(true);
  });

  it("clamps an over-scrolled offset instead of reporting an impossible edge", () => {
    expect(scrollEdges(-80, 100, 400).atStart).toBe(true);
    expect(scrollEdges(9999, 100, 400).atEnd).toBe(true);
  });
});

describe("truncateMiddle", () => {
  it("leaves a string that already fits completely alone", () => {
    expect(truncateMiddle("short.txt", 32)).toBe("short.txt");
  });

  it("keeps both informative ends of a long path", () => {
    expect(truncateMiddle("/Users/apple/projects/components/src/layout.tsx", 20)).toBe(
      "/Users/app\u2026ayout.tsx",
    );
  });

  it("never returns more characters than the maximum it was given", () => {
    const long = "0123456789".repeat(10);
    for (const max of [1, 2, 3, 7, 12, 33, 99]) {
      expect(truncateMiddle(long, max).length).toBeLessThanOrEqual(max);
    }
  });

  it("never returns more characters than the input it was given", () => {
    for (const input of ["", "a", "abc", "abcdefghij"]) {
      expect(truncateMiddle(input, 4).length).toBeLessThanOrEqual(Math.max(input.length, 0));
    }
  });

  it("keeps the marker over the tail when only one end still fits", () => {
    expect(truncateMiddle("abcdefgh", 2)).toBe("a\u2026");
  });

  it("drops the marker entirely when there is no room for it rather than overflowing", () => {
    expect(truncateMiddle("abcdefgh", 1)).toBe("a");
    expect(truncateMiddle("abcdefgh", 0)).toBe("");
    expect(truncateMiddle("abcdefgh", -5)).toBe("");
  });

  it("accepts a custom marker and still respects the maximum", () => {
    const out = truncateMiddle("abcdefghijklmnop", 9, "...");
    expect(out).toBe("abc...nop");
    expect(out.length).toBe(9);
  });
});

describe("splitHighlight", () => {
  it("marks a match regardless of case", () => {
    expect(splitHighlight("Lacspace Components", "COMPONENTS")).toEqual([
      { text: "Lacspace ", match: false },
      { text: "Components", match: true },
    ]);
  });

  it("marks every occurrence, not just the first", () => {
    expect(splitHighlight("ab-ab-ab", "ab").filter((p) => p.match)).toHaveLength(3);
  });

  it("never overlaps matches", () => {
    const parts = splitHighlight("aaaa", "aa");
    expect(parts).toEqual([
      { text: "aa", match: true },
      { text: "aa", match: true },
    ]);
  });

  it("treats regex metacharacters in the query as literal text", () => {
    expect(splitHighlight("price is 1.5 and 125", ".")).toEqual([
      { text: "price is 1", match: false },
      { text: ".", match: true },
      { text: "5 and 125", match: false },
    ]);
    expect(splitHighlight("a+b", "a+b")).toEqual([{ text: "a+b", match: true }]);
    expect(splitHighlight("c:\\temp\\x", "\\t")).toEqual([
      { text: "c:", match: false },
      { text: "\\t", match: true },
      { text: "emp\\x", match: false },
    ]);
  });

  it("returns the text untouched when there is nothing to match", () => {
    expect(splitHighlight("hello", "")).toEqual([{ text: "hello", match: false }]);
    expect(splitHighlight("hello", "   ")).toEqual([{ text: "hello", match: false }]);
    expect(splitHighlight("hello", "zz")).toEqual([{ text: "hello", match: false }]);
    expect(splitHighlight("hello", "hello world")).toEqual([{ text: "hello", match: false }]);
    expect(splitHighlight("", "a")).toEqual([]);
  });

  it("preserves the original text exactly when the parts are joined back up", () => {
    const text = "The Quick brown FOX jumps over the quick fox";
    for (const query of ["quick", "FOX", "o", "the "]) {
      expect(
        splitHighlight(text, query)
          .map((p) => p.text)
          .join(""),
      ).toBe(text);
    }
  });

  it("keeps the original casing of the marked run", () => {
    const parts = splitHighlight("Hello World", "world");
    expect(parts[parts.length - 1]).toEqual({ text: "World", match: true });
  });

  it("matches exactly when case sensitivity is asked for", () => {
    expect(splitHighlight("Fox fox", "fox", true).filter((p) => p.match)).toHaveLength(1);
  });
});
