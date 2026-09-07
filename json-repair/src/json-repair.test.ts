import { test, expect } from "vitest";
import {
  extractJson,
  repairJson,
  parseJson,
  safeParseJson,
  parsePartial,
  JsonRepairError,
} from "./index";

test("extractJson: strips a ```json fence", () => {
  const text = 'Sure!\n```json\n{"a":1,"b":[2,3]}\n```\nHope that helps!';
  expect(extractJson(text)).toBe('{"a":1,"b":[2,3]}');
});

test("extractJson: strips a bare ``` fence", () => {
  const text = "```\n[1, 2, 3]\n```";
  expect(extractJson(text)).toBe("[1, 2, 3]");
});

test("extractJson: skips leading and trailing prose", () => {
  const text = 'Here is the data: {"name":"Ada","age":36}. Cheers.';
  expect(extractJson(text)).toBe('{"name":"Ada","age":36}');
});

test("extractJson: braces inside strings do not confuse the scanner", () => {
  const text = 'x {"msg":"a } b { c","ok":true} y';
  expect(extractJson(text)).toBe('{"msg":"a } b { c","ok":true}');
});

test("extractJson: returns undefined when there is no JSON", () => {
  expect(extractJson("just a sentence, nothing structured")).toBeUndefined();
});

test("repairJson: removes trailing commas", () => {
  expect(repairJson('{"a":1,"b":2,}')).toBe('{"a":1,"b":2}');
  expect(repairJson("[1, 2, 3, ]")).toBe("[1,2,3]");
});

test("repairJson: single-quoted strings and unquoted keys", () => {
  expect(JSON.parse(repairJson("{name: 'Ada', role: 'admin'}"))).toEqual({
    name: "Ada",
    role: "admin",
  });
});

test("repairJson: Python literals and non-finite numbers", () => {
  expect(JSON.parse(repairJson('{"a":True,"b":False,"c":None,"d":NaN,"e":Infinity}'))).toEqual({
    a: true,
    b: false,
    c: null,
    d: null,
    e: null,
  });
});

test("repairJson: strips // and /* */ comments", () => {
  const dirty = `{
    // the name
    "name": "Ada", /* inline */ "age": 36
  }`;
  expect(JSON.parse(repairJson(dirty))).toEqual({ name: "Ada", age: 36 });
});

test("repairJson: adds missing commas between elements", () => {
  expect(JSON.parse(repairJson('{"a":1 "b":2}'))).toEqual({ a: 1, b: 2 });
  expect(JSON.parse(repairJson('[1 2 3]'))).toEqual([1, 2, 3]);
});

test("repairJson: closes a truncated object", () => {
  expect(JSON.parse(repairJson('{"a":1,"b":{"c":2'))).toEqual({ a: 1, b: { c: 2 } });
});

test("repairJson: closes a truncated string", () => {
  expect(JSON.parse(repairJson('{"note":"hello wor'))).toEqual({ note: "hello wor" });
});

test("repairJson: nested arrays and objects survive", () => {
  const dirty = "{items: [{id: 1, tags: ['a','b',]}, {id: 2,}],}";
  expect(JSON.parse(repairJson(dirty))).toEqual({
    items: [
      { id: 1, tags: ["a", "b"] },
      { id: 2 },
    ],
  });
});

test("repairJson: valid JSON passes through byte-for-byte", () => {
  const valid = '{"a":1,"b":[2,3],"c":"ok"}';
  expect(repairJson(valid)).toBe(valid);
});

test("parseJson: end-to-end extract + repair + parse", () => {
  const text = 'Response:\n```json\n{ ok: true, items: [1, 2, 3,], note: "done", }\n```';
  expect(parseJson(text)).toEqual({ ok: true, items: [1, 2, 3], note: "done" });
});

test("parseJson: returns fallback instead of throwing", () => {
  expect(parseJson("totally not json", { fallback: { ok: false } })).toEqual({ ok: false });
});

test("parseJson: throws JsonRepairError with a snippet when no fallback", () => {
  let caught: unknown;
  try {
    parseJson("<<< not json at all >>>", { repair: false, extract: false });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(JsonRepairError);
  expect((caught as JsonRepairError).snippet).toContain("not json");
});

test("safeParseJson: ok path", () => {
  const r = safeParseJson('{"x":1,}');
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toEqual({ x: 1 });
});

test("safeParseJson: error path", () => {
  const r = safeParseJson("<<<garbage>>>", { repair: false, extract: false });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toBeInstanceOf(Error);
});

test("parsePartial: half-streamed object yields fields received so far", () => {
  expect(parsePartial('{"title":"Hello","body":"wor')).toEqual({
    title: "Hello",
    body: "wor",
  });
});

test("parsePartial: drops a key whose value has not arrived yet", () => {
  expect(parsePartial('{"title":"Hello","body":')).toEqual({ title: "Hello" });
});

test("parsePartial: streaming array of objects", () => {
  expect(parsePartial('[{"id":1},{"id":2},{"id":')).toEqual([{ id: 1 }, { id: 2 }, {}]);
});

test("parsePartial: returns undefined for empty input", () => {
  expect(parsePartial("")).toBeUndefined();
});

test("does not pollute Object.prototype via __proto__ key", () => {
  const out = parseJson('{"__proto__":{"polluted":"yes"},"safe":"ok"}') as Record<string, unknown>;
  expect(out.safe).toBe("ok");
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
});
