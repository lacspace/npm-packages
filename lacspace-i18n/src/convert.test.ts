import { describe, it, expect } from "vitest";
import {
  convert, parsePo, serializePo, parseToFlat, convertFormatFromPath,
} from "./convert.js";

describe("convertFormatFromPath", () => {
  it("recognises every supported extension", () => {
    expect(convertFormatFromPath("en.json")).toBe("json");
    expect(convertFormatFromPath("en.yaml")).toBe("yaml");
    expect(convertFormatFromPath("en.yml")).toBe("yaml");
    expect(convertFormatFromPath("en.properties")).toBe("properties");
    expect(convertFormatFromPath("en.po")).toBe("po");
    expect(convertFormatFromPath("messages.pot")).toBe("po");
    expect(convertFormatFromPath("en.txt")).toBeNull();
  });
});

describe("parsePo", () => {
  it("parses simple msgid/msgstr pairs and skips the header", () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      "",
      "# a comment",
      'msgid "greeting"',
      'msgstr "Hello"',
      "",
      'msgid "bye"',
      'msgstr "Goodbye"',
    ].join("\n");
    expect(parsePo(po)).toEqual({ greeting: "Hello", bye: "Goodbye" });
  });

  it("folds multi-line continuation strings and decodes escapes", () => {
    const po = ['msgid "multi"', 'msgstr ""', '"line one\\n"', '"line two"'].join("\n");
    expect(parsePo(po)).toEqual({ multi: "line one\nline two" });
  });

  it("folds msgctxt into the key", () => {
    const po = ['msgctxt "menu"', 'msgid "open"', 'msgstr "Open"'].join("\n");
    const flat = parsePo(po);
    const keys = Object.keys(flat);
    expect(keys.length).toBe(1);
    expect(keys[0]!.startsWith("menu")).toBe(true);
    expect(flat[keys[0]!]).toBe("Open");
  });
});

describe("serializePo + round-trip", () => {
  it("emits a header and sorted entries", () => {
    const out = serializePo({ b: "Two", a: "One" });
    expect(out).toContain('msgid "a"');
    expect(out).toContain('msgstr "One"');
    expect(out.indexOf('msgid "a"')).toBeLessThan(out.indexOf('msgid "b"'));
  });

  it("round-trips PO → flat → PO", () => {
    const flat = { greeting: "Hello", "nav.home": "Home", withNewline: "a\nb" };
    const po = serializePo(flat);
    expect(parsePo(po)).toEqual(flat);
  });
});

describe("convert — cross-format round-trips", () => {
  const data = { greeting: "Hello", nav: { home: "Home", about: "About" } };
  const json = JSON.stringify(data);

  it("JSON → PO → JSON preserves keys/values", () => {
    const po = convert(json, "json", "po");
    const back = convert(po, "po", "json");
    expect(JSON.parse(back)).toEqual(data);
  });

  it("JSON → YAML → JSON preserves keys/values", () => {
    const yaml = convert(json, "json", "yaml");
    expect(JSON.parse(convert(yaml, "yaml", "json"))).toEqual(data);
  });

  it("JSON → properties → JSON preserves flat keys", () => {
    const props = convert(json, "json", "properties");
    expect(parseToFlat(props, "properties")).toEqual({
      greeting: "Hello", "nav.home": "Home", "nav.about": "About",
    });
  });

  it("PO → JSON produces nested objects for dotted ids", () => {
    const po = ['msgid "nav.home"', 'msgstr "Home"'].join("\n");
    expect(JSON.parse(convert(po, "po", "json"))).toEqual({ nav: { home: "Home" } });
  });
});
