import { describe, it, expect } from "vitest";
import {
  parseBody, parseQuery, serializeCapture, parseCaptureLine, parseCaptureFile,
} from "./capture.js";
import type { CapturedRequest } from "./capture.js";

const sample: CapturedRequest = {
  id: "abc123",
  at: "2026-09-06T00:00:00.000Z",
  method: "POST",
  path: "/hooks/github",
  url: "/hooks/github?ref=main",
  query: { ref: "main" },
  headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
  body: '{"action":"opened"}',
  contentType: "application/json",
  bytes: 19,
};

describe("capture (de)serialization", () => {
  it("round-trips a record through NDJSON", () => {
    const line = serializeCapture(sample);
    expect(line).not.toContain("\n");
    const back = parseCaptureLine(line);
    expect(back).toEqual(sample);
  });
  it("parses a multi-line NDJSON file, skipping blanks", () => {
    const text = [serializeCapture(sample), "", serializeCapture({ ...sample, method: "PUT" }), "  "].join("\n");
    const records = parseCaptureFile(text);
    expect(records).toHaveLength(2);
    expect(records[1]!.method).toBe("PUT");
  });
  it("rejects malformed records", () => {
    expect(() => parseCaptureLine('{"no":"method"}')).toThrow();
  });
  it("fills defaults for a minimal record", () => {
    const rec = parseCaptureLine(JSON.stringify({ method: "get", body: "hi" }));
    expect(rec.method).toBe("get");
    expect(rec.path).toBe("/");
    expect(rec.bytes).toBe(2);
  });
});

describe("parseBody", () => {
  it("parses JSON by content-type", () => {
    const r = parseBody('{"a":1}', "application/json");
    expect(r.kind).toBe("json");
    expect(r.data).toEqual({ a: 1 });
  });
  it("parses vendor +json", () => {
    expect(parseBody('{"a":1}', "application/vnd.github+json").kind).toBe("json");
  });
  it("falls back to text when JSON is invalid", () => {
    const r = parseBody("{not json}", "application/json");
    expect(r.kind).toBe("text");
    expect(r.data).toBe("{not json}");
  });
  it("parses form-urlencoded", () => {
    const r = parseBody("a=1&b=two&a=3", "application/x-www-form-urlencoded");
    expect(r.kind).toBe("form");
    expect(r.data).toEqual({ a: ["1", "3"], b: "two" });
  });
  it("treats plain text as text", () => {
    const r = parseBody("hello there", "text/plain");
    expect(r.kind).toBe("text");
    expect(r.data).toBe("hello there");
  });
  it("sniffs JSON when no content-type is present", () => {
    expect(parseBody('{"x":true}').kind).toBe("json");
    expect(parseBody("just words").kind).toBe("text");
  });
  it("reports an empty body", () => {
    expect(parseBody("", "application/json").kind).toBe("empty");
  });
});

describe("parseQuery", () => {
  it("parses scalars and repeated keys", () => {
    expect(parseQuery("a=1&b=2")).toEqual({ a: "1", b: "2" });
    expect(parseQuery("t=a&t=b&t=c")).toEqual({ t: ["a", "b", "c"] });
    expect(parseQuery("")).toEqual({});
  });
});
