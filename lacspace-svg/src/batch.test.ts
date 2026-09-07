import { describe, it, expect } from "vitest";
import { batchOptimize } from "./batch.js";

describe("batchOptimize", () => {
  const inputs = [
    { path: "a.svg", content: `<svg><!-- a big comment --><rect id="unused"/></svg>` },
    { path: "b.svg", content: `<svg><g></g><rect fill="#ffffff"/></svg>` },
  ];

  it("returns a per-file result for every input", () => {
    const { files } = batchOptimize(inputs);
    expect(files.map((f) => f.path)).toEqual(["a.svg", "b.svg"]);
    for (const f of files) expect(f.after).toBeLessThan(f.before);
  });

  it("aggregates totals across the batch", () => {
    const { files, total } = batchOptimize(inputs);
    expect(total.count).toBe(2);
    expect(total.before).toBe(files.reduce((s, f) => s + f.before, 0));
    expect(total.after).toBe(files.reduce((s, f) => s + f.after, 0));
    expect(total.saved).toBe(total.before - total.after);
  });

  it("computes a total percentage saved", () => {
    const { total } = batchOptimize(inputs);
    const expected = Math.round(((total.before - total.after) / total.before) * 1000) / 10;
    expect(total.savedPct).toBe(expected);
    expect(total.savedPct).toBeGreaterThan(0);
  });

  it("handles an empty batch without dividing by zero", () => {
    const { files, total } = batchOptimize([]);
    expect(files).toEqual([]);
    expect(total).toEqual({ count: 0, before: 0, after: 0, saved: 0, savedPct: 0 });
  });

  it("passes optimize options through", () => {
    const { files } = batchOptimize(
      [{ path: "p.svg", content: `<svg><path d="M0.12345 0.98765"/></svg>` }],
      { precision: 1 },
    );
    expect(files[0]!.data).toContain("0.1");
    expect(files[0]!.data).not.toContain("0.12345");
  });
});
