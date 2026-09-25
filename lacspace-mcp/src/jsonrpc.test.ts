import { describe, test, expect } from "vitest";
import { LineDecoder, encode, isNotification, isRequest, isResponse } from "./jsonrpc";

describe("LineDecoder", () => {
  test("reassembles messages split across chunks and separates several per chunk", () => {
    const d = new LineDecoder();
    expect(d.push('{"a":1}\n{"b":')).toEqual(['{"a":1}']);
    expect(d.push('2}\r\n\n  \n{"c":3}\n')).toEqual(['{"b":2}', '{"c":3}']);
    expect(d.push('{"tail":true}')).toEqual([]);
    expect(d.flush()).toBe('{"tail":true}');
    expect(d.flush()).toBeUndefined();
  });
});

describe("classification", () => {
  test("request / notification / response", () => {
    expect(isRequest({ jsonrpc: "2.0", id: 1, method: "ping" })).toBe(true);
    expect(isRequest({ jsonrpc: "2.0", id: "abc", method: "ping" })).toBe(true);
    expect(isNotification({ jsonrpc: "2.0", method: "notifications/initialized" })).toBe(true);
    expect(isRequest({ jsonrpc: "2.0", method: "ping" })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: {} })).toBe(true);
    expect(isRequest({ jsonrpc: "1.0", id: 1, method: "ping" })).toBe(false);
  });

  test("encode is one line, newline-terminated, no embedded newlines", () => {
    const line = encode({ jsonrpc: "2.0", id: 1, result: { text: "a\nb" } });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
  });
});
