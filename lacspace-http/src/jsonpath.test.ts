import { describe, it, expect } from "vitest";
import { evalPath, parseJsonPath } from "./jsonpath.js";

const data = {
  ok: true,
  data: {
    items: [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ],
    "odd key": "spaced",
  },
  token: "abc123",
  nums: [10, 20, 30],
};

describe("parseJsonPath", () => {
  it("parses dotted keys with an optional leading $", () => {
    expect(parseJsonPath("$.data.items")).toEqual([
      { type: "key", key: "data" },
      { type: "key", key: "items" },
    ]);
    expect(parseJsonPath("data.items")).toEqual([
      { type: "key", key: "data" },
      { type: "key", key: "items" },
    ]);
  });

  it("parses array indices and quoted keys", () => {
    expect(parseJsonPath("$.items[0]")).toEqual([
      { type: "key", key: "items" },
      { type: "index", index: 0 },
    ]);
    expect(parseJsonPath("$['odd key']")).toEqual([{ type: "key", key: "odd key" }]);
  });

  it("throws on malformed paths", () => {
    expect(() => parseJsonPath("$.items[x]")).toThrow(/index/i);
    expect(() => parseJsonPath("$['unterminated")).toThrow(/Unterminated/);
  });
});

describe("evalPath", () => {
  it("returns the root for $", () => {
    expect(evalPath(data, "$")).toBe(data);
  });

  it("resolves nested objects and arrays", () => {
    expect(evalPath(data, "$.token")).toBe("abc123");
    expect(evalPath(data, "$.data.items[0].id")).toBe(1);
    expect(evalPath(data, "data.items[1].name")).toBe("b");
    expect(evalPath(data, "$['data']['odd key']")).toBe("spaced");
  });

  it("supports negative indices", () => {
    expect(evalPath(data, "$.nums[-1]")).toBe(30);
    expect(evalPath(data, "$.nums[-3]")).toBe(10);
  });

  it("returns undefined for missing paths", () => {
    expect(evalPath(data, "$.nope")).toBeUndefined();
    expect(evalPath(data, "$.data.items[9].id")).toBeUndefined();
    expect(evalPath(data, "$.token.deep")).toBeUndefined();
  });
});
