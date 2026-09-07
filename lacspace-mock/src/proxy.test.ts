import { describe, it, expect, vi } from "vitest";
import { createProxy, cassetteKey, joinUrl } from "./proxy.js";
import type { FetchLike, RecordedResponse } from "./proxy.js";

function fakeUpstream(body: unknown, status = 200): FetchLike {
  return vi.fn(async () => ({
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })) as unknown as FetchLike;
}

describe("cassetteKey + joinUrl", () => {
  it("keys by METHOD + url", () => {
    expect(cassetteKey("get", "/users?p=1")).toBe("GET /users?p=1");
  });
  it("joins base and path without doubling slashes", () => {
    expect(joinUrl("https://api.example.com/", "/users")).toBe("https://api.example.com/users");
    expect(joinUrl("https://api.example.com", "users")).toBe("https://api.example.com/users");
  });
});

describe("createProxy — record & replay", () => {
  it("record mode hits the upstream and stores the response", async () => {
    const fetch = fakeUpstream({ id: 1 });
    const proxy = createProxy({ target: "https://up", mode: "record", fetch });
    const res = await proxy.handle({ method: "GET", url: "/users/1" });
    expect(res).not.toBeNull();
    expect(JSON.parse((res as RecordedResponse).body)).toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(proxy.cassette["GET /users/1"]).toBeDefined();
  });

  it("auto mode replays a recording without a second upstream call", async () => {
    const fetch = fakeUpstream({ id: 7 });
    const proxy = createProxy({ target: "https://up", mode: "auto", fetch });
    await proxy.handle({ method: "GET", url: "/things" }); // records
    const again = await proxy.handle({ method: "GET", url: "/things" }); // replays
    expect(JSON.parse((again as RecordedResponse).body)).toEqual({ id: 7 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("replay mode never calls the upstream and 504s on a miss", async () => {
    const fetch = fakeUpstream({ id: 1 });
    const proxy = createProxy({
      target: "https://up",
      mode: "replay",
      fetch,
      recordings: { "GET /have": { status: 200, headers: {}, body: '{"ok":true}' } },
    });
    const hit = await proxy.handle({ method: "GET", url: "/have" });
    expect(JSON.parse((hit as RecordedResponse).body)).toEqual({ ok: true });
    const miss = await proxy.handle({ method: "GET", url: "/missing" });
    expect((miss as RecordedResponse).status).toBe(504);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invokes onRecord with the full cassette after recording", async () => {
    const onRecord = vi.fn();
    const proxy = createProxy({ target: "https://up", mode: "record", fetch: fakeUpstream({ a: 1 }), onRecord });
    await proxy.handle({ method: "POST", url: "/x", body: "{}" });
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(Object.keys(onRecord.mock.calls[0]![0])).toContain("POST /x");
  });

  it("returns a 502 when the upstream throws", async () => {
    const fetch = vi.fn(async () => { throw new Error("boom"); }) as unknown as FetchLike;
    const proxy = createProxy({ target: "https://up", mode: "record", fetch });
    const res = await proxy.handle({ method: "GET", url: "/oops" });
    expect((res as RecordedResponse).status).toBe(502);
  });

  it("forwards the request path onto the target base", async () => {
    const fetch = vi.fn(async (url: string) => ({ status: 200, headers: {}, body: url })) as unknown as FetchLike;
    const proxy = createProxy({ target: "https://api.example.com", mode: "record", fetch });
    const res = await proxy.handle({ method: "GET", url: "/users?page=2" });
    expect((res as RecordedResponse).body).toBe("https://api.example.com/users?page=2");
  });
});
