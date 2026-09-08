import { test, expect } from "vitest";
import { extractAllJson, parseAllJson } from "./index";

test("extractAllJson: returns every object scattered through prose", () => {
  expect(extractAllJson('a {"id":1} then {"id":2} end')).toEqual([
    '{"id":1}',
    '{"id":2}',
  ]);
});

test("extractAllJson: pulls JSON from multiple fenced blocks", () => {
  const text = "First:\n```json\n{\"a\":1}\n```\nSecond:\n```json\n[2,3]\n```";
  expect(extractAllJson(text)).toEqual(['{"a":1}', "[2,3]"]);
});

test("extractAllJson: braces inside strings never split a value", () => {
  expect(extractAllJson('{"msg":"a } b"} {"n":2}')).toEqual([
    '{"msg":"a } b"}',
    '{"n":2}',
  ]);
});

test("extractAllJson: a truncated final value is returned as a tail", () => {
  expect(extractAllJson('{"a":1} {"b":')).toEqual(['{"a":1}', '{"b":']);
});

test("extractAllJson: empty array when there is no JSON", () => {
  expect(extractAllJson("just prose, nothing here")).toEqual([]);
  expect(extractAllJson("")).toEqual([]);
});

test("extractAllJson: nested structures counted once, not per bracket", () => {
  expect(extractAllJson('x {"a":[1,{"b":2}]} y {"c":3}')).toEqual([
    '{"a":[1,{"b":2}]}',
    '{"c":3}',
  ]);
});

test("parseAllJson: repairs and parses every embedded value", () => {
  const text = "```json\n{ ok: true, }\n```\nand also [1, 2, 3,]";
  expect(parseAllJson(text)).toEqual([{ ok: true }, [1, 2, 3]]);
});

test("parseAllJson: each piece is repaired independently", () => {
  const text = "{name: 'Ada'}\n{active: True,}";
  expect(parseAllJson(text)).toEqual([{ name: "Ada" }, { active: true }]);
});

test("parseAllJson: a truncated trailing value is repaired and kept", () => {
  expect(parseAllJson('{"a":1} {"b":2,"c":{"d":3')).toEqual([
    { a: 1 },
    { b: 2, c: { d: 3 } },
  ]);
});

test("parseAllJson: fallback option is accepted", () => {
  expect(parseAllJson('{"a":1}', { fallback: null })).toEqual([{ a: 1 }]);
});

test("parseAllJson: empty array for text with no JSON", () => {
  expect(parseAllJson("nothing structured")).toEqual([]);
});
