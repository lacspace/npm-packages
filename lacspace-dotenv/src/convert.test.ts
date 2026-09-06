import { describe, it, expect } from "vitest";
import { toJSON, fromJSON, toYAML, fromYAML, renderEnv } from "./convert.js";
import { parseEnv } from "./parse.js";

const MAP = { API_KEY: "abc", PORT: "3000", NOTE: "a: b # c", EMPTY: "" };

describe("JSON round-trip", () => {
  it("toJSON → fromJSON preserves the map", () => {
    expect(fromJSON(toJSON(MAP))).toEqual(MAP);
  });
  it("coerces scalars and rejects non-objects", () => {
    expect(fromJSON('{"A":1,"B":true,"C":null}')).toEqual({ A: "1", B: "true", C: "" });
    expect(() => fromJSON("[1,2]")).toThrow(/object/);
  });
});

describe("YAML round-trip", () => {
  it("toYAML → fromYAML preserves the map", () => {
    expect(fromYAML(toYAML(MAP))).toEqual(MAP);
  });
  it("parses quoted values and skips comments", () => {
    const map = fromYAML("# top\nA: hello\nB: \"x: y\"\nC: 'it''s'\n");
    expect(map).toEqual({ A: "hello", B: "x: y", C: "it's" });
  });
});

describe("renderEnv", () => {
  it("quotes only values that need it and round-trips through the parser", () => {
    const text = renderEnv(MAP);
    expect(text).toContain("API_KEY=abc");
    expect(text).toContain("EMPTY=");
    expect(text).toContain('NOTE="a: b # c"'); // quoted because of space/#
    expect(parseEnv(text).map).toEqual(MAP);
  });
});
