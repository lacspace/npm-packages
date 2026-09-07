import { describe, it, expect } from "vitest";
import { planBatch } from "./batch.js";

describe("planBatch", () => {
  it("maps a txt list to {name, payload} entries", () => {
    const plan = planBatch("https://a.com\nhttps://b.com\n", "txt");
    expect(plan).toEqual([
      { name: "1", payload: "https://a.com" },
      { name: "2", payload: "https://b.com" },
    ]);
  });

  it("uses the id column as the (safe) name for a csv", () => {
    const plan = planBatch("id,url\nhome page,https://a.com\n", "csv");
    expect(plan).toEqual([{ name: "home_page", payload: "https://a.com" }]);
  });

  it("sanitises unsafe names derived from data", () => {
    const plan = planBatch("https://x.com/a?b=c\n", "txt");
    // line-number id → safe already, but the payload is untouched
    expect(plan[0]!.payload).toBe("https://x.com/a?b=c");
    expect(plan[0]!.name).toBe("1");
  });

  it("returns an empty plan for empty input", () => {
    expect(planBatch("\n\n", "txt")).toEqual([]);
  });
});
