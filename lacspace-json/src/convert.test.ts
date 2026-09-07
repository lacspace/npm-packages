import { describe, it, expect } from "vitest";
import { parseYaml, stringifyYaml } from "./yaml.js";
import { parseToml, stringifyToml } from "./toml.js";
import { parseCsv, stringifyCsv, parseNdjson, stringifyNdjson } from "./csv.js";
import { convert, detectFormat, parseFormat, sanitizeJson } from "./convert.js";
import type { JsonValue } from "./util.js";

const roundtripYaml = (v: JsonValue): JsonValue => parseYaml(stringifyYaml(v));
const roundtripToml = (v: JsonValue): JsonValue => parseToml(stringifyToml(v));

describe("YAML", () => {
  it("parses a block mapping", () => {
    expect(parseYaml("name: Ada\nage: 36\nactive: true")).toEqual({ name: "Ada", age: 36, active: true });
  });
  it("parses nested maps and sequences", () => {
    const y = "server:\n  host: localhost\n  ports:\n    - 80\n    - 443";
    expect(parseYaml(y)).toEqual({ server: { host: "localhost", ports: [80, 443] } });
  });
  it("parses a list of maps", () => {
    const y = "- name: Ada\n  age: 36\n- name: Ivy\n  age: 19";
    expect(parseYaml(y)).toEqual([{ name: "Ada", age: 36 }, { name: "Ivy", age: 19 }]);
  });
  it("parses flow collections", () => {
    expect(parseYaml("nums: [1, 2, 3]\nobj: {a: 1, b: two}")).toEqual({ nums: [1, 2, 3], obj: { a: 1, b: "two" } });
  });
  it("handles null / quoted / comments", () => {
    expect(parseYaml("a: ~\nb: null\nc: \"# not a comment\" # trailing")).toEqual({ a: null, b: null, c: "# not a comment" });
  });
  it("round-trips a nested object", () => {
    const v = { user: { name: "Ada", roles: ["admin", "dev"], meta: { level: 9 } }, ok: true };
    expect(roundtripYaml(v)).toEqual(v);
  });
  it("parses literal block scalar", () => {
    // `|` (clip) keeps a single trailing newline, per YAML
    const y = "text: |\n  line one\n  line two";
    expect(parseYaml(y)).toEqual({ text: "line one\nline two\n" });
  });
});

describe("TOML", () => {
  it("parses keys, tables and arrays", () => {
    const t = 'title = "Demo"\n[owner]\nname = "Ada"\nports = [80, 443]';
    expect(parseToml(t)).toEqual({ title: "Demo", owner: { name: "Ada", ports: [80, 443] } });
  });
  it("parses arrays of tables", () => {
    const t = "[[items]]\nid = 1\n[[items]]\nid = 2";
    expect(parseToml(t)).toEqual({ items: [{ id: 1 }, { id: 2 }] });
  });
  it("parses inline tables and dotted keys", () => {
    const t = "point = { x = 1, y = 2 }\na.b.c = 3";
    expect(parseToml(t)).toEqual({ point: { x: 1, y: 2 }, a: { b: { c: 3 } } });
  });
  it("round-trips nested tables", () => {
    const v = { db: { host: "localhost", port: 5432, opts: { ssl: true } }, tags: ["x", "y"] };
    expect(roundtripToml(v)).toEqual(v);
  });
  it("round-trips arrays of tables", () => {
    const v = { server: [{ name: "a", port: 1 }, { name: "b", port: 2 }] };
    expect(roundtripToml(v)).toEqual(v);
  });
});

describe("CSV + NDJSON", () => {
  it("parses CSV with header into objects", () => {
    expect(parseCsv("name,age\nAda,36\nIvy,19")).toEqual([{ name: "Ada", age: 36 }, { name: "Ivy", age: 19 }]);
  });
  it("handles quoted fields with commas and newlines", () => {
    expect(parseCsv('a,b\n"x,y","line1\nline2"')).toEqual([{ a: "x,y", b: "line1\nline2" }]);
  });
  it("round-trips array of objects", () => {
    const v = [{ name: "Ada", age: 36 }, { name: "Ivy", age: 19 }];
    expect(parseCsv(stringifyCsv(v))).toEqual(v);
  });
  it("NDJSON round-trips", () => {
    const v: JsonValue = [{ a: 1 }, { b: 2 }, [1, 2, 3]];
    expect(parseNdjson(stringifyNdjson(v))).toEqual(v);
  });
});

describe("convert orchestration", () => {
  it("detects formats", () => {
    expect(detectFormat('{"a":1}')).toBe("json");
    expect(detectFormat("a: 1\nb: 2")).toBe("yaml");
    expect(detectFormat("name,age\nAda,36")).toBe("csv");
    expect(detectFormat('{"a":1}\n{"a":2}')).toBe("ndjson");
    expect(detectFormat("[table]\nx = 1")).toBe("toml");
  });
  it("converts JSON to YAML and back", () => {
    const json = '{"name":"Ada","nums":[1,2]}';
    const yaml = convert(json, "json", "yaml");
    expect(parseFormat(yaml, "yaml")).toEqual({ name: "Ada", nums: [1, 2] });
  });
  it("converts TOML to JSON", () => {
    const out = convert('name = "Ada"\nage = 36', "toml", "json");
    expect(JSON.parse(out)).toEqual({ name: "Ada", age: 36 });
  });
  it("sanitizeJson strips prototype-pollution keys", () => {
    const parsed = JSON.parse('{"__proto__":{"admin":true},"ok":1}');
    const clean = sanitizeJson(parsed) as Record<string, unknown>;
    expect(clean["ok"]).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(clean, "__proto__")).toBe(false);
    expect(({} as Record<string, unknown>)["admin"]).toBeUndefined();
  });
});
