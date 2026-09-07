import { describe, it, expect } from "vitest";
import { query, queryAll, isValidQuery } from "./query.js";

const data = {
  users: [
    { name: "Ada", age: 36, active: true, tags: ["a", "b"] },
    { name: "Ivy", age: 19, active: false, tags: ["b"] },
    { name: "Ben", age: 41, active: true, tags: [] },
  ],
  count: 3,
  meta: { version: 2 },
};

describe("query paths", () => {
  it("identity returns the whole document", () => {
    expect(query(data, ".")).toEqual(data);
  });
  it("dotted path", () => {
    expect(query(data, ".meta.version")).toBe(2);
  });
  it("array index", () => {
    expect(query(data, ".users[0].name")).toBe("Ada");
  });
  it("negative index", () => {
    expect(query(data, ".users[-1].name")).toBe("Ben");
  });
  it("iterate + project", () => {
    expect(query(data, ".users[].name")).toEqual(["Ada", "Ivy", "Ben"]);
  });
  it("quoted key", () => {
    expect(query({ "a b": 5 }, '.["a b"]')).toBe(5);
  });
  it("missing key yields null", () => {
    expect(query(data, ".nope")).toBe(null);
  });
});

describe("query pipes + select", () => {
  it("select by numeric comparison", () => {
    expect(query(data, ".users[] | select(.age > 21) | .name")).toEqual(["Ada", "Ben"]);
  });
  it("select truthy", () => {
    expect(query(data, ".users[] | select(.active) | .name")).toEqual(["Ada", "Ben"]);
  });
  it("select with and", () => {
    expect(query(data, ".users[] | select(.age > 21 and .active) | .name")).toEqual(["Ada", "Ben"]);
  });
  it("select with or", () => {
    expect(query(data, ".users[] | select(.age < 20 or .age > 40) | .name")).toEqual(["Ivy", "Ben"]);
  });
  it("select with not", () => {
    expect(query(data, ".users[] | select(not .active) | .name")).toBe("Ivy");
  });
  it("equality on string", () => {
    expect(query(data, '.users[] | select(.name == "Ivy") | .age')).toBe(19);
  });
});

describe("query functions", () => {
  it("keys", () => {
    expect(query(data, ".meta | keys")).toEqual(["version"]);
  });
  it("length of array", () => {
    expect(query(data, ".users | length")).toBe(3);
  });
  it("type", () => {
    expect(query(data, ".count | type")).toBe("number");
  });
  it("has", () => {
    expect(query(data, '.meta | has("version")')).toBe(true);
    expect(query(data, '.meta | has("nope")')).toBe(false);
  });
  it("map", () => {
    expect(query(data, ".users | map(.age)")).toEqual([36, 19, 41]);
  });
  it("sort_by", () => {
    expect(query(data, ".users | sort_by(.age) | .[0].name")).toBe("Ivy");
  });
  it("group_by", () => {
    const g = query(data, ".users | group_by(.active)") as unknown[][];
    expect(g.length).toBe(2);
  });
  it("unique", () => {
    expect(query({ xs: [3, 1, 2, 1, 3] }, ".xs | unique")).toEqual([1, 2, 3]);
  });
  it("min/max/sum/avg", () => {
    expect(query(data, ".users | map(.age) | min")).toBe(19);
    expect(query(data, ".users | map(.age) | max")).toBe(41);
    expect(query(data, ".users | map(.age) | sum")).toBe(96);
    expect(query(data, ".users | map(.age) | avg")).toBe(32);
  });
  it("first/last", () => {
    expect(query(data, ".users | first | .name")).toBe("Ada");
    expect(query(data, ".users | last | .name")).toBe("Ben");
  });
  it("reverse + flatten", () => {
    expect(query({ xs: [1, 2, 3] }, ".xs | reverse")).toEqual([3, 2, 1]);
    expect(query({ xs: [[1], [2, 3]] }, ".xs | flatten")).toEqual([1, 2, 3]);
  });
  it("add", () => {
    expect(query({ xs: [1, 2, 3] }, ".xs | add")).toBe(6);
    expect(query({ xs: ["a", "b"] }, ".xs | add")).toBe("ab");
  });
});

describe("query robustness", () => {
  it("queryAll always returns an array", () => {
    expect(queryAll(data, ".meta.version")).toEqual([2]);
  });
  it("rejects invalid syntax", () => {
    expect(isValidQuery(".users[")).toBe(false);
    expect(isValidQuery(".a.b")).toBe(true);
  });
  it("throws on unknown function", () => {
    expect(() => query(data, ".users | bogus")).toThrow();
  });
  it("does not use eval / prototype access", () => {
    // a key literally named __proto__ is just data, never a pollution vector
    expect(query({ a: 1 }, ".a")).toBe(1);
  });
});
