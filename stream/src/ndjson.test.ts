import { test, expect } from "vitest";
import { parseNDJSON, parseJSONLines, readableFromString } from "./index";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

test("parseNDJSON parses one object per line", async () => {
  const nd = '{"a":1}\n{"a":2}\n{"a":3}\n';
  const rows = await collect(parseNDJSON<{ a: number }>(readableFromString(nd)));
  expect(rows.map((r) => r.a)).toEqual([1, 2, 3]);
});

test("parseNDJSON emits the final line even without a trailing newline", async () => {
  const nd = '{"a":1}\n{"a":2}';
  const rows = await collect(parseNDJSON<{ a: number }>(readableFromString(nd)));
  expect(rows.map((r) => r.a)).toEqual([1, 2]);
});

test("parseNDJSON skips blank lines and handles CRLF endings", async () => {
  const nd = '{"a":1}\r\n\r\n{"a":2}\r\n';
  const rows = await collect(parseNDJSON<{ a: number }>(readableFromString(nd)));
  expect(rows.map((r) => r.a)).toEqual([1, 2]);
});

test("parseNDJSON buffers across 1-byte chunk boundaries", async () => {
  const nd = '{"msg":"hello"}\n{"msg":"world"}\n';
  const rows = await collect(
    parseNDJSON<{ msg: string }>(readableFromString(nd, 1)),
  );
  expect(rows.map((r) => r.msg)).toEqual(["hello", "world"]);
});

test("parseNDJSON reassembles multi-byte UTF-8 split across chunks", async () => {
  const nd = '{"emoji":"😀€"}\n';
  const rows = await collect(
    parseNDJSON<{ emoji: string }>(readableFromString(nd, 1)),
  );
  expect(rows[0]!.emoji).toBe("😀€");
});

test("parseNDJSON throws on malformed JSON by default", async () => {
  const nd = '{"a":1}\nnot-json\n';
  await expect(collect(parseNDJSON(readableFromString(nd)))).rejects.toThrow();
});

test("parseNDJSON with onError:skip drops malformed lines", async () => {
  const nd = '{"a":1}\nnot-json\n{"a":2}\n';
  const rows = await collect(
    parseNDJSON<{ a: number }>(readableFromString(nd), { onError: "skip" }),
  );
  expect(rows.map((r) => r.a)).toEqual([1, 2]);
});

test("parseNDJSON accepts a raw string and an async iterable", async () => {
  const fromString = await collect(parseNDJSON<number>("1\n2\n3\n"));
  expect(fromString).toEqual([1, 2, 3]);

  async function* gen() {
    yield '{"a":';
    yield "1}\n{";
    yield '"a":2}\n';
  }
  const fromIter = await collect(parseNDJSON<{ a: number }>(gen()));
  expect(fromIter.map((r) => r.a)).toEqual([1, 2]);
});

test("parseJSONLines is an alias for parseNDJSON", async () => {
  expect(parseJSONLines).toBe(parseNDJSON);
});
