import { describe, it, expect } from "vitest";
import { toHar, toHarEntry } from "./har.js";
import type { HarEntryInput } from "./har.js";
import type { RequestSpec, ResponseRecord } from "./request.js";

function spec(over: Partial<RequestSpec> = {}): RequestSpec {
  return {
    method: "POST",
    url: "https://api.test/users?page=2&q=cats",
    headers: [["Content-Type", "application/json"], ["Authorization", "Bearer T"]],
    body: '{"name":"Ada"}',
    ...over,
  };
}

function response(over: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    status: 201,
    statusText: "Created",
    headers: { "content-type": "application/json", location: "/users/9" },
    timeMs: 123,
    size: 20,
    body: '{"id":9}',
    url: "https://api.test/users",
    redirected: false,
    redirectChain: [],
    ok: true,
    truncated: false,
    crossHostRedirect: false,
    ...over,
  };
}

const input: HarEntryInput = { spec: spec(), response: response(), startedDateTime: "2026-01-01T00:00:00.000Z" };

describe("toHarEntry", () => {
  it("maps request method, url, headers and body", () => {
    const e = toHarEntry(input);
    expect(e.request.method).toBe("POST");
    expect(e.request.url).toBe("https://api.test/users?page=2&q=cats");
    expect(e.request.headers).toContainEqual({ name: "Content-Type", value: "application/json" });
    expect(e.request.postData).toEqual({ mimeType: "application/json", text: '{"name":"Ada"}' });
    expect(e.request.bodySize).toBe(Buffer.byteLength('{"name":"Ada"}'));
  });

  it("parses the query string from the url", () => {
    const e = toHarEntry(input);
    expect(e.request.queryString).toEqual([
      { name: "page", value: "2" },
      { name: "q", value: "cats" },
    ]);
  });

  it("maps response status, headers, content and redirectURL", () => {
    const e = toHarEntry(input);
    expect(e.response.status).toBe(201);
    expect(e.response.statusText).toBe("Created");
    expect(e.response.content).toEqual({ size: 20, mimeType: "application/json", text: '{"id":9}' });
    expect(e.response.redirectURL).toBe("/users/9");
  });

  it("records timings from timeMs and honours startedDateTime", () => {
    const e = toHarEntry(input);
    expect(e.time).toBe(123);
    expect(e.timings).toEqual({ send: 0, wait: 123, receive: 0 });
    expect(e.startedDateTime).toBe("2026-01-01T00:00:00.000Z");
  });

  it("omits postData for a body-less request", () => {
    const e = toHarEntry({ spec: spec({ method: "GET", body: undefined }), response: response() });
    expect(e.request.postData).toBeUndefined();
    expect(e.request.bodySize).toBe(0);
  });
});

describe("toHar", () => {
  it("produces a valid HAR 1.2 log", () => {
    const har = toHar([input, input]);
    expect(har.log.version).toBe("1.2");
    expect(har.log.creator.name).toBe("lacspace-http");
    expect(har.log.entries).toHaveLength(2);
  });

  it("is JSON-serialisable and round-trips", () => {
    const har = toHar([input]);
    const round = JSON.parse(JSON.stringify(har));
    expect(round.log.entries[0].request.url).toBe(input.spec.url);
  });

  it("allows overriding the creator", () => {
    const har = toHar([], { creatorName: "x", creatorVersion: "9" });
    expect(har.log.creator).toEqual({ name: "x", version: "9" });
    expect(har.log.entries).toEqual([]);
  });
});
