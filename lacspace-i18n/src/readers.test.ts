import { describe, it, expect } from "vitest";
import { parseJson, parseYaml, parseProperties, formatFromPath, ParseError } from "./readers.js";
import { flatten } from "./flatten.js";

describe("formatFromPath", () => {
  it("detects formats by extension", () => {
    expect(formatFromPath("en.json")).toBe("json");
    expect(formatFromPath("a/en.YAML")).toBe("yaml");
    expect(formatFromPath("en.yml")).toBe("yaml");
    expect(formatFromPath("messages.properties")).toBe("properties");
    expect(formatFromPath("readme.md")).toBe(null);
  });
});

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("throws a ParseError on invalid JSON", () => {
    expect(() => parseJson("{bad}")).toThrow(ParseError);
  });
});

describe("parseYaml", () => {
  it("parses nested maps and scalars", () => {
    const y = "nav:\n  home: Home\n  about: About\ncount: 3\nflag: true\nnothing: null\n";
    expect(parseYaml(y)).toEqual({ nav: { home: "Home", about: "About" }, count: 3, flag: true, nothing: null });
  });

  it("parses quoted strings and ignores comments", () => {
    const y = 'greeting: "Hello, {name}"  # a comment\nfr: \'l\'\'utilisateur\'\n';
    expect(parseYaml(y)).toEqual({ greeting: "Hello, {name}", fr: "l'utilisateur" });
  });

  it("parses block sequences of scalars", () => {
    expect(parseYaml("fruits:\n  - apple\n  - banana\n")).toEqual({ fruits: ["apple", "banana"] });
  });

  it("parses sequences of maps", () => {
    const y = "items:\n  - name: a\n    value: 1\n  - name: b\n    value: 2\n";
    expect(parseYaml(y)).toEqual({ items: [{ name: "a", value: 1 }, { name: "b", value: 2 }] });
  });

  it("rejects tab indentation", () => {
    expect(() => parseYaml("a:\n\tb: 1\n")).toThrow(ParseError);
  });

  it("flattens to the same keys as equivalent JSON", () => {
    expect(flatten(parseYaml("a:\n  b: x\n"))).toEqual(flatten({ a: { b: "x" } }));
  });
});

describe("parseProperties", () => {
  it("parses key=value and key:value with dotted keys", () => {
    expect(parseProperties("a.b=1\nc.d : two\n# comment\n! bang\n")).toEqual({ "a.b": "1", "c.d": "two" });
  });

  it("handles unicode and escape sequences", () => {
    expect(parseProperties("greeting=Hi\\ttab\nu=\\u0041")).toEqual({ greeting: "Hi\ttab", u: "A" });
  });

  it("handles line continuations", () => {
    expect(parseProperties("msg=one \\\ntwo")).toEqual({ msg: "one two" });
  });
});
