import { describe, it, expect } from "vitest";
import {
  AVATAR_COLOR_COUNT,
  colorIndexFor,
  deltaTone,
  flattenTree,
  formatDelta,
  initials,
  mergeTags,
  normalizeMetrics,
  normalizeRating,
  roundToHalf,
  splitAvatarOverflow,
  splitKeys,
  splitTagInput,
  type TreeNode,
} from "./display.js";

describe("initials", () => {
  it("takes the first and last initial when a name has several words", () => {
    expect(initials("Ada Byron Lovelace")).toBe("AL");
  });

  it("falls back to the first two letters when there is only one word", () => {
    expect(initials("Madonna")).toBe("MA");
  });

  it("returns an empty string for a blank or whitespace-only name", () => {
    expect(initials("")).toBe("");
    expect(initials("   \n\t ")).toBe("");
  });

  it("keeps a multi-byte first character whole instead of splitting the pair", () => {
    expect(initials("😀lias Moon")).toBe("😀M");
    expect(initials("Ñoño Álvarez")).toBe("ÑÁ");
  });

  it("ignores the extra spaces a pasted name arrives with", () => {
    expect(initials("  grace   hopper  ")).toBe("GH");
  });

  it("honours a max of one letter", () => {
    expect(initials("Ada Lovelace", 1)).toBe("A");
    expect(initials("Madonna", 1)).toBe("M");
  });
});

describe("colorIndexFor", () => {
  it("gives the same name the same colour every single time", () => {
    const once = colorIndexFor("Grace Hopper");
    for (let i = 0; i < 25; i += 1) expect(colorIndexFor("Grace Hopper")).toBe(once);
  });

  it("keeps every index inside the palette, including for an empty seed", () => {
    const seeds = ["", "a", "Zoë", "a-very-long-name@example.com", "李小龍", "0"];
    for (const seed of seeds) {
      const index = colorIndexFor(seed);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_COLOR_COUNT);
    }
  });

  it("spreads a realistic set of names over more than one colour", () => {
    const names = ["Ada", "Grace", "Alan", "Katherine", "Linus", "Margaret", "Barbara", "Tim"];
    expect(new Set(names.map((n) => colorIndexFor(n))).size).toBeGreaterThan(1);
  });

  it("falls back to bucket 0 when the palette size is nonsense", () => {
    expect(colorIndexFor("Ada", 0)).toBe(0);
    expect(colorIndexFor("Ada", Number.NaN)).toBe(0);
  });
});

describe("splitAvatarOverflow", () => {
  it("shows every member and no counter when the group fits", () => {
    const result = splitAvatarOverflow(["a", "b", "c"], 4);
    expect(result.visible).toEqual(["a", "b", "c"]);
    expect(result.overflow).toBe(0);
  });

  it("counts the members it folded away into the +N chip", () => {
    const result = splitAvatarOverflow(["a", "b", "c", "d", "e", "f"], 3);
    expect(result.visible).toEqual(["a", "b", "c"]);
    expect(result.hidden).toEqual(["d", "e", "f"]);
    expect(result.overflow).toBe(3);
  });

  it("hides everyone behind the counter when max is zero or negative", () => {
    expect(splitAvatarOverflow(["a", "b"], 0)).toEqual({ visible: [], hidden: ["a", "b"], overflow: 2 });
  });
});

describe("formatDelta", () => {
  it("signs a rise and marks it as up", () => {
    const info = formatDelta(12.5);
    expect(info.direction).toBe("up");
    expect(info.text).toBe("+12.5%");
  });

  it("marks a fall as down and prints one minus sign, not two", () => {
    const info = formatDelta(-3);
    expect(info.direction).toBe("down");
    expect(info.text).toBe("-3%");
  });

  it("treats exactly zero as flat and leaves the number unsigned", () => {
    const info = formatDelta(0);
    expect(info.direction).toBe("flat");
    expect(info.text).toBe("0%");
  });

  it("trims trailing zeros so a round number is not padded with decimals", () => {
    expect(formatDelta(7.0).text).toBe("+7%");
    expect(formatDelta(7.25, { precision: 2 }).text).toBe("+7.25%");
  });

  it("drops the percent sign for an absolute change", () => {
    expect(formatDelta(-42, { unit: "absolute" }).text).toBe("-42");
  });

  it("degrades a non-finite delta to flat zero rather than printing NaN", () => {
    expect(formatDelta(Number.NaN).text).toBe("0%");
    expect(formatDelta(Number.POSITIVE_INFINITY).direction).toBe("flat");
  });

  it("colours a rise green normally and red when the metric is inverted", () => {
    expect(deltaTone("up")).toBe("success");
    expect(deltaTone("up", true)).toBe("danger");
    expect(deltaTone("down", true)).toBe("success");
    expect(deltaTone("flat")).toBe("default");
  });
});

describe("normalizeRating", () => {
  it("rounds to the nearest half when halves are allowed", () => {
    expect(roundToHalf(4.3)).toBe(4.5);
    expect(roundToHalf(4.24)).toBe(4);
    expect(normalizeRating(3.7, 5, true)).toBe(3.5);
  });

  it("rounds to whole stars when halves are not allowed", () => {
    expect(normalizeRating(3.5, 5, false)).toBe(4);
    expect(normalizeRating(3.2, 5, false)).toBe(3);
  });

  it("never paints more stars than there are", () => {
    expect(normalizeRating(9, 5, true)).toBe(5);
    expect(normalizeRating(-2, 5, true)).toBe(0);
  });

  it("survives a missing or broken value from an API", () => {
    expect(normalizeRating(Number.NaN)).toBe(0);
    expect(normalizeRating(3, 0, true)).toBe(3);
  });
});

describe("splitKeys", () => {
  it("splits a combo into one cap per key", () => {
    expect(splitKeys("cmd+k")).toEqual(["cmd", "k"]);
    expect(splitKeys("ctrl+shift+p")).toEqual(["ctrl", "shift", "p"]);
  });

  it("ignores the spaces someone typed around the plus", () => {
    expect(splitKeys(" cmd + k ")).toEqual(["cmd", "k"]);
  });

  it("treats a doubled plus as the plus key itself", () => {
    expect(splitKeys("ctrl++")).toEqual(["ctrl", "+"]);
    expect(splitKeys("+")).toEqual(["+"]);
  });

  it("returns a single cap for a single key and nothing for an empty string", () => {
    expect(splitKeys("Escape")).toEqual(["Escape"]);
    expect(splitKeys("   ")).toEqual([]);
  });
});

describe("tag input", () => {
  it("splits a pasted list on commas and newlines and trims each piece", () => {
    expect(splitTagInput("react, vue ,\n svelte\n")).toEqual(["react", "vue", "svelte"]);
  });

  it("drops the empty piece a trailing separator leaves behind", () => {
    expect(splitTagInput(",,react,,")).toEqual(["react"]);
    expect(splitTagInput("   ")).toEqual([]);
  });

  it("rejects a tag that is already in the list, whatever its case", () => {
    const result = mergeTags(["React"], ["react", "vue"]);
    expect(result.tags).toEqual(["React", "vue"]);
    expect(result.added).toEqual(["vue"]);
    expect(result.rejected).toEqual(["react"]);
  });

  it("keeps both spellings when the caller asked for case sensitivity", () => {
    const result = mergeTags(["React"], ["react"], { caseSensitive: true });
    expect(result.tags).toEqual(["React", "react"]);
  });

  it("rejects a duplicate inside the same paste, not just against the list", () => {
    const result = mergeTags([], splitTagInput("a, b, a"));
    expect(result.tags).toEqual(["a", "b"]);
    expect(result.rejected).toEqual(["a"]);
  });

  it("stops at max and reports everything it refused", () => {
    const result = mergeTags(["a"], ["b", "c", "d"], { max: 2 });
    expect(result.tags).toEqual(["a", "b"]);
    expect(result.rejected).toEqual(["c", "d"]);
  });
});

describe("normalizeMetrics", () => {
  it("scales every bar against the largest row", () => {
    const stats = normalizeMetrics([50, 25, 100]);
    expect(stats.map((s) => s.ratio)).toEqual([0.5, 0.25, 1]);
  });

  it("reports share of the total separately from bar width", () => {
    const stats = normalizeMetrics([75, 25]);
    expect(stats[0]?.ratio).toBe(1);
    expect(stats[0]?.share).toBe(0.75);
    expect(stats[1]?.share).toBe(0.25);
  });

  it("draws nothing rather than dividing by zero on an all-zero list", () => {
    const stats = normalizeMetrics([0, 0]);
    expect(stats.map((s) => s.ratio)).toEqual([0, 0]);
    expect(stats.map((s) => s.share)).toEqual([0, 0]);
  });

  it("treats negative and broken numbers as zero", () => {
    const stats = normalizeMetrics([-10, Number.NaN, 20]);
    expect(stats.map((s) => s.value)).toEqual([0, 0, 20]);
    expect(stats.map((s) => s.ratio)).toEqual([0, 0, 1]);
  });

  it("uses an explicit ceiling so two lists can share one scale", () => {
    const stats = normalizeMetrics([25, 50], 200);
    expect(stats.map((s) => s.ratio)).toEqual([0.125, 0.25]);
  });
});

describe("flattenTree", () => {
  const nodes: TreeNode[] = [
    {
      id: "src",
      label: "src",
      children: [
        { id: "src/app", label: "app", children: [{ id: "src/app/page", label: "page.tsx" }] },
        { id: "src/util", label: "util.ts" },
      ],
    },
    { id: "readme", label: "README.md" },
  ];

  it("lists only the roots while everything is collapsed", () => {
    expect(flattenTree(nodes, []).map((f) => f.id)).toEqual(["src", "readme"]);
  });

  it("walks an expanded branch in the order the Down arrow visits it", () => {
    expect(flattenTree(nodes, ["src", "src/app"]).map((f) => f.id)).toEqual([
      "src",
      "src/app",
      "src/app/page",
      "src/util",
      "readme",
    ]);
  });

  it("skips the children of a collapsed folder even when they are expanded themselves", () => {
    expect(flattenTree(nodes, ["src/app"]).map((f) => f.id)).toEqual(["src", "readme"]);
  });

  it("numbers rows contiguously so an index is a keyboard position", () => {
    const flat = flattenTree(nodes, ["src"]);
    expect(flat.map((f) => f.index)).toEqual([0, 1, 2, 3]);
  });

  it("records depth, parent and branch-ness for each visible row", () => {
    const flat = flattenTree(nodes, ["src"]);
    expect(flat[1]).toMatchObject({ id: "src/app", depth: 1, parentId: "src", hasChildren: true, expanded: false });
    expect(flat[2]).toMatchObject({ id: "src/util", depth: 1, parentId: "src", hasChildren: false });
    expect(flat[0]?.parentId).toBeUndefined();
  });

  it("accepts a Set of expanded ids as well as an array", () => {
    expect(flattenTree(nodes, new Set(["src"])).map((f) => f.id)).toEqual([
      "src",
      "src/app",
      "src/util",
      "readme",
    ]);
  });

  it("counts each level for aria-posinset and aria-setsize", () => {
    const flat = flattenTree(nodes, ["src"]);
    expect(flat[0]).toMatchObject({ posInSet: 1, setSize: 2 });
    expect(flat[1]).toMatchObject({ posInSet: 1, setSize: 2 });
    expect(flat[3]).toMatchObject({ id: "readme", posInSet: 2, setSize: 2 });
  });
});
